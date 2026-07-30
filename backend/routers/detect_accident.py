"""
POST /detect-accident — dynamic hospital search and emergency response orchestration.
"""

from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database.session import get_db
from database.models import AlertLog
from services.hospital_search import search_nearby_hospitals
from services.hospital_selector import enrich_hospitals_with_routes, select_nearest_hospital
from services.routing import calculate_route
from services.registry_matcher import find_registered_match
from services.notifications import notify_registered_hospital

router = APIRouter(tags=["Emergency Response"])


class DetectAccidentRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    address: Optional[str] = None


@router.post("/detect-accident")
async def detect_accident(body: DetectAccidentRequest, db: Session = Depends(get_db)):
    """
    Given accident coordinates, dynamically find nearby hospitals worldwide,
    select the best match, compute route, and notify registered hospitals.
    """
    lat, lon = body.latitude, body.longitude
    severity = body.severity.upper()
    # Map CRITICAL to HIGH for trauma-center selection
    selection_severity = "HIGH" if severity in ("HIGH", "CRITICAL") else severity

    # 1. Dynamic hospital search (OSM or Google Places — no static data)
    hospitals = search_nearby_hospitals(lat, lon, radius_m=15000, limit=10)

    if not hospitals:
        return {
            "accident": {
                "latitude": lat,
                "longitude": lon,
                "severity": severity,
                "address": body.address,
            },
            "nearestHospital": None,
            "topHospitals": [],
            "route": None,
            "integration": {
                "registered": False,
                "message": "No hospitals found within 15 km. Try a different location.",
            },
        }

    # 2. Enrich top hospitals with routes and ETA
    top_hospitals = enrich_hospitals_with_routes(
        lat, lon, hospitals, calculate_route, top_n=5
    )

    # 3. Automatic hospital selection
    selected, reason = select_nearest_hospital(hospitals, selection_severity)

    # 4. Full route for selected hospital
    route = calculate_route(
        lat, lon,
        selected["latitude"], selected["longitude"],
        selected["name"],
    ) if selected else None

    # 5. Check hospital registry integration
    registry = None
    integration_message = ""
    notification_status = {}

    if selected:
        registry = find_registered_match(
            db,
            selected["latitude"],
            selected["longitude"],
            selected["name"],
        )

        if registry:
            integration_message = f"Alert sent to registered partner: {registry.name}"
            alert_payload = {
                "type": "accident_alert",
                "severity": severity,
                "latitude": lat,
                "longitude": lon,
                "accident_location": body.address or f"{lat}, {lon}",
                "distance_km": selected.get("distance_km"),
                "eta_minutes": route.get("eta_minutes") if route else None,
                "hospital_name": selected["name"],
                "dashboard_url": registry.dashboard_url,
                "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
            }
            notification_status = await notify_registered_hospital(
                registry.id,
                registry.email,
                registry.fcm_token,
                alert_payload,
            )

    # 6. Audit log
    if selected:
        log = AlertLog(
            accident_lat=lat,
            accident_lon=lon,
            severity=severity,
            hospital_name=selected["name"],
            hospital_lat=selected["latitude"],
            hospital_lon=selected["longitude"],
            is_registered=registry is not None,
            registry_id=registry.id if registry else None,
            notification_status=str(notification_status),
        )
        db.add(log)
        db.commit()

    return {
        "accident": {
            "latitude": lat,
            "longitude": lon,
            "severity": severity,
            "address": body.address,
        },
        "nearestHospital": {
            **selected,
            "selection_reason": reason,
            "eta_minutes": route.get("eta_minutes") if route else None,
            "route_distance_km": route.get("distance_km") if route else None,
            "maps_url": selected.get("maps_url"),
            "is_registered": registry is not None,
            "registry_id": registry.id if registry else None,
        } if selected else None,
        "topHospitals": top_hospitals,
        "route": route,
        "integration": {
            "registered": registry is not None,
            "message": integration_message if registry else "",
            "notifications": notification_status,
        },
    }


@router.post("/api/route")
async def api_route(body: dict):
    """Legacy route endpoint used by frontend routeOptimizer."""
    route = calculate_route(
        float(body["source_lat"]),
        float(body["source_lon"]),
        float(body["dest_lat"]),
        float(body["dest_lon"]),
        body.get("hospital_name", ""),
    )
    return {
        "hospital_name": route.get("hospital_name", body.get("hospital_name", "")),
        "distance_km": route["distance_km"],
        "eta_minutes": route["eta_minutes"],
        "polyline": route["polyline"],
        "is_fallback": route.get("is_fallback", False),
    }

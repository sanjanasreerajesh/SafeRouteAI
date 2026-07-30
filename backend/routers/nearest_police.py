"""
POST /nearest-police — dynamic police station search and emergency dispatch.
"""

from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database.session import get_db
from database.models import PoliceAlertLog
from services.police_search import search_nearby_police_stations
from services.police_selector import enrich_stations_with_routes, select_nearest_police_station
from services.routing import calculate_route
from services.police_registry_matcher import find_registered_police_match
from services.police_notifications import notify_registered_police

router = APIRouter(tags=["Police Response"])


class NearestPoliceRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    address: Optional[str] = None


@router.post("/nearest-police")
async def nearest_police(body: NearestPoliceRequest, db: Session = Depends(get_db)):
    """
    Given accident coordinates, dynamically find nearby police stations worldwide,
    select the nearest, compute route, and notify registered stations.
    """
    lat, lon = body.latitude, body.longitude
    severity = body.severity.upper()

    # 1. Dynamic police search — expands radius up to 100 km if needed
    stations, search_radius_m = search_nearby_police_stations(lat, lon, radius_m=15000, limit=10)
    search_radius_km = round(search_radius_m / 1000)

    if not stations:
        return {
            "accident": {
                "latitude": lat,
                "longitude": lon,
                "severity": severity,
                "address": body.address,
            },
            "nearestPoliceStation": None,
            "topPoliceStations": [],
            "route": None,
            "integration": {
                "registered": False,
                "message": "No police stations found within 100 km of this location.",
            },
        }

    # 2. Enrich top stations with routes and ETA
    top_stations = enrich_stations_with_routes(
        lat, lon, stations, calculate_route, top_n=5
    )

    # 3. Automatic police station selection
    selected, reason = select_nearest_police_station(stations, severity)

    # 4. Full route to selected station
    route = calculate_route(
        lat, lon,
        selected["latitude"], selected["longitude"],
        selected["name"],
    ) if selected else None

    # 5. Check police registry integration
    registry = None
    integration_message = "Police station not integrated with SafeRoute AI."
    if search_radius_m > 15_000:
        integration_message = (
            f"Nearest police station found within {search_radius_km} km. "
            "Police station not integrated with SafeRoute AI."
        )
    notification_status = {}

    if selected:
        registry = find_registered_police_match(
            db,
            selected["latitude"],
            selected["longitude"],
            selected["name"],
        )

        if registry:
            integration_message = f"Alert sent to registered partner: {registry.name}"
            if search_radius_m > 15_000:
                integration_message += f" (found within {search_radius_km} km)"
            alert_payload = {
                "type": "police_accident_alert",
                "severity": severity,
                "latitude": lat,
                "longitude": lon,
                "accident_location": body.address or f"{lat}, {lon}",
                "distance_km": selected.get("distance_km"),
                "eta_minutes": route.get("eta_minutes") if route else None,
                "police_station_name": selected["name"],
                "dashboard_url": registry.dashboard_url,
                "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
            }
            notification_status = await notify_registered_police(
                registry.id,
                registry.email,
                registry.fcm_token,
                alert_payload,
            )

    # 6. Audit log
    if selected:
        log = PoliceAlertLog(
            accident_lat=lat,
            accident_lon=lon,
            severity=severity,
            police_name=selected["name"],
            police_lat=selected["latitude"],
            police_lon=selected["longitude"],
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
        "nearestPoliceStation": {
            **selected,
            "selection_reason": reason,
            "eta_minutes": route.get("eta_minutes") if route else None,
            "route_distance_km": route.get("distance_km") if route else None,
            "maps_url": selected.get("maps_url"),
            "is_registered": registry is not None,
            "registry_id": registry.id if registry else None,
        } if selected else None,
        "topPoliceStations": top_stations,
        "route": route,
        "search_radius_km": search_radius_km,
        "integration": {
            "registered": registry is not None,
            "message": integration_message,
            "notifications": notification_status,
        },
    }

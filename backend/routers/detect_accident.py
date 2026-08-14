"""
POST /detect-accident — dynamic hospital search and emergency response orchestration.
"""

from __future__ import annotations

import asyncio
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database.session import SessionLocal, get_db
from database.models import AlertLog
from services.hospital_search import search_nearby_hospitals
from services.hospital_selector import enrich_hospitals_with_routes, select_nearest_hospital
from services.routing import calculate_route
from services.registry_matcher import find_registered_match
from services.notifications import notify_registered_hospital
from services.request_coalescer import coalesce, make_key

router = APIRouter(tags=["Emergency Response"])


class DetectAccidentRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    address: Optional[str] = None


async def _noop_none():
    return None


async def _search_hospitals_and_route(lat: float, lon: float, selection_severity: str) -> dict:
    """
    The actual (expensive, Overpass/OSRM-backed) hospital search + selection +
    route computation for one location. Wrapped by `coalesce()` below so that
    several near-simultaneous callers asking about the *same* accident (video
    panel, emergency dashboard, hospital dashboard refresh, police dashboard
    refresh) share a single network round-trip instead of each hammering the
    free Overpass API and randomly failing for some of them.
    """
    hospitals = await run_in_threadpool(
        search_nearby_hospitals, lat, lon, radius_m=15000, limit=10
    )
    if not hospitals:
        return {"hospitals": [], "top_hospitals": [], "selected": None, "reason": None, "route": None}

    selected, reason = select_nearest_hospital(hospitals, selection_severity)

    top_hospitals_task = run_in_threadpool(
        enrich_hospitals_with_routes, lat, lon, hospitals, calculate_route, top_n=5
    )
    route_task = (
        run_in_threadpool(
            calculate_route, lat, lon, selected["latitude"], selected["longitude"], selected["name"]
        )
        if selected
        else _noop_none()
    )
    top_hospitals, route = await asyncio.gather(top_hospitals_task, route_task)

    return {
        "hospitals": hospitals,
        "top_hospitals": top_hospitals,
        "selected": selected,
        "reason": reason,
        "route": route,
    }


async def _finalize_hospital_alert(
    accident_lat: float,
    accident_lon: float,
    severity: str,
    accident_address: Optional[str],
    hospital_name: str,
    hospital_lat: float,
    hospital_lon: float,
    distance_km: Optional[float],
    eta_minutes: Optional[float],
    registry_id: Optional[str],
    registry_email: Optional[str],
    registry_fcm_token: Optional[str],
    registry_dashboard_url: Optional[str],
) -> None:
    """
    Runs AFTER the HTTP response has already been sent (FastAPI BackgroundTasks):
    delivers the registered-hospital notification (websocket/email/FCM — all
    potentially slow network I/O) and writes the audit log. Never blocks the
    caller waiting for hospital assignment/route, which is what the frontend
    actually needs synchronously.
    """
    notification_status: dict = {}

    if registry_id and registry_email:
        alert_payload = {
            "type": "accident_alert",
            "severity": severity,
            "latitude": accident_lat,
            "longitude": accident_lon,
            "accident_location": accident_address or f"{accident_lat}, {accident_lon}",
            "distance_km": distance_km,
            "eta_minutes": eta_minutes,
            "hospital_name": hospital_name,
            "dashboard_url": registry_dashboard_url,
            "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
        }
        notification_status = await notify_registered_hospital(
            registry_id, registry_email, registry_fcm_token, alert_payload
        )

    # Use a fresh session — the request-scoped one from Depends(get_db) is closed
    # by the time background tasks run.
    db = SessionLocal()
    try:
        log = AlertLog(
            accident_lat=accident_lat,
            accident_lon=accident_lon,
            severity=severity,
            hospital_name=hospital_name,
            hospital_lat=hospital_lat,
            hospital_lon=hospital_lon,
            is_registered=registry_id is not None,
            registry_id=registry_id,
            notification_status=str(notification_status),
        )
        db.add(log)
        db.commit()
    finally:
        db.close()


@router.post("/detect-accident")
async def detect_accident(
    body: DetectAccidentRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Given accident coordinates, dynamically find nearby hospitals worldwide,
    select the best match, compute route, and notify registered hospitals.

    Hospital search / routing (Overpass, OSRM, Google) are blocking network
    calls, so they run in a worker thread instead of the event loop. The
    actual notification delivery + audit log write happen in a background
    task after the response is sent — the caller only waits for what it
    needs to render (hospital + route), not for email/FCM/DB bookkeeping.
    """
    lat, lon = body.latitude, body.longitude
    severity = body.severity.upper()
    # Map CRITICAL to HIGH for trauma-center selection
    selection_severity = "HIGH" if severity in ("HIGH", "CRITICAL") else severity

    # 1-4. Search, select, enrich, and route — coalesced so multiple pages
    # asking about the same accident within a few seconds of each other share
    # one real lookup instead of racing the free Overpass/OSRM APIs.
    lookup = await coalesce(
        make_key("hospital", lat, lon, selection_severity),
        lambda: _search_hospitals_and_route(lat, lon, selection_severity),
    )
    hospitals = lookup["hospitals"]
    top_hospitals = lookup["top_hospitals"]
    selected = lookup["selected"]
    reason = lookup["reason"]
    route = lookup["route"]

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

    # 5. Check hospital registry integration (DB query — offloaded too)
    registry = None
    integration_message = ""

    if selected:
        registry = await run_in_threadpool(
            find_registered_match,
            db,
            selected["latitude"],
            selected["longitude"],
            selected["name"],
        )
        if registry:
            integration_message = f"Alert sent to registered partner: {registry.name}"

        # Notification delivery + audit log happen after the response is sent.
        background_tasks.add_task(
            _finalize_hospital_alert,
            lat,
            lon,
            severity,
            body.address,
            selected["name"],
            selected["latitude"],
            selected["longitude"],
            selected.get("distance_km"),
            route.get("eta_minutes") if route else None,
            registry.id if registry else None,
            registry.email if registry else None,
            registry.fcm_token if registry else None,
            registry.dashboard_url if registry else None,
        )

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
            # Actual per-channel delivery result is written to the audit log
            # in the background; not awaited here so the response stays fast.
            "notifications": {},
        },
    }


@router.post("/api/route")
async def api_route(body: dict):
    """Legacy route endpoint used by frontend routeOptimizer."""
    route = await run_in_threadpool(
        calculate_route,
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

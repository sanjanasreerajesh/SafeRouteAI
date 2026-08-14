"""
POST /nearest-police — dynamic police station search and emergency dispatch.
"""

from __future__ import annotations

import asyncio
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database.session import SessionLocal, get_db
from database.models import PoliceAlertLog
from services.police_search import search_nearby_police_stations
from services.police_selector import enrich_stations_with_routes, select_nearest_police_station
from services.routing import calculate_route
from services.police_registry_matcher import find_registered_police_match
from services.police_notifications import notify_registered_police
from services.request_coalescer import coalesce, make_key

router = APIRouter(tags=["Police Response"])


class NearestPoliceRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    address: Optional[str] = None


async def _noop_none():
    return None


async def _search_police_and_route(lat: float, lon: float, severity: str) -> dict:
    """
    The actual (expensive, Overpass/OSRM-backed) police search + selection +
    route computation for one location. Wrapped by `coalesce()` below so that
    several near-simultaneous callers asking about the *same* accident (video
    panel, hospital dashboard refresh, police dashboard refresh) share a
    single network round-trip instead of each hammering the free Overpass API
    and randomly failing for some of them.
    """
    stations, search_radius_m = await run_in_threadpool(
        search_nearby_police_stations, lat, lon, radius_m=15000, limit=10
    )
    if not stations:
        return {
            "stations": [],
            "search_radius_m": search_radius_m,
            "top_stations": [],
            "selected": None,
            "reason": None,
            "route": None,
        }

    selected, reason = select_nearest_police_station(stations, severity)

    top_stations_task = run_in_threadpool(
        enrich_stations_with_routes, lat, lon, stations, calculate_route, top_n=5
    )
    route_task = (
        run_in_threadpool(
            calculate_route, lat, lon, selected["latitude"], selected["longitude"], selected["name"]
        )
        if selected
        else _noop_none()
    )
    top_stations, route = await asyncio.gather(top_stations_task, route_task)

    return {
        "stations": stations,
        "search_radius_m": search_radius_m,
        "top_stations": top_stations,
        "selected": selected,
        "reason": reason,
        "route": route,
    }


async def _finalize_police_alert(
    accident_lat: float,
    accident_lon: float,
    severity: str,
    accident_address: Optional[str],
    police_name: str,
    police_lat: float,
    police_lon: float,
    distance_km: Optional[float],
    eta_minutes: Optional[float],
    registry_id: Optional[str],
    registry_email: Optional[str],
    registry_fcm_token: Optional[str],
    registry_dashboard_url: Optional[str],
) -> None:
    """
    Runs AFTER the HTTP response has already been sent (FastAPI BackgroundTasks):
    delivers the registered-police notification (websocket/email/FCM) and writes
    the audit log, without making the caller wait on that network I/O.
    """
    notification_status: dict = {}

    if registry_id and registry_email:
        alert_payload = {
            "type": "police_accident_alert",
            "severity": severity,
            "latitude": accident_lat,
            "longitude": accident_lon,
            "accident_location": accident_address or f"{accident_lat}, {accident_lon}",
            "distance_km": distance_km,
            "eta_minutes": eta_minutes,
            "police_station_name": police_name,
            "dashboard_url": registry_dashboard_url,
            "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
        }
        notification_status = await notify_registered_police(
            registry_id, registry_email, registry_fcm_token, alert_payload
        )

    # Fresh session — the request-scoped one from Depends(get_db) is closed by
    # the time background tasks run.
    db = SessionLocal()
    try:
        log = PoliceAlertLog(
            accident_lat=accident_lat,
            accident_lon=accident_lon,
            severity=severity,
            police_name=police_name,
            police_lat=police_lat,
            police_lon=police_lon,
            is_registered=registry_id is not None,
            registry_id=registry_id,
            notification_status=str(notification_status),
        )
        db.add(log)
        db.commit()
    finally:
        db.close()


@router.post("/nearest-police")
async def nearest_police(
    body: NearestPoliceRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Given accident coordinates, dynamically find nearby police stations worldwide,
    select the nearest, compute route, and notify registered stations.

    Search/routing are blocking network calls, so they run in a worker thread
    instead of the event loop. Notification delivery + audit log write happen
    in a background task after the response is sent.
    """
    lat, lon = body.latitude, body.longitude
    severity = body.severity.upper()

    # 1-4. Search, select, enrich, and route — coalesced so multiple pages
    # asking about the same accident within a few seconds of each other share
    # one real lookup instead of racing the free Overpass/OSRM APIs.
    lookup = await coalesce(
        make_key("police", lat, lon, severity),
        lambda: _search_police_and_route(lat, lon, severity),
    )
    stations = lookup["stations"]
    search_radius_m = lookup["search_radius_m"]
    top_stations = lookup["top_stations"]
    selected = lookup["selected"]
    reason = lookup["reason"]
    route = lookup["route"]
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

    # 5. Check police registry integration (DB query — offloaded too)
    registry = None
    integration_message = "Police station not integrated with SafeRoute AI."
    if search_radius_m > 15_000:
        integration_message = (
            f"Nearest police station found within {search_radius_km} km. "
            "Police station not integrated with SafeRoute AI."
        )

    if selected:
        registry = await run_in_threadpool(
            find_registered_police_match,
            db,
            selected["latitude"],
            selected["longitude"],
            selected["name"],
        )

        if registry:
            integration_message = f"Alert sent to registered partner: {registry.name}"
            if search_radius_m > 15_000:
                integration_message += f" (found within {search_radius_km} km)"

        # Notification delivery + audit log happen after the response is sent.
        background_tasks.add_task(
            _finalize_police_alert,
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
            # Actual per-channel delivery result is written to the audit log
            # in the background; not awaited here so the response stays fast.
            "notifications": {},
        },
    }

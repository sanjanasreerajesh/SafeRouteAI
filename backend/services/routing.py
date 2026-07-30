"""
Route calculation — Google Directions when key available, OSRM fallback (free, worldwide).
"""

from __future__ import annotations

import json
import math
import os
import urllib.error
import urllib.request
from typing import Any, Dict, List, Tuple

from maps.google_maps import get_directions_google

OSRM_URL = "https://router.project-osrm.org/route/v1/driving"
EMERGENCY_SPEED_KMH = 45


def calculate_route(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    hospital_name: str = "",
) -> Dict[str, Any]:
    """
    Calculate fastest driving route and ETA between accident and hospital.
    """
    api_key = os.getenv("GOOGLE_MAPS_API_KEY") or os.getenv("GOOGLE_DIRECTIONS_API_KEY")

    if api_key:
        google_route = get_directions_google(
            origin_lat, origin_lon, dest_lat, dest_lon, api_key
        )
        if google_route:
            google_route["hospital_name"] = hospital_name
            return google_route

    osrm_route = _route_osrm(origin_lat, origin_lon, dest_lat, dest_lon)
    if osrm_route:
        osrm_route["hospital_name"] = hospital_name
        return osrm_route

    return _route_estimate(origin_lat, origin_lon, dest_lat, dest_lon, hospital_name)


def _route_osrm(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
) -> Dict[str, Any] | None:
    url = (
        f"{OSRM_URL}/{origin_lon},{origin_lat};{dest_lon},{dest_lat}"
        "?overview=full&geometries=geojson&steps=false"
    )
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
        if data.get("code") != "Ok" or not data.get("routes"):
            return None
        route = data["routes"][0]
        polyline: List[List[float]] = [
            [c[1], c[0]] for c in route["geometry"]["coordinates"]
        ]
        return {
            "distance_km": round(route["distance"] / 1000, 2),
            "eta_minutes": round(route["duration"] / 60, 1),
            "polyline": polyline,
            "is_fallback": False,
            "provider": "osrm",
        }
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError):
        return None


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2) ** 2
    )
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _route_estimate(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    hospital_name: str,
) -> Dict[str, Any]:
    dist = _haversine_km(origin_lat, origin_lon, dest_lat, dest_lon)
    return {
        "hospital_name": hospital_name,
        "distance_km": round(dist, 2),
        "eta_minutes": round((dist / EMERGENCY_SPEED_KMH) * 60, 1),
        "polyline": [[origin_lat, origin_lon], [dest_lat, dest_lon]],
        "is_fallback": True,
        "provider": "estimate",
    }

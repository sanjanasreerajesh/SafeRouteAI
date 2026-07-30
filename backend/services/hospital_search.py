"""
Hospital search — dynamic worldwide lookup.
Uses Google Places when GOOGLE_MAPS_API_KEY is set, otherwise OpenStreetMap Overpass (free).
"""

from __future__ import annotations

import math
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

from maps.google_maps import search_hospitals_google
from maps.osm import search_hospitals_osm


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres."""
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


def _normalize_hospital(raw: Dict[str, Any], accident_lat: float, accident_lon: float) -> Dict[str, Any]:
    lat = float(raw["latitude"])
    lon = float(raw["longitude"])
    dist = haversine_km(accident_lat, accident_lon, lat, lon)
    return {
        "name": raw.get("name") or "Unknown Hospital",
        "address": raw.get("address") or "",
        "latitude": lat,
        "longitude": lon,
        "phone": raw.get("phone"),
        "place_id": raw.get("place_id"),
        "is_trauma_center": bool(raw.get("is_trauma_center", False)),
        "distance_km": round(dist, 2),
        "maps_url": (
            f"https://www.google.com/maps/dir/?api=1"
            f"&origin={accident_lat},{accident_lon}"
            f"&destination={lat},{lon}"
            f"&travelmode=driving"
        ),
    }


def search_nearby_hospitals(
    latitude: float,
    longitude: float,
    radius_m: int = 10000,
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """
    Search hospitals near coordinates worldwide.
    Returns list sorted by distance (nearest first).
    """
    api_key = os.getenv("GOOGLE_MAPS_API_KEY") or os.getenv("GOOGLE_PLACES_API_KEY")
    raw_hospitals: List[Dict[str, Any]] = []

    if api_key:
        try:
            raw_hospitals = search_hospitals_google(latitude, longitude, radius_m, api_key)
        except Exception as exc:
            print(f"Google Places search failed, falling back to OSM: {exc}")

    if not raw_hospitals:
        raw_hospitals = search_hospitals_osm(latitude, longitude, radius_m)

    normalized = [_normalize_hospital(h, latitude, longitude) for h in raw_hospitals]
    normalized.sort(key=lambda h: h["distance_km"])
    return normalized[:limit]

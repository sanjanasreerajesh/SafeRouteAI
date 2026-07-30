"""
Police station search — dynamic worldwide lookup.
Uses Google Places when API key is set, otherwise OpenStreetMap Overpass (free).
Expands search radius automatically when no stations are found nearby.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Tuple

from maps.google_maps import search_police_google
from maps.osm import search_police_osm
from services.hospital_search import haversine_km

# Progressive radii (metres) — keeps expanding until stations are found
SEARCH_RADII_M = [15_000, 30_000, 50_000, 75_000, 100_000]


def _normalize_station(
    raw: Dict[str, Any], accident_lat: float, accident_lon: float
) -> Dict[str, Any]:
    lat = float(raw["latitude"])
    lon = float(raw["longitude"])
    dist = haversine_km(accident_lat, accident_lon, lat, lon)
    return {
        "name": raw.get("name") or "Unknown Police Station",
        "address": raw.get("address") or "",
        "latitude": lat,
        "longitude": lon,
        "phone": raw.get("phone"),
        "place_id": raw.get("place_id"),
        "distance_km": round(dist, 2),
        "maps_url": (
            f"https://www.google.com/maps/dir/?api=1"
            f"&origin={accident_lat},{accident_lon}"
            f"&destination={lat},{lon}"
            f"&travelmode=driving"
        ),
    }


def _search_at_radius(
    latitude: float,
    longitude: float,
    radius_m: int,
    api_key: str | None,
) -> List[Dict[str, Any]]:
    """Run one search pass at a given radius."""
    raw_stations: List[Dict[str, Any]] = []

    if api_key:
        try:
            # Google Places max radius is 50 km
            google_radius = min(radius_m, 50_000)
            raw_stations = search_police_google(
                latitude, longitude, google_radius, api_key
            )
        except Exception as exc:
            print(f"Google Places police search failed: {exc}")

    if not raw_stations:
        raw_stations = search_police_osm(latitude, longitude, radius_m)

    return raw_stations


def search_nearby_police_stations(
    latitude: float,
    longitude: float,
    radius_m: int = 15_000,
    limit: int = 10,
) -> Tuple[List[Dict[str, Any]], int]:
    """
    Search police stations near coordinates worldwide.
    Expands radius (15 → 30 → 50 → 75 → 100 km) until results are found.
    Returns (stations sorted by distance, radius_used_metres).
    """
    api_key = os.getenv("GOOGLE_MAPS_API_KEY") or os.getenv("GOOGLE_PLACES_API_KEY")

    # Build radius list starting from requested radius, then expand
    radii = [radius_m] + [r for r in SEARCH_RADII_M if r > radius_m]
    seen_place_ids: set[str] = set()
    all_raw: List[Dict[str, Any]] = []
    radius_used = radius_m

    for r in radii:
        batch = _search_at_radius(latitude, longitude, r, api_key)
        for station in batch:
            pid = station.get("place_id") or f"{station.get('latitude')}:{station.get('longitude')}"
            if pid in seen_place_ids:
                continue
            seen_place_ids.add(pid)
            all_raw.append(station)

        if all_raw:
            radius_used = r
            break

    normalized = [_normalize_station(s, latitude, longitude) for s in all_raw]
    normalized.sort(key=lambda s: s["distance_km"])
    return normalized[:limit], radius_used

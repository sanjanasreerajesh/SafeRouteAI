"""
Google Maps Places API — optional paid provider when API key is configured.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Dict, List


def search_hospitals_google(
    lat: float,
    lon: float,
    radius_m: int,
    api_key: str,
) -> List[Dict[str, Any]]:
    """Nearby hospital search via Google Places API."""
    url = (
        "https://maps.googleapis.com/maps/api/place/nearbysearch/json?"
        f"location={lat},{lon}&radius={radius_m}&type=hospital&key={api_key}"
    )
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode())

    if data.get("status") not in ("OK", "ZERO_RESULTS"):
        raise RuntimeError(f"Google Places error: {data.get('status')}")

    hospitals: List[Dict[str, Any]] = []
    for place in data.get("results", []):
        loc = place.get("geometry", {}).get("location", {})
        name = place.get("name", "Hospital")
        name_lower = name.lower()
        hospitals.append({
            "name": name,
            "address": place.get("vicinity") or place.get("formatted_address", ""),
            "latitude": loc.get("lat"),
            "longitude": loc.get("lng"),
            "phone": None,  # requires Place Details call
            "place_id": place.get("place_id"),
            "is_trauma_center": any(
                kw in name_lower for kw in ("trauma", "emergency", "casualty")
            ),
        })
    return hospitals


def search_police_google(
    lat: float,
    lon: float,
    radius_m: int,
    api_key: str,
) -> List[Dict[str, Any]]:
    """Nearby police station search via Google Places API."""
    url = (
        "https://maps.googleapis.com/maps/api/place/nearbysearch/json?"
        f"location={lat},{lon}&radius={radius_m}&type=police&key={api_key}"
    )
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode())

    if data.get("status") not in ("OK", "ZERO_RESULTS"):
        raise RuntimeError(f"Google Places error: {data.get('status')}")

    stations: List[Dict[str, Any]] = []
    for place in data.get("results", []):
        loc = place.get("geometry", {}).get("location", {})
        stations.append({
            "name": place.get("name", "Police Station"),
            "address": place.get("vicinity") or place.get("formatted_address", ""),
            "latitude": loc.get("lat"),
            "longitude": loc.get("lng"),
            "phone": None,
            "place_id": place.get("place_id"),
        })
    return stations


def get_directions_google(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    api_key: str,
) -> Dict[str, Any] | None:
    """Driving directions via Google Directions API."""
    url = (
        "https://maps.googleapis.com/maps/api/directions/json?"
        f"origin={origin_lat},{origin_lon}&destination={dest_lat},{dest_lon}"
        f"&mode=driving&key={api_key}"
    )
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode())

    if data.get("status") != "OK" or not data.get("routes"):
        return None

    route = data["routes"][0]
    leg = route["legs"][0]
    polyline = _decode_polyline(route["overview_polyline"]["points"])

    return {
        "distance_km": round(leg["distance"]["value"] / 1000, 2),
        "eta_minutes": round(leg["duration"]["value"] / 60, 1),
        "polyline": polyline,
        "is_fallback": False,
        "provider": "google",
    }


def _decode_polyline(encoded: str) -> list:
    """Decode Google encoded polyline to [lat, lon] pairs."""
    points: list = []
    index = lat = lng = 0
    while index < len(encoded):
        for coord in (0, 1):
            shift = result = 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else result >> 1
            if coord == 0:
                lat += delta
            else:
                lng += delta
        points.append([lat / 1e5, lng / 1e5])
    return points

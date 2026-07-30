"""
OpenStreetMap Overpass API — free worldwide hospital search.
No API key required.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def search_hospitals_osm(lat: float, lon: float, radius_m: int = 10000) -> List[Dict[str, Any]]:
    """Query OSM for hospitals/clinics within radius metres of lat/lon."""
    query = f"""
    [out:json][timeout:25];
    (
      node["amenity"~"hospital|clinic|doctors"](around:{radius_m},{lat},{lon});
      way["amenity"~"hospital|clinic"](around:{radius_m},{lat},{lon});
      relation["amenity"~"hospital|clinic"](around:{radius_m},{lat},{lon});
    );
    out center tags;
    """
    req = urllib.request.Request(
        OVERPASS_URL,
        data=f"data={urllib.parse.quote(query)}".encode("utf-8"),
        headers={
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Accept": "application/json",
            "User-Agent": "SafeRoute-AI/1.0 (emergency hospital search)",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"OSM Overpass error: {exc}")
        return []

    hospitals: List[Dict[str, Any]] = []
    seen_names: set[str] = set()

    for element in data.get("elements", []):
        tags = element.get("tags", {})
        name = tags.get("name") or tags.get("operator")
        if not name:
            continue

        key = name.lower().strip()
        if key in seen_names:
            continue
        seen_names.add(key)

        if "lat" in element and "lon" in element:
            el_lat, el_lon = element["lat"], element["lon"]
        elif "center" in element:
            el_lat, el_lon = element["center"]["lat"], element["center"]["lon"]
        else:
            continue

        name_lower = name.lower()
        is_trauma = any(
            kw in name_lower
            for kw in ("trauma", "emergency", "casualty", "accident", "er ")
        )

        hospitals.append({
            "name": name,
            "address": _build_osm_address(tags),
            "latitude": el_lat,
            "longitude": el_lon,
            "phone": tags.get("phone") or tags.get("contact:phone"),
            "place_id": f"osm/{element.get('type')}/{element.get('id')}",
            "is_trauma_center": is_trauma,
        })

    return hospitals


def _build_osm_address(tags: dict) -> str:
    parts = [
        tags.get("addr:street"),
        tags.get("addr:city") or tags.get("addr:town") or tags.get("addr:village"),
        tags.get("addr:state"),
        tags.get("addr:country"),
    ]
    return ", ".join(p for p in parts if p)


def search_police_osm(lat: float, lon: float, radius_m: int = 10000) -> List[Dict[str, Any]]:
    """Query OSM for police stations within radius metres of lat/lon."""
    query = f"""
    [out:json][timeout:30];
    (
      node["amenity"="police"](around:{radius_m},{lat},{lon});
      way["amenity"="police"](around:{radius_m},{lat},{lon});
      relation["amenity"="police"](around:{radius_m},{lat},{lon});
      node["office"="police"](around:{radius_m},{lat},{lon});
      way["office"="police"](around:{radius_m},{lat},{lon});
      node["amenity"="police_station"](around:{radius_m},{lat},{lon});
      way["amenity"="police_station"](around:{radius_m},{lat},{lon});
      node["government"="police"](around:{radius_m},{lat},{lon});
      way["government"="police"](around:{radius_m},{lat},{lon});
      node["building"="police"](around:{radius_m},{lat},{lon});
      way["building"="police"](around:{radius_m},{lat},{lon});
    );
    out center tags;
    """
    req = urllib.request.Request(
        OVERPASS_URL,
        data=f"data={urllib.parse.quote(query)}".encode("utf-8"),
        headers={
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Accept": "application/json",
            "User-Agent": "SafeRoute-AI/1.0 (emergency police search)",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"OSM Overpass police search error: {exc}")
        return []

    stations: List[Dict[str, Any]] = []
    seen_names: set[str] = set()

    for element in data.get("elements", []):
        tags = element.get("tags", {})
        el_id = element.get("id", "unknown")
        el_type = element.get("type", "node")

        # Accept stations even without a name — use address or generic label
        name = (
            tags.get("name")
            or tags.get("operator")
            or tags.get("official_name")
            or tags.get("addr:street")
            or tags.get("addr:city")
        )
        if not name:
            name = f"Police Station ({el_type}/{el_id})"

        key = f"{name.lower().strip()}:{el_id}"
        if key in seen_names:
            continue
        seen_names.add(key)

        if "lat" in element and "lon" in element:
            el_lat, el_lon = element["lat"], element["lon"]
        elif "center" in element:
            el_lat, el_lon = element["center"]["lat"], element["center"]["lon"]
        else:
            continue

        stations.append({
            "name": name if "police" in name.lower() else f"{name} Police Station",
            "address": _build_osm_address(tags),
            "latitude": el_lat,
            "longitude": el_lon,
            "phone": tags.get("phone") or tags.get("contact:phone"),
            "place_id": f"osm/{el_type}/{el_id}",
        })

    return stations

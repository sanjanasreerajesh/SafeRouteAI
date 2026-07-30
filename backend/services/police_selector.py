"""
Automatic police station selection and route enrichment.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple


def select_nearest_police_station(
    stations: List[Dict[str, Any]],
    severity: str,
) -> Tuple[Optional[Dict[str, Any]], str]:
    """
    Select the best police station for the given severity.

    HIGH/CRITICAL → prefer traffic/highway police if available, else nearest
    Other → nearest station by distance
    """
    if not stations:
        return None, "no_police_found"

    severity = severity.upper()
    if severity in ("HIGH", "CRITICAL"):
        traffic = [
            s
            for s in stations
            if any(
                kw in s.get("name", "").lower()
                for kw in ("traffic", "highway", "motorway", "patrol")
            )
        ]
        if traffic:
            return traffic[0], "nearest_traffic_police"
        return stations[0], "nearest_police_high_severity"

    return stations[0], "nearest_police_station"


def enrich_stations_with_routes(
    accident_lat: float,
    accident_lon: float,
    stations: List[Dict[str, Any]],
    route_fn,
    top_n: int = 5,
) -> List[Dict[str, Any]]:
    """Attach route ETA and travel time to top N police stations."""
    enriched = []
    for station in stations[:top_n]:
        route = route_fn(
            accident_lat,
            accident_lon,
            station["latitude"],
            station["longitude"],
            station["name"],
        )
        enriched.append({
            **station,
            "eta_minutes": route.get("eta_minutes"),
            "route_distance_km": route.get("distance_km"),
            "route_polyline": route.get("polyline", []),
            "route_provider": route.get("provider", "unknown"),
        })
    return enriched

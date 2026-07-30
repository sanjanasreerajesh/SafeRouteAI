"""
Automatic hospital selection based on accident severity.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple


def select_nearest_hospital(
    hospitals: List[Dict[str, Any]],
    severity: str,
) -> Tuple[Optional[Dict[str, Any]], str]:
    """
    Select best hospital for the given severity.

    HIGH  → nearest trauma/emergency hospital if available, else nearest general
    Other → nearest hospital by distance

    Returns (hospital, selection_reason)
    """
    if not hospitals:
        return None, "no_hospitals_found"

    severity = severity.upper()

    if severity == "HIGH":
        trauma = [h for h in hospitals if h.get("is_trauma_center")]
        if trauma:
            return trauma[0], "nearest_trauma_center"
        return hospitals[0], "nearest_general_no_trauma_found"

    if severity == "MEDIUM":
        return hospitals[0], "nearest_hospital"

    return hospitals[0], "nearest_hospital_low_severity"


def enrich_hospitals_with_routes(
    accident_lat: float,
    accident_lon: float,
    hospitals: List[Dict[str, Any]],
    route_fn,
    top_n: int = 5,
) -> List[Dict[str, Any]]:
    """Attach route ETA and travel time to top N hospitals."""
    enriched = []
    for hospital in hospitals[:top_n]:
        route = route_fn(
            accident_lat,
            accident_lon,
            hospital["latitude"],
            hospital["longitude"],
            hospital["name"],
        )
        enriched.append({
            **hospital,
            "eta_minutes": route.get("eta_minutes"),
            "route_distance_km": route.get("distance_km"),
            "route_polyline": route.get("polyline", []),
            "route_provider": route.get("provider", "unknown"),
        })
    return enriched

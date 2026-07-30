"""
Registry matching — find registered police station nearest to a discovered station.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from database.models import PoliceRegistry
from services.hospital_search import haversine_km


def find_registered_police_match(
    db: Session,
    station_lat: float,
    station_lon: float,
    station_name: str,
    max_distance_km: float = 2.0,
) -> Optional[PoliceRegistry]:
    """Match a dynamically found police station to a registered SafeRoute partner."""
    active = db.query(PoliceRegistry).filter(PoliceRegistry.is_active.is_(True)).all()
    if not active:
        return None

    name_lower = station_name.lower()
    best: Optional[PoliceRegistry] = None
    best_dist = float("inf")

    for reg in active:
        dist = haversine_km(station_lat, station_lon, reg.latitude, reg.longitude)
        name_match = reg.name.lower() in name_lower or name_lower in reg.name.lower()
        if dist <= max_distance_km or name_match:
            if dist < best_dist:
                best_dist = dist
                best = reg

    return best

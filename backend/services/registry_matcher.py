"""
Registry matching — find registered hospital nearest to a discovered hospital.
"""

from __future__ import annotations

import math
from typing import Optional

from sqlalchemy.orm import Session

from database.models import HospitalRegistry
from services.hospital_search import haversine_km


def find_registered_match(
    db: Session,
    hospital_lat: float,
    hospital_lon: float,
    hospital_name: str,
    max_distance_km: float = 2.0,
) -> Optional[HospitalRegistry]:
    """
    Match a dynamically found hospital to a registered SafeRoute partner.
    Uses proximity (< 2 km) or fuzzy name match.
    """
    active = db.query(HospitalRegistry).filter(HospitalRegistry.is_active.is_(True)).all()
    if not active:
        return None

    name_lower = hospital_name.lower()
    best: Optional[HospitalRegistry] = None
    best_dist = float("inf")

    for reg in active:
        dist = haversine_km(hospital_lat, hospital_lon, reg.latitude, reg.longitude)
        name_match = reg.name.lower() in name_lower or name_lower in reg.name.lower()
        if dist <= max_distance_km or name_match:
            if dist < best_dist:
                best_dist = dist
                best = reg

    return best

"""
Police Registry CRUD — police stations register to receive real-time SafeRoute AI alerts.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from database.session import get_db
from database.models import PoliceRegistry

router = APIRouter(prefix="/api/police", tags=["Police Registry"])


class PoliceRegisterRequest(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    dashboard_url: Optional[str] = None
    api_endpoint: Optional[str] = None
    fcm_token: Optional[str] = None
    latitude: float
    longitude: float


class PoliceUpdateRequest(BaseModel):
    phone: Optional[str] = None
    dashboard_url: Optional[str] = None
    api_endpoint: Optional[str] = None
    fcm_token: Optional[str] = None
    is_active: Optional[bool] = None


@router.post("/register")
def register_police_station(body: PoliceRegisterRequest, db: Session = Depends(get_db)):
    """Register a police station to receive real-time accident notifications."""
    existing = db.query(PoliceRegistry).filter(PoliceRegistry.email == body.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Police station with this email already registered")

    station = PoliceRegistry(
        name=body.name,
        email=body.email,
        phone=body.phone,
        dashboard_url=body.dashboard_url,
        api_endpoint=body.api_endpoint,
        fcm_token=body.fcm_token,
        latitude=body.latitude,
        longitude=body.longitude,
    )
    db.add(station)
    db.commit()
    db.refresh(station)

    return {
        "id": station.id,
        "name": station.name,
        "email": station.email,
        "message": "Police station registered successfully. Connect WebSocket at /ws/police/{id}",
        "websocket_url": f"/ws/police/{station.id}",
    }


@router.get("/registry")
def list_registered_police(db: Session = Depends(get_db)):
    """List all registered police stations."""
    stations = db.query(PoliceRegistry).filter(PoliceRegistry.is_active.is_(True)).all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "email": s.email,
            "phone": s.phone,
            "latitude": s.latitude,
            "longitude": s.longitude,
            "dashboard_url": s.dashboard_url,
        }
        for s in stations
    ]


@router.get("/registry/{station_id}")
def get_registered_police(station_id: str, db: Session = Depends(get_db)):
    station = db.query(PoliceRegistry).filter(PoliceRegistry.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Police station not found")
    return {
        "id": station.id,
        "name": station.name,
        "email": station.email,
        "phone": station.phone,
        "latitude": station.latitude,
        "longitude": station.longitude,
        "dashboard_url": station.dashboard_url,
        "api_endpoint": station.api_endpoint,
    }


@router.patch("/registry/{station_id}")
def update_registered_police(
    station_id: str,
    body: PoliceUpdateRequest,
    db: Session = Depends(get_db),
):
    station = db.query(PoliceRegistry).filter(PoliceRegistry.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Police station not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(station, field, value)

    db.commit()
    db.refresh(station)
    return {"id": station.id, "message": "Updated successfully"}

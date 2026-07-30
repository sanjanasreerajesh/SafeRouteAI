"""
Hospital Registry CRUD — hospitals register to receive real-time SafeRoute AI alerts.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from database.session import get_db
from database.models import HospitalRegistry

router = APIRouter(prefix="/api/hospitals", tags=["Hospital Registry"])


class HospitalRegisterRequest(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    dashboard_url: Optional[str] = None
    api_endpoint: Optional[str] = None
    fcm_token: Optional[str] = None
    latitude: float
    longitude: float
    is_trauma_center: bool = False


class HospitalUpdateRequest(BaseModel):
    phone: Optional[str] = None
    dashboard_url: Optional[str] = None
    api_endpoint: Optional[str] = None
    fcm_token: Optional[str] = None
    is_trauma_center: Optional[bool] = None
    is_active: Optional[bool] = None


@router.post("/register")
def register_hospital(body: HospitalRegisterRequest, db: Session = Depends(get_db)):
    """Register a hospital to receive real-time accident notifications."""
    existing = db.query(HospitalRegistry).filter(HospitalRegistry.email == body.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Hospital with this email already registered")

    hospital = HospitalRegistry(
        name=body.name,
        email=body.email,
        phone=body.phone,
        dashboard_url=body.dashboard_url,
        api_endpoint=body.api_endpoint,
        fcm_token=body.fcm_token,
        latitude=body.latitude,
        longitude=body.longitude,
        is_trauma_center=body.is_trauma_center,
    )
    db.add(hospital)
    db.commit()
    db.refresh(hospital)

    return {
        "id": hospital.id,
        "name": hospital.name,
        "email": hospital.email,
        "message": "Hospital registered successfully. Connect WebSocket at /ws/hospital/{id}",
        "websocket_url": f"/ws/hospital/{hospital.id}",
    }


@router.get("/registry")
def list_registered_hospitals(db: Session = Depends(get_db)):
    """List all registered hospitals."""
    hospitals = db.query(HospitalRegistry).filter(HospitalRegistry.is_active.is_(True)).all()
    return [
        {
            "id": h.id,
            "name": h.name,
            "email": h.email,
            "phone": h.phone,
            "latitude": h.latitude,
            "longitude": h.longitude,
            "is_trauma_center": h.is_trauma_center,
            "dashboard_url": h.dashboard_url,
        }
        for h in hospitals
    ]


@router.get("/registry/{hospital_id}")
def get_registered_hospital(hospital_id: str, db: Session = Depends(get_db)):
    hospital = db.query(HospitalRegistry).filter(HospitalRegistry.id == hospital_id).first()
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
    return {
        "id": hospital.id,
        "name": hospital.name,
        "email": hospital.email,
        "phone": hospital.phone,
        "latitude": hospital.latitude,
        "longitude": hospital.longitude,
        "is_trauma_center": hospital.is_trauma_center,
        "dashboard_url": hospital.dashboard_url,
        "api_endpoint": hospital.api_endpoint,
    }


@router.patch("/registry/{hospital_id}")
def update_registered_hospital(
    hospital_id: str,
    body: HospitalUpdateRequest,
    db: Session = Depends(get_db),
):
    hospital = db.query(HospitalRegistry).filter(HospitalRegistry.id == hospital_id).first()
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(hospital, field, value)

    db.commit()
    db.refresh(hospital)
    return {"id": hospital.id, "message": "Updated successfully"}

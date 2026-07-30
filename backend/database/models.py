"""SQLAlchemy models for hospital registry and alert audit log."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database.session import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class HospitalRegistry(Base):
    """Hospitals registered to receive real-time SafeRoute AI alerts."""

    __tablename__ = "hospital_registry"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dashboard_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    api_endpoint: Mapped[str | None] = mapped_column(String(512), nullable=True)
    fcm_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    is_trauma_center: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AlertLog(Base):
    """Audit log for accident alerts sent to hospitals."""

    __tablename__ = "alert_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    accident_lat: Mapped[float] = mapped_column(Float, nullable=False)
    accident_lon: Mapped[float] = mapped_column(Float, nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    hospital_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hospital_lat: Mapped[float] = mapped_column(Float, nullable=False)
    hospital_lon: Mapped[float] = mapped_column(Float, nullable=False)
    is_registered: Mapped[bool] = mapped_column(Boolean, default=False)
    registry_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    notification_status: Mapped[str] = mapped_column(Text, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PoliceRegistry(Base):
    """Police stations registered to receive real-time SafeRoute AI alerts."""

    __tablename__ = "police_registry"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dashboard_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    api_endpoint: Mapped[str | None] = mapped_column(String(512), nullable=True)
    fcm_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PoliceAlertLog(Base):
    """Audit log for accident alerts sent to police stations."""

    __tablename__ = "police_alert_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    accident_lat: Mapped[float] = mapped_column(Float, nullable=False)
    accident_lon: Mapped[float] = mapped_column(Float, nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    police_name: Mapped[str] = mapped_column(String(255), nullable=False)
    police_lat: Mapped[float] = mapped_column(Float, nullable=False)
    police_lon: Mapped[float] = mapped_column(Float, nullable=False)
    is_registered: Mapped[bool] = mapped_column(Boolean, default=False)
    registry_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    notification_status: Mapped[str] = mapped_column(Text, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

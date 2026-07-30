"""
Email notifications for hospital alerts.
Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM in environment.
"""

from __future__ import annotations

import os
import smtplib
from email.mime.text import MIMEText
from typing import Any, Dict


def send_hospital_email(to_email: str, alert: Dict[str, Any]) -> bool:
    """Send accident alert email to registered hospital."""
    host = os.getenv("SMTP_HOST")
    if not host:
        print(f"[email] SMTP not configured — would send to {to_email}")
        return False

    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASSWORD", "")
    from_addr = os.getenv("SMTP_FROM", user)

    subject = f"🚨 SafeRoute AI Alert — {alert.get('severity', 'ACCIDENT')} severity"
    body = (
        f"Accident detected near your hospital.\n\n"
        f"Severity: {alert.get('severity')}\n"
        f"Location: {alert.get('accident_location', 'Unknown')}\n"
        f"Coordinates: {alert.get('latitude')}, {alert.get('longitude')}\n"
        f"Distance: {alert.get('distance_km', 'N/A')} km\n"
        f"ETA: {alert.get('eta_minutes', 'N/A')} min\n\n"
        f"Open dashboard: {alert.get('dashboard_url', 'N/A')}\n"
    )

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email

    try:
        with smtplib.SMTP(host, port, timeout=10) as server:
            server.starttls()
            if user and password:
                server.login(user, password)
            server.sendmail(from_addr, [to_email], msg.as_string())
        return True
    except Exception as exc:
        print(f"[email] Failed to send: {exc}")
        return False


def send_police_email(to_email: str, alert: Dict[str, Any]) -> bool:
    """Send accident alert email to registered police station."""
    host = os.getenv("SMTP_HOST")
    if not host:
        print(f"[email] SMTP not configured — would send to {to_email}")
        return False

    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASSWORD", "")
    from_addr = os.getenv("SMTP_FROM", user)

    subject = f"🚨 SafeRoute AI — Police Alert ({alert.get('severity', 'ACCIDENT')})"
    body = (
        f"Accident detected in your jurisdiction.\n\n"
        f"Severity: {alert.get('severity')}\n"
        f"Location: {alert.get('accident_location', 'Unknown')}\n"
        f"Coordinates: {alert.get('latitude')}, {alert.get('longitude')}\n"
        f"Distance: {alert.get('distance_km', 'N/A')} km\n"
        f"ETA: {alert.get('eta_minutes', 'N/A')} min\n\n"
        f"Open dashboard: {alert.get('dashboard_url', 'N/A')}\n"
    )

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email

    try:
        with smtplib.SMTP(host, port, timeout=10) as server:
            server.starttls()
            if user and password:
                server.login(user, password)
            server.sendmail(from_addr, [to_email], msg.as_string())
        return True
    except Exception as exc:
        print(f"[email] Failed to send police alert: {exc}")
        return False

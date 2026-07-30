"""
Orchestrates all notification channels for a registered hospital.
"""

from __future__ import annotations

from typing import Any, Dict

from notifications.email_service import send_hospital_email
from notifications.fcm_service import send_fcm_push
from notifications.websocket_manager import hospital_ws_manager


async def notify_registered_hospital(
    registry_id: str,
    hospital_email: str,
    fcm_token: str | None,
    alert_payload: Dict[str, Any],
) -> Dict[str, bool]:
    """
    Send alert through all available channels.
    Returns status per channel.
    """
    ws_sent = await hospital_ws_manager.send_to_hospital(registry_id, alert_payload)
    email_sent = send_hospital_email(hospital_email, alert_payload)
    fcm_sent = send_fcm_push(fcm_token, alert_payload) if fcm_token else False

    return {
        "websocket": ws_sent,
        "email": email_sent,
        "fcm": fcm_sent,
    }

"""
Orchestrates all notification channels for a registered police station.
"""

from __future__ import annotations

from typing import Any, Dict

from fastapi.concurrency import run_in_threadpool

from notifications.email_service import send_police_email
from notifications.fcm_service import send_fcm_push
from notifications.police_websocket_manager import police_ws_manager


async def notify_registered_police(
    registry_id: str,
    police_email: str,
    fcm_token: str | None,
    alert_payload: Dict[str, Any],
) -> Dict[str, bool]:
    """Send alert through WebSocket, email, and FCM. Returns status per channel.

    email/FCM are blocking (smtplib/urllib) so they run in a worker thread;
    the websocket push is already async. Same inputs/outputs as before.
    """
    ws_sent = await police_ws_manager.send_to_police(registry_id, alert_payload)
    email_sent = await run_in_threadpool(send_police_email, police_email, alert_payload)
    fcm_sent = (
        await run_in_threadpool(send_fcm_push, fcm_token, alert_payload)
        if fcm_token
        else False
    )

    return {
        "websocket": ws_sent,
        "email": email_sent,
        "fcm": fcm_sent,
    }

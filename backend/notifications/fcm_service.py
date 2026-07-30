"""
Firebase Cloud Messaging push notifications.
Set FCM_SERVER_KEY in environment to enable.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Dict


def send_fcm_push(fcm_token: str, alert: Dict[str, Any]) -> bool:
    """Send push notification via FCM legacy HTTP API."""
    server_key = os.getenv("FCM_SERVER_KEY")
    if not server_key or not fcm_token:
        print("[fcm] Not configured or missing token")
        return False

    payload = {
        "to": fcm_token,
        "notification": {
            "title": "SafeRoute AI — Accident Alert",
            "body": f"{alert.get('severity')} severity accident {alert.get('distance_km', '?')} km away",
        },
        "data": {k: str(v) for k, v in alert.items()},
    }

    req = urllib.request.Request(
        "https://fcm.googleapis.com/fcm/send",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"key={server_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
            return result.get("success", 0) > 0
    except (urllib.error.URLError, json.JSONDecodeError) as exc:
        print(f"[fcm] Failed: {exc}")
        return False

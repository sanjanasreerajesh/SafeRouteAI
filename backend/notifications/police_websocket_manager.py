"""
WebSocket connection manager for registered police station dashboards.
Police connect to /ws/police/{registry_id} to receive live alerts.
"""

from __future__ import annotations

from typing import Dict, Set

from fastapi import WebSocket


class PoliceWebSocketManager:
    """Tracks active WebSocket connections per police registry ID."""

    def __init__(self):
        self._connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, registry_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(registry_id, set()).add(websocket)

    def disconnect(self, registry_id: str, websocket: WebSocket) -> None:
        conns = self._connections.get(registry_id)
        if conns:
            conns.discard(websocket)
            if not conns:
                del self._connections[registry_id]

    async def send_to_police(self, registry_id: str, payload: dict) -> bool:
        conns = self._connections.get(registry_id, set())
        if not conns:
            return False
        dead = set()
        for ws in conns:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.add(ws)
        for ws in dead:
            conns.discard(ws)
        return len(conns) > 0

    def is_online(self, registry_id: str) -> bool:
        return bool(self._connections.get(registry_id))


police_ws_manager = PoliceWebSocketManager()

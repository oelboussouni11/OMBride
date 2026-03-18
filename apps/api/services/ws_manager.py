"""WebSocket connection manager for real-time messaging."""

import json
from uuid import UUID

from fastapi import WebSocket


class ConnectionManager:
    """Track active WebSocket connections by user id."""

    def __init__(self) -> None:
        self._connections: dict[str, WebSocket] = {}

    async def connect(self, user_id: UUID, ws: WebSocket) -> None:
        await ws.accept()
        self._connections[str(user_id)] = ws

    def disconnect(self, user_id: UUID) -> None:
        self._connections.pop(str(user_id), None)

    def is_connected(self, user_id: UUID) -> bool:
        return str(user_id) in self._connections

    async def send(self, user_id: UUID, message: dict) -> bool:
        """Send a JSON message to a connected user. Returns True if sent."""
        ws = self._connections.get(str(user_id))
        if ws is None:
            return False
        try:
            await ws.send_text(json.dumps(message))
            return True
        except Exception:
            self.disconnect(user_id)
            return False

    async def broadcast(self, message: dict) -> None:
        """Broadcast to all connections."""
        dead = []
        for uid, ws in self._connections.items():
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.append(uid)
        for uid in dead:
            self._connections.pop(uid, None)


# Singleton instances per role
rider_manager = ConnectionManager()
driver_manager = ConnectionManager()
admin_manager = ConnectionManager()

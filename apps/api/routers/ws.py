"""WebSocket endpoints for real-time communication."""

import asyncio
import json
import time
from uuid import UUID

import redis.asyncio as aioredis
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_session_factory
from dependencies import get_redis
from models.user import Driver, DriverStatus, User, UserRole
from services.location import forward_driver_location_to_rider
from services.ws_manager import admin_manager, driver_manager, rider_manager

settings = get_settings()
router = APIRouter(tags=["websocket"])

# Batch interval for writing driver locations to PostgreSQL (seconds)
PG_LOCATION_FLUSH_INTERVAL = 30
PING_INTERVAL = 30
REDIS_LOCATION_KEY = "drivers:locations"


# ── Auth helper ──────────────────────────────────────────────────────────────


async def _authenticate_ws(token: str) -> dict | None:
    """Validate a JWT token and return the payload, or None if invalid."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


async def _get_user(user_id: str) -> User | None:
    """Fetch a User from DB by id."""
    async with get_session_factory()() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()


# ── Driver WebSocket ─────────────────────────────────────────────────────────


@router.websocket("/ws/driver/{driver_id}")
async def ws_driver(ws: WebSocket, driver_id: UUID, token: str = Query(...)):
    """Driver WebSocket — receives location updates, sends ride requests.

    NOTE: driver_id can be either the driver table PK or the user_id.
    The mobile app sends user.id, so we look up by user_id first.
    """
    payload = await _authenticate_ws(token)
    if payload is None or payload.get("role") != UserRole.driver.value:
        await ws.close(code=4001, reason="Unauthorized")
        return

    user_id_str = payload["sub"]

    # Look up driver — try by user_id first (mobile sends user.id), then by driver.id
    async with get_session_factory()() as db:
        result = await db.execute(
            select(Driver).where(Driver.user_id == user_id_str)
        )
        driver = result.scalar_one_or_none()
        if driver is None:
            result = await db.execute(
                select(Driver).where(Driver.id == driver_id, Driver.user_id == user_id_str)
            )
            driver = result.scalar_one_or_none()
        if driver is None:
            await ws.close(code=4003, reason="Driver not found")
            return
        actual_driver_id = driver.id

        # Mark driver as available
        await db.execute(
            update(Driver).where(Driver.id == actual_driver_id).values(is_available=True)
        )
        await db.commit()

    user_id = UUID(user_id_str)
    await driver_manager.connect(user_id, ws)

    redis = await get_redis()
    last_pg_flush = time.monotonic()

    try:
        while True:
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=PING_INTERVAL)
            except asyncio.TimeoutError:
                # Send ping to keep connection alive
                await ws.send_text(json.dumps({"type": "ping"}))
                continue

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if msg.get("type") == "pong":
                continue

            if msg.get("type") == "location_update":
                data = msg.get("data", {})
                lat = data.get("lat")
                lng = data.get("lng")
                if lat is None or lng is None:
                    continue

                # Store in Redis (GEOADD)
                await redis.geoadd(REDIS_LOCATION_KEY, (lng, lat, str(actual_driver_id)))

                # Forward to rider if driver has an active ride
                await forward_driver_location_to_rider(actual_driver_id, lat, lng)

                # Batch flush to PostgreSQL every PG_LOCATION_FLUSH_INTERVAL
                now = time.monotonic()
                if now - last_pg_flush >= PG_LOCATION_FLUSH_INTERVAL:
                    last_pg_flush = now
                    async with get_session_factory()() as db:
                        await db.execute(
                            update(Driver)
                            .where(Driver.id == actual_driver_id)
                            .values(
                                current_location=f"SRID=4326;POINT({lng} {lat})",
                                location_updated_at=__import__("datetime").datetime.now(
                                    __import__("datetime").timezone.utc
                                ),
                            )
                        )
                        await db.commit()

    except WebSocketDisconnect:
        pass
    finally:
        driver_manager.disconnect(user_id)
        # Mark driver as unavailable
        try:
            async with get_session_factory()() as db:
                await db.execute(
                    update(Driver).where(Driver.id == actual_driver_id).values(is_available=False)
                )
                await db.commit()
        except Exception:
            pass


# ── Rider WebSocket ──────────────────────────────────────────────────────────


@router.websocket("/ws/rider/{rider_id}")
async def ws_rider(ws: WebSocket, rider_id: UUID, token: str = Query(...)):
    """Rider WebSocket — listens for ride status updates and driver locations.

    NOTE: rider_id can be the user_id (sent by mobile app). We look up the
    actual rider record and register using rider.id so that ride notifications
    (which use rider.id) reach the right connection.
    """
    payload = await _authenticate_ws(token)
    if payload is None or payload.get("role") != UserRole.rider.value:
        await ws.close(code=4001, reason="Unauthorized")
        return

    user_id = UUID(payload["sub"])

    # Look up rider by user_id to get the rider table PK
    async with get_session_factory()() as db:
        from models.user import Rider
        result = await db.execute(select(Rider).where(Rider.user_id == user_id))
        rider = result.scalar_one_or_none()
        actual_rider_id = rider.id if rider else rider_id

    await rider_manager.connect(actual_rider_id, ws)

    try:
        while True:
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=PING_INTERVAL)
            except asyncio.TimeoutError:
                await ws.send_text(json.dumps({"type": "ping"}))
                continue

            # Rider mostly listens; handle pong
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if msg.get("type") == "pong":
                continue

    except WebSocketDisconnect:
        pass
    finally:
        rider_manager.disconnect(actual_rider_id)


# ── Admin WebSocket ──────────────────────────────────────────────────────────


@router.websocket("/ws/admin")
async def ws_admin(ws: WebSocket, token: str = Query(...)):
    """Admin WebSocket — receives real-time stats, new rides, completed rides."""
    payload = await _authenticate_ws(token)
    if payload is None or payload.get("role") != UserRole.admin.value:
        await ws.close(code=4001, reason="Unauthorized")
        return

    user_id = UUID(payload["sub"])
    await admin_manager.connect(user_id, ws)

    try:
        while True:
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=PING_INTERVAL)
            except asyncio.TimeoutError:
                await ws.send_text(json.dumps({"type": "ping"}))
                continue

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if msg.get("type") == "pong":
                continue

    except WebSocketDisconnect:
        pass
    finally:
        admin_manager.disconnect(user_id)

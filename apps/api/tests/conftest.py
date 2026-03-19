"""Shared test fixtures."""

import os
import sys
import subprocess
import random
import string
import time

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ["DATABASE_URL"] = "postgresql+asyncpg://omarelboussouni@localhost:5432/rideapp"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"
os.environ["JWT_SECRET"] = "test-secret"


def _rand(n=8):
    return "".join(random.choices(string.digits, k=n))


def _psql(sql):
    r = subprocess.run(
        ["psql", "-U", "omarelboussouni", "-d", "rideapp", "-tAc", sql],
        capture_output=True, text=True,
    )
    return r.stdout.strip()


@pytest_asyncio.fixture
async def client():
    import database
    import dependencies
    if database._engine:
        await database._engine.dispose()
    database._engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    database._session_factory = async_sessionmaker(database._engine, class_=AsyncSession, expire_on_commit=False)
    if dependencies._redis:
        await dependencies._redis.aclose()
    dependencies._redis = None

    # Disable background matching in tests (it blocks for 90s)
    import services.matching
    services.matching._matching_disabled = True

    from main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    services.matching._matching_disabled = False  # Reset for live server
    await database._engine.dispose()
    database._engine = None
    database._session_factory = None
    if dependencies._redis:
        await dependencies._redis.aclose()
        dependencies._redis = None


@pytest_asyncio.fixture
async def seed_data(client: AsyncClient):
    rp, dp = "09" + _rand(), "09" + _rand()
    plate = "T-" + _rand(6)

    # Register rider
    r = await client.post("/auth/register", json={
        "phone": rp, "name": "Test Rider", "password": "testpass", "role": "rider",
    })
    assert r.status_code == 201
    rider_token = r.json()["access_token"]

    # Register driver
    r = await client.post("/auth/register", json={
        "phone": dp, "name": "Test Driver", "password": "testpass",
        "role": "driver", "vehicle_model": "Test Car", "plate_number": plate,
    })
    assert r.status_code == 201
    driver_user_id = r.json()["user"]["id"]

    # Verify + fund via direct SQL (separate connection, committed immediately)
    _psql(f"UPDATE drivers SET status='verified', credit_balance=100 WHERE user_id='{driver_user_id}'")

    # The test client creates a new DB session per request, so it will see the update.
    # Re-login to get a token that reflects verified status
    r = await client.post("/auth/login", json={"phone": dp, "password": "testpass"})
    assert r.status_code == 200
    driver_token = r.json()["access_token"]

    # Verify the driver is actually verified
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {driver_token}"})
    assert me.json().get("driver", {}).get("status") == "verified", f"Driver not verified: {me.json()}"

    return {
        "rider_token": rider_token,
        "driver_token": driver_token,
        "rider_phone": rp,
        "driver_phone": dp,
    }

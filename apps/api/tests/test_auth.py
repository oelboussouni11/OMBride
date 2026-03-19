"""Tests for auth endpoints — register, login, me, stats."""

import random
import string

import pytest
from httpx import AsyncClient


def _rand_phone():
    return "09" + "".join(random.choices(string.digits, k=8))


@pytest.mark.asyncio
async def test_healthcheck(client: AsyncClient):
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_register_rider(client: AsyncClient):
    resp = await client.post("/auth/register", json={
        "phone": _rand_phone(), "name": "New Rider",
        "password": "secret123", "role": "rider",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["access_token"]
    assert data["user"]["name"] == "New Rider"
    assert data["user"]["role"] == "rider"


@pytest.mark.asyncio
async def test_register_duplicate_phone(client: AsyncClient):
    phone = _rand_phone()
    await client.post("/auth/register", json={
        "phone": phone, "name": "First", "password": "secret123", "role": "rider",
    })
    resp = await client.post("/auth/register", json={
        "phone": phone, "name": "Second", "password": "secret123", "role": "rider",
    })
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_register_admin_forbidden(client: AsyncClient):
    resp = await client.post("/auth/register", json={
        "phone": _rand_phone(), "name": "Admin",
        "password": "secret123", "role": "admin",
    })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, seed_data):
    resp = await client.post("/auth/login", json={
        "phone": seed_data["rider_phone"], "password": "testpass",
    })
    assert resp.status_code == 200
    assert resp.json()["access_token"]


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, seed_data):
    resp = await client.post("/auth/login", json={
        "phone": seed_data["rider_phone"], "password": "wrongpass",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_endpoint(client: AsyncClient, seed_data):
    resp = await client.get("/auth/me",
        headers={"Authorization": f"Bearer {seed_data['rider_token']}"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Test Rider"
    assert resp.json()["role"] == "rider"


@pytest.mark.asyncio
async def test_me_stats(client: AsyncClient, seed_data):
    resp = await client.get("/auth/me/stats",
        headers={"Authorization": f"Bearer {seed_data['rider_token']}"})
    assert resp.status_code == 200
    assert "rider" in resp.json()
    assert resp.json()["rider"]["score"] == 5.0


@pytest.mark.asyncio
async def test_me_unauthorized(client: AsyncClient):
    resp = await client.get("/auth/me")
    assert resp.status_code in (401, 403)

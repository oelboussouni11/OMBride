"""Tests for rider saved locations — CRUD."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_empty_saved_locations(client: AsyncClient, seed_data):
    token = seed_data["rider_token"]
    resp = await client.get("/riders/saved-locations",
        headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_add_saved_location(client: AsyncClient, seed_data):
    token = seed_data["rider_token"]
    resp = await client.post("/riders/saved-locations", json={
        "label": "Home",
        "latitude": 33.97,
        "longitude": -6.85,
        "address": "123 Main St",
    }, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["label"] == "Home"


@pytest.mark.asyncio
async def test_add_multiple_locations(client: AsyncClient, seed_data):
    token = seed_data["rider_token"]
    await client.post("/riders/saved-locations", json={
        "label": "Home", "latitude": 33.97, "longitude": -6.85, "address": "Home addr",
    }, headers={"Authorization": f"Bearer {token}"})
    resp = await client.post("/riders/saved-locations", json={
        "label": "Work", "latitude": 33.99, "longitude": -6.86, "address": "Work addr",
    }, headers={"Authorization": f"Bearer {token}"})
    assert len(resp.json()) == 2


@pytest.mark.asyncio
async def test_update_existing_label(client: AsyncClient, seed_data):
    token = seed_data["rider_token"]
    await client.post("/riders/saved-locations", json={
        "label": "Home", "latitude": 33.97, "longitude": -6.85, "address": "Old",
    }, headers={"Authorization": f"Bearer {token}"})
    resp = await client.post("/riders/saved-locations", json={
        "label": "Home", "latitude": 34.00, "longitude": -6.80, "address": "New",
    }, headers={"Authorization": f"Bearer {token}"})
    data = resp.json()
    assert len(data) == 1
    assert data[0]["address"] == "New"
    assert data[0]["latitude"] == 34.00


@pytest.mark.asyncio
async def test_delete_saved_location(client: AsyncClient, seed_data):
    token = seed_data["rider_token"]
    await client.post("/riders/saved-locations", json={
        "label": "Gym", "latitude": 33.97, "longitude": -6.85, "address": "Gym addr",
    }, headers={"Authorization": f"Bearer {token}"})
    resp = await client.delete("/riders/saved-locations/Gym",
        headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert len(resp.json()) == 0

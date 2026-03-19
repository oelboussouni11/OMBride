"""Tests for credit endpoints — list, topup, commission on ride complete."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_credits_empty(client: AsyncClient, seed_data):
    token = seed_data["driver_token"]
    resp = await client.get("/credits/", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_topup_request(client: AsyncClient, seed_data):
    token = seed_data["driver_token"]
    resp = await client.post("/credits/topup", json={
        "amount": 50,
        "payment_method": "bank_transfer",
        "reference_code": "REF-12345",
    }, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["amount"] == 50
    assert data["type"] == "topup"
    assert data["reference_code"] == "REF-12345"


@pytest.mark.asyncio
async def test_topup_without_reference(client: AsyncClient, seed_data):
    token = seed_data["driver_token"]
    resp = await client.post("/credits/topup", json={
        "amount": 50,
        "payment_method": "cash",
        "reference_code": "",
    }, headers={"Authorization": f"Bearer {token}"})
    # Should still work (reference can be empty)
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_commission_on_complete(client: AsyncClient, seed_data):
    """After completing a ride, driver should have two credit transactions: earned + commission."""
    rider_token = seed_data["rider_token"]
    driver_token = seed_data["driver_token"]

    # Complete a ride
    ride_resp = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 33.99, "dropoff_lng": -6.86,
        "pickup_address": "A", "dropoff_address": "B",
    }, headers={"Authorization": f"Bearer {rider_token}"})
    ride_id = ride_resp.json()["id"]
    fare = ride_resp.json()["fare"]

    await client.post(f"/rides/{ride_id}/accept", headers={"Authorization": f"Bearer {driver_token}"})
    await client.post(f"/rides/{ride_id}/arriving", headers={"Authorization": f"Bearer {driver_token}"})
    await client.post(f"/rides/{ride_id}/start", headers={"Authorization": f"Bearer {driver_token}"})
    await client.post(f"/rides/{ride_id}/complete", headers={"Authorization": f"Bearer {driver_token}"})

    # Check credit transactions
    resp = await client.get("/credits/", headers={"Authorization": f"Bearer {driver_token}"})
    txns = resp.json()
    assert len(txns) >= 2

    # Should have a ride_earned (positive) and ride_fee (negative)
    types = {t["type"] for t in txns}
    assert "ride_earned" in types
    assert "ride_fee" in types

    earned = [t for t in txns if t["type"] == "ride_earned"][0]
    fee = [t for t in txns if t["type"] == "ride_fee"][0]
    assert earned["amount"] > 0
    assert fee["amount"] < 0


@pytest.mark.asyncio
async def test_rider_cannot_topup(client: AsyncClient, seed_data):
    token = seed_data["rider_token"]
    resp = await client.post("/credits/topup", json={
        "amount": 50,
        "payment_method": "cash",
        "reference_code": "REF",
    }, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403

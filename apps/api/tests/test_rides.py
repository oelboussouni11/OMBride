"""Tests for ride endpoints — estimate, request, accept, cancel, complete, rate, history."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_estimate(client: AsyncClient, seed_data):
    token = seed_data["rider_token"]
    resp = await client.post("/rides/estimate", json={
        "pickup_lat": 33.97,
        "pickup_lng": -6.85,
        "dropoff_lat": 33.99,
        "dropoff_lng": -6.86,
    }, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["distance_km"] > 0
    assert data["duration_min"] > 0
    assert data["estimated_fare"] > 0


@pytest.mark.asyncio
async def test_request_ride(client: AsyncClient, seed_data):
    token = seed_data["rider_token"]
    resp = await client.post("/rides/request", json={
        "pickup_lat": 33.97,
        "pickup_lng": -6.85,
        "dropoff_lat": 33.99,
        "dropoff_lng": -6.86,
        "pickup_address": "Point A",
        "dropoff_address": "Point B",
    }, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "requested"
    assert data["fare"] > 0
    assert data["pickup_address"] == "Point A"


@pytest.mark.asyncio
async def test_request_ride_unauthorized(client: AsyncClient):
    resp = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 33.99, "dropoff_lng": -6.86,
        "pickup_address": "A", "dropoff_address": "B",
    })
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_accept_ride(client: AsyncClient, seed_data):
    rider_token = seed_data["rider_token"]
    driver_token = seed_data["driver_token"]

    # Create ride
    ride_resp = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 33.99, "dropoff_lng": -6.86,
        "pickup_address": "A", "dropoff_address": "B",
    }, headers={"Authorization": f"Bearer {rider_token}"})
    ride_id = ride_resp.json()["id"]

    # Accept
    resp = await client.post(f"/rides/{ride_id}/accept",
        headers={"Authorization": f"Bearer {driver_token}"})
    assert resp.status_code == 200, f"Accept failed ({resp.status_code}): {resp.text}"
    assert resp.json()["status"] == "matched"


@pytest.mark.asyncio
async def test_full_ride_flow(client: AsyncClient, seed_data):
    """Test complete ride lifecycle: request → accept → arriving → start → complete."""
    rider_token = seed_data["rider_token"]
    driver_token = seed_data["driver_token"]

    # 1. Request
    ride_resp = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 33.99, "dropoff_lng": -6.86,
        "pickup_address": "Start", "dropoff_address": "End",
    }, headers={"Authorization": f"Bearer {rider_token}"})
    assert ride_resp.status_code == 201
    ride_id = ride_resp.json()["id"]
    fare = ride_resp.json()["fare"]

    # 2. Accept
    resp = await client.post(f"/rides/{ride_id}/accept",
        headers={"Authorization": f"Bearer {driver_token}"})
    assert resp.json()["status"] == "matched"

    # 3. Arriving
    resp = await client.post(f"/rides/{ride_id}/arriving",
        headers={"Authorization": f"Bearer {driver_token}"})
    assert resp.json()["status"] == "arriving"

    # 4. Start
    resp = await client.post(f"/rides/{ride_id}/start",
        headers={"Authorization": f"Bearer {driver_token}"})
    assert resp.json()["status"] == "in_progress"

    # 5. Complete
    resp = await client.post(f"/rides/{ride_id}/complete",
        headers={"Authorization": f"Bearer {driver_token}"})
    assert resp.json()["status"] == "completed"
    assert resp.json()["completed_at"] is not None


@pytest.mark.asyncio
async def test_cancel_ride_by_rider(client: AsyncClient, seed_data):
    rider_token = seed_data["rider_token"]
    driver_token = seed_data["driver_token"]

    # Create and accept
    ride_resp = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 33.99, "dropoff_lng": -6.86,
        "pickup_address": "A", "dropoff_address": "B",
    }, headers={"Authorization": f"Bearer {rider_token}"})
    ride_id = ride_resp.json()["id"]

    await client.post(f"/rides/{ride_id}/accept",
        headers={"Authorization": f"Bearer {driver_token}"})

    # Rider cancels
    resp = await client.post(f"/rides/{ride_id}/cancel",
        headers={"Authorization": f"Bearer {rider_token}"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_cancel_completed_ride_fails(client: AsyncClient, seed_data):
    rider_token = seed_data["rider_token"]
    driver_token = seed_data["driver_token"]

    # Full ride
    ride_resp = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 33.99, "dropoff_lng": -6.86,
        "pickup_address": "A", "dropoff_address": "B",
    }, headers={"Authorization": f"Bearer {rider_token}"})
    ride_id = ride_resp.json()["id"]

    await client.post(f"/rides/{ride_id}/accept", headers={"Authorization": f"Bearer {driver_token}"})
    await client.post(f"/rides/{ride_id}/arriving", headers={"Authorization": f"Bearer {driver_token}"})
    await client.post(f"/rides/{ride_id}/start", headers={"Authorization": f"Bearer {driver_token}"})
    await client.post(f"/rides/{ride_id}/complete", headers={"Authorization": f"Bearer {driver_token}"})

    # Try to cancel completed ride
    resp = await client.post(f"/rides/{ride_id}/cancel",
        headers={"Authorization": f"Bearer {rider_token}"})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_rate_ride(client: AsyncClient, seed_data):
    rider_token = seed_data["rider_token"]
    driver_token = seed_data["driver_token"]

    # Complete a ride
    ride_resp = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 33.99, "dropoff_lng": -6.86,
        "pickup_address": "A", "dropoff_address": "B",
    }, headers={"Authorization": f"Bearer {rider_token}"})
    ride_id = ride_resp.json()["id"]

    await client.post(f"/rides/{ride_id}/accept", headers={"Authorization": f"Bearer {driver_token}"})
    await client.post(f"/rides/{ride_id}/arriving", headers={"Authorization": f"Bearer {driver_token}"})
    await client.post(f"/rides/{ride_id}/start", headers={"Authorization": f"Bearer {driver_token}"})
    await client.post(f"/rides/{ride_id}/complete", headers={"Authorization": f"Bearer {driver_token}"})

    # Rider rates driver
    resp = await client.post(f"/rides/{ride_id}/rate", json={"rating": 5},
        headers={"Authorization": f"Bearer {rider_token}"})
    assert resp.status_code == 200
    assert resp.json()["rating"] == 5

    # Driver rates rider
    resp = await client.post(f"/rides/{ride_id}/rate", json={"rating": 4},
        headers={"Authorization": f"Bearer {driver_token}"})
    assert resp.status_code == 200
    assert resp.json()["rating"] == 4

    # Double rate fails
    resp = await client.post(f"/rides/{ride_id}/rate", json={"rating": 3},
        headers={"Authorization": f"Bearer {rider_token}"})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_rate_invalid_range(client: AsyncClient, seed_data):
    rider_token = seed_data["rider_token"]
    driver_token = seed_data["driver_token"]

    ride_resp = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 33.99, "dropoff_lng": -6.86,
        "pickup_address": "A", "dropoff_address": "B",
    }, headers={"Authorization": f"Bearer {rider_token}"})
    ride_id = ride_resp.json()["id"]

    await client.post(f"/rides/{ride_id}/accept", headers={"Authorization": f"Bearer {driver_token}"})
    await client.post(f"/rides/{ride_id}/arriving", headers={"Authorization": f"Bearer {driver_token}"})
    await client.post(f"/rides/{ride_id}/start", headers={"Authorization": f"Bearer {driver_token}"})
    await client.post(f"/rides/{ride_id}/complete", headers={"Authorization": f"Bearer {driver_token}"})

    # Rating 0 (below range)
    resp = await client.post(f"/rides/{ride_id}/rate", json={"rating": 0},
        headers={"Authorization": f"Bearer {rider_token}"})
    assert resp.status_code == 422

    # Rating 6 (above range)
    resp = await client.post(f"/rides/{ride_id}/rate", json={"rating": 6},
        headers={"Authorization": f"Bearer {rider_token}"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_ride_history(client: AsyncClient, seed_data):
    rider_token = seed_data["rider_token"]
    resp = await client.get("/rides/history",
        headers={"Authorization": f"Bearer {rider_token}"})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_active_ride(client: AsyncClient, seed_data):
    rider_token = seed_data["rider_token"]
    driver_token = seed_data["driver_token"]

    # No active ride
    resp = await client.get("/rides/active",
        headers={"Authorization": f"Bearer {rider_token}"})
    assert resp.json()["ride"] is None

    # Create and accept ride
    ride_resp = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 33.99, "dropoff_lng": -6.86,
        "pickup_address": "A", "dropoff_address": "B",
    }, headers={"Authorization": f"Bearer {rider_token}"})
    ride_id = ride_resp.json()["id"]

    await client.post(f"/rides/{ride_id}/accept",
        headers={"Authorization": f"Bearer {driver_token}"})

    # Active ride should exist
    resp = await client.get("/rides/active",
        headers={"Authorization": f"Bearer {rider_token}"})
    assert resp.json()["ride"] is not None
    assert resp.json()["ride"]["id"] == ride_id
    assert resp.json()["driver_info"] is not None


@pytest.mark.asyncio
async def test_wrong_status_transitions(client: AsyncClient, seed_data):
    """Test invalid state transitions are rejected."""
    rider_token = seed_data["rider_token"]
    driver_token = seed_data["driver_token"]

    ride_resp = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 33.99, "dropoff_lng": -6.86,
        "pickup_address": "A", "dropoff_address": "B",
    }, headers={"Authorization": f"Bearer {rider_token}"})
    ride_id = ride_resp.json()["id"]

    # Can't arrive before accepting
    resp = await client.post(f"/rides/{ride_id}/arriving",
        headers={"Authorization": f"Bearer {driver_token}"})
    assert resp.status_code == 400

    # Can't start before accepting
    resp = await client.post(f"/rides/{ride_id}/start",
        headers={"Authorization": f"Bearer {driver_token}"})
    assert resp.status_code == 400

    # Can't complete before accepting
    resp = await client.post(f"/rides/{ride_id}/complete",
        headers={"Authorization": f"Bearer {driver_token}"})
    assert resp.status_code == 400

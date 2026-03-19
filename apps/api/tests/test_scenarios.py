"""End-to-end scenario tests covering complex workflows."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_multiple_rides_same_rider(client: AsyncClient, seed_data):
    """Rider completes one ride, then requests another."""
    rt = seed_data["rider_token"]
    dt = seed_data["driver_token"]

    # First ride
    r1 = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 33.99, "dropoff_lng": -6.86,
        "pickup_address": "A", "dropoff_address": "B",
    }, headers={"Authorization": f"Bearer {rt}"})
    id1 = r1.json()["id"]

    await client.post(f"/rides/{id1}/accept", headers={"Authorization": f"Bearer {dt}"})
    await client.post(f"/rides/{id1}/arriving", headers={"Authorization": f"Bearer {dt}"})
    await client.post(f"/rides/{id1}/start", headers={"Authorization": f"Bearer {dt}"})
    await client.post(f"/rides/{id1}/complete", headers={"Authorization": f"Bearer {dt}"})

    # Second ride
    r2 = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 34.00, "dropoff_lng": -6.80,
        "pickup_address": "C", "dropoff_address": "D",
    }, headers={"Authorization": f"Bearer {rt}"})
    assert r2.status_code == 201
    id2 = r2.json()["id"]
    assert id2 != id1


@pytest.mark.asyncio
async def test_cancel_then_new_ride(client: AsyncClient, seed_data):
    """Rider cancels a ride, then requests a new one."""
    rt = seed_data["rider_token"]
    dt = seed_data["driver_token"]

    r1 = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 33.99, "dropoff_lng": -6.86,
        "pickup_address": "A", "dropoff_address": "B",
    }, headers={"Authorization": f"Bearer {rt}"})
    id1 = r1.json()["id"]

    await client.post(f"/rides/{id1}/cancel", headers={"Authorization": f"Bearer {rt}"})

    # New ride should work
    r2 = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 34.00, "dropoff_lng": -6.80,
        "pickup_address": "C", "dropoff_address": "D",
    }, headers={"Authorization": f"Bearer {rt}"})
    assert r2.status_code == 201


@pytest.mark.asyncio
async def test_driver_cancel_after_accept(client: AsyncClient, seed_data):
    """Driver accepts then cancels — ride should be cancelled."""
    rt = seed_data["rider_token"]
    dt = seed_data["driver_token"]

    r = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 33.99, "dropoff_lng": -6.86,
        "pickup_address": "A", "dropoff_address": "B",
    }, headers={"Authorization": f"Bearer {rt}"})
    ride_id = r.json()["id"]

    await client.post(f"/rides/{ride_id}/accept", headers={"Authorization": f"Bearer {dt}"})

    # Driver cancels
    resp = await client.post(f"/rides/{ride_id}/cancel", headers={"Authorization": f"Bearer {dt}"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_score_decreases_on_cancel(client: AsyncClient, seed_data):
    """Score should decrease when rider cancels rides."""
    rt = seed_data["rider_token"]

    # Create and cancel a ride
    r = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 33.99, "dropoff_lng": -6.86,
        "pickup_address": "A", "dropoff_address": "B",
    }, headers={"Authorization": f"Bearer {rt}"})
    ride_id = r.json()["id"]
    await client.post(f"/rides/{ride_id}/cancel", headers={"Authorization": f"Bearer {rt}"})

    # Check score
    stats = await client.get("/auth/me/stats", headers={"Authorization": f"Bearer {rt}"})
    rider_stats = stats.json().get("rider", {})
    assert rider_stats["cancelled_rides"] >= 1
    # Score should be less than 5.0 after a cancel
    assert rider_stats["score"] < 5.0


@pytest.mark.asyncio
async def test_commission_percentage(client: AsyncClient, seed_data):
    """Commission should be a percentage of fare."""
    rt = seed_data["rider_token"]
    dt = seed_data["driver_token"]

    r = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 33.99, "dropoff_lng": -6.86,
        "pickup_address": "A", "dropoff_address": "B",
    }, headers={"Authorization": f"Bearer {rt}"})
    ride_id = r.json()["id"]
    fare = r.json()["fare"]

    await client.post(f"/rides/{ride_id}/accept", headers={"Authorization": f"Bearer {dt}"})
    await client.post(f"/rides/{ride_id}/arriving", headers={"Authorization": f"Bearer {dt}"})
    await client.post(f"/rides/{ride_id}/start", headers={"Authorization": f"Bearer {dt}"})
    await client.post(f"/rides/{ride_id}/complete", headers={"Authorization": f"Bearer {dt}"})

    # Check credit transactions
    txns = await client.get("/credits/", headers={"Authorization": f"Bearer {dt}"})
    txn_list = txns.json()

    earned = [t for t in txn_list if t["type"] == "ride_earned"]
    fees = [t for t in txn_list if t["type"] == "ride_fee"]

    assert len(earned) >= 1
    assert len(fees) >= 1
    assert earned[0]["amount"] == fare  # Earned = fare amount
    assert fees[0]["amount"] < 0  # Fee is negative


@pytest.mark.asyncio
async def test_double_accept_fails(client: AsyncClient, seed_data):
    """Second accept on same ride should fail."""
    rt = seed_data["rider_token"]
    dt = seed_data["driver_token"]

    r = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 33.99, "dropoff_lng": -6.86,
        "pickup_address": "A", "dropoff_address": "B",
    }, headers={"Authorization": f"Bearer {rt}"})
    ride_id = r.json()["id"]

    # First accept
    resp1 = await client.post(f"/rides/{ride_id}/accept", headers={"Authorization": f"Bearer {dt}"})
    assert resp1.status_code == 200

    # Second accept
    resp2 = await client.post(f"/rides/{ride_id}/accept", headers={"Authorization": f"Bearer {dt}"})
    assert resp2.status_code == 400


@pytest.mark.asyncio
async def test_skip_arriving_fails(client: AsyncClient, seed_data):
    """Cannot start ride without arriving first."""
    rt = seed_data["rider_token"]
    dt = seed_data["driver_token"]

    r = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 33.99, "dropoff_lng": -6.86,
        "pickup_address": "A", "dropoff_address": "B",
    }, headers={"Authorization": f"Bearer {rt}"})
    ride_id = r.json()["id"]

    await client.post(f"/rides/{ride_id}/accept", headers={"Authorization": f"Bearer {dt}"})

    # Try to start without arriving
    resp = await client.post(f"/rides/{ride_id}/start", headers={"Authorization": f"Bearer {dt}"})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_active_ride_returns_completed_unrated(client: AsyncClient, seed_data):
    """Active ride should return recently completed unrated rides."""
    rt = seed_data["rider_token"]
    dt = seed_data["driver_token"]

    r = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 33.99, "dropoff_lng": -6.86,
        "pickup_address": "A", "dropoff_address": "B",
    }, headers={"Authorization": f"Bearer {rt}"})
    ride_id = r.json()["id"]

    await client.post(f"/rides/{ride_id}/accept", headers={"Authorization": f"Bearer {dt}"})
    await client.post(f"/rides/{ride_id}/arriving", headers={"Authorization": f"Bearer {dt}"})
    await client.post(f"/rides/{ride_id}/start", headers={"Authorization": f"Bearer {dt}"})
    await client.post(f"/rides/{ride_id}/complete", headers={"Authorization": f"Bearer {dt}"})

    # Active ride should still show completed unrated
    active = await client.get("/rides/active", headers={"Authorization": f"Bearer {rt}"})
    assert active.json()["ride"] is not None
    assert active.json()["ride"]["status"] == "completed"

    # Rate it
    await client.post(f"/rides/{ride_id}/rate", json={"rating": 5}, headers={"Authorization": f"Bearer {rt}"})

    # Now active should be empty
    active2 = await client.get("/rides/active", headers={"Authorization": f"Bearer {rt}"})
    assert active2.json()["ride"] is None


@pytest.mark.asyncio
async def test_ride_history_order(client: AsyncClient, seed_data):
    """Ride history should be ordered by most recent first."""
    rt = seed_data["rider_token"]
    dt = seed_data["driver_token"]

    # Create two rides
    for addr in ["First", "Second"]:
        r = await client.post("/rides/request", json={
            "pickup_lat": 33.97, "pickup_lng": -6.85,
            "dropoff_lat": 33.99, "dropoff_lng": -6.86,
            "pickup_address": addr, "dropoff_address": "B",
        }, headers={"Authorization": f"Bearer {rt}"})
        ride_id = r.json()["id"]
        await client.post(f"/rides/{ride_id}/accept", headers={"Authorization": f"Bearer {dt}"})
        await client.post(f"/rides/{ride_id}/arriving", headers={"Authorization": f"Bearer {dt}"})
        await client.post(f"/rides/{ride_id}/start", headers={"Authorization": f"Bearer {dt}"})
        await client.post(f"/rides/{ride_id}/complete", headers={"Authorization": f"Bearer {dt}"})

    history = await client.get("/rides/history", headers={"Authorization": f"Bearer {rt}"})
    rides = history.json()
    assert len(rides) >= 2
    # Most recent first
    assert rides[0]["pickup_address"] == "Second"


@pytest.mark.asyncio
async def test_register_driver_needs_vehicle(client: AsyncClient):
    """Driver registration requires vehicle_model and plate_number."""
    import random, string
    phone = "09" + "".join(random.choices(string.digits, k=8))

    resp = await client.post("/auth/register", json={
        "phone": phone, "name": "No Vehicle", "password": "test123",
        "role": "driver",
    })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_unverified_driver_cannot_accept(client: AsyncClient, seed_data):
    """Unverified driver cannot accept rides."""
    import random, string, subprocess

    # Create unverified driver
    phone = "09" + "".join(random.choices(string.digits, k=8))
    plate = "U-" + "".join(random.choices(string.ascii_uppercase, k=4))
    r = await client.post("/auth/register", json={
        "phone": phone, "name": "Unverified", "password": "test123",
        "role": "driver", "vehicle_model": "Car", "plate_number": plate,
    })
    unverified_token = r.json()["access_token"]

    # Create ride with verified rider
    rt = seed_data["rider_token"]
    ride = await client.post("/rides/request", json={
        "pickup_lat": 33.97, "pickup_lng": -6.85,
        "dropoff_lat": 33.99, "dropoff_lng": -6.86,
        "pickup_address": "A", "dropoff_address": "B",
    }, headers={"Authorization": f"Bearer {rt}"})
    ride_id = ride.json()["id"]

    # Unverified driver tries to accept
    resp = await client.post(f"/rides/{ride_id}/accept",
        headers={"Authorization": f"Bearer {unverified_token}"})
    assert resp.status_code == 403

"""Driver matching logic — find nearby drivers, retry, and cascade ride offers."""

import asyncio
import time
from uuid import UUID

from sqlalchemy import Numeric, func, literal_column, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session_factory
from models.credit import CreditTransaction, CreditType
from models.fare import FareConfig
from models.ride import Ride, RideEvent, RideEventType, RideStatus
from models.user import Driver, DriverStatus
from services.ws_manager import driver_manager, rider_manager

# How long each driver has to accept (seconds)
DRIVER_ACCEPT_TIMEOUT = 15
# Max drivers to try per search round
MAX_DRIVERS_TO_TRY = 5
# Search radius in metres
SEARCH_RADIUS_M = 5000
# Total time to keep searching before giving up (seconds)
MAX_SEARCH_TIME = 90
# Pause between search rounds when no drivers found (seconds)
SEARCH_RETRY_INTERVAL = 5

# In-memory tracking of pending ride offers: ride_id -> asyncio.Event
_pending_accepts: dict[str, asyncio.Event] = {}
_accepted_by: dict[str, UUID] = {}
# Track which drivers already declined/timed out for a ride
_tried_drivers: dict[str, set[UUID]] = {}


async def find_nearby_drivers(
    db: AsyncSession,
    lng: float,
    lat: float,
    exclude_ids: set[UUID] | None = None,
    limit: int = MAX_DRIVERS_TO_TRY,
) -> list[Driver]:
    """Find nearby available, verified drivers with sufficient credits.

    Sorted by a weighted formula configurable by admin:
      match_score = (avg_rating * weight_rating) - (distance_km * weight_distance)
    Higher match_score = offered first.
    """
    # Get config (commission + weights)
    config_result = await db.execute(
        select(FareConfig).where(FareConfig.is_active.is_(True)).limit(1)
    )
    config = config_result.scalar_one_or_none()
    # For percentage commission, use a minimum threshold (e.g. 1 DH) for credit check
    commission_type = getattr(config, "commission_type", "fixed") or "fixed"
    if commission_type == "percentage":
        commission = 1.00  # minimum credit needed for percentage-based
    else:
        commission = float(config.commission_per_ride) if config else 1.00
    w_rating = float(config.weight_rating) if config and config.weight_rating else 1.0
    w_distance = float(config.weight_distance) if config and config.weight_distance else 0.5

    conditions = [
        Driver.is_available.is_(True),
        Driver.status == DriverStatus.verified,
        Driver.credit_balance >= commission,
        Driver.current_location.isnot(None),
        text(
            "ST_DWithin("
            "drivers.current_location::geography, "
            f"ST_SetSRID(ST_MakePoint({lng}, {lat}), 4326)::geography, "
            f"{SEARCH_RADIUS_M})"
        ),
    ]

    if exclude_ids:
        for eid in exclude_ids:
            conditions.append(Driver.id != eid)

    # Subquery: average rating per driver
    from models.ride import Ride as RideModel
    avg_rating_sub = (
        select(
            RideModel.driver_id,
            func.coalesce(func.avg(RideModel.rating), 5.0).label("avg_rating"),
        )
        .where(RideModel.rating.isnot(None))
        .group_by(RideModel.driver_id)
        .subquery()
    )

    # Weighted formula:
    # match_score = (avg_rating * weight_rating) - (distance_km * weight_distance)
    distance_km_expr = literal_column(
        f"(ST_Distance("
        f"drivers.current_location::geography, "
        f"ST_SetSRID(ST_MakePoint({lng}, {lat}), 4326)::geography) / 1000.0)"
    )

    match_score = (
        func.coalesce(avg_rating_sub.c.avg_rating, 5.0) * w_rating
        - distance_km_expr * w_distance
    )

    stmt = (
        select(Driver)
        .outerjoin(avg_rating_sub, Driver.id == avg_rating_sub.c.driver_id)
        .where(*conditions)
        .order_by(match_score.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def offer_ride_to_driver(
    ride_id: UUID, driver: Driver, ride: Ride,
    pickup_lng: float = 0, pickup_lat: float = 0,
    dropoff_lng: float = 0, dropoff_lat: float = 0,
    rider_phone: str | None = None,
) -> bool:
    """Send a ride offer to a driver via WebSocket and wait for acceptance."""
    event = asyncio.Event()
    key = str(ride_id)
    _pending_accepts[key] = event

    sent = await driver_manager.send(
        driver.user_id,
        {
            "type": "ride_request",
            "data": {
                "ride_id": str(ride_id),
                "pickup_address": ride.pickup_address,
                "dropoff_address": ride.dropoff_address,
                "pickup_lat": pickup_lat,
                "pickup_lng": pickup_lng,
                "dropoff_lat": dropoff_lat,
                "dropoff_lng": dropoff_lng,
                "fare": float(ride.fare) if ride.fare else None,
                "distance_km": float(ride.distance_km) if ride.distance_km else None,
                "duration_min": ride.duration_min,
                "rider_phone": rider_phone,
            },
        },
    )
    if not sent:
        _pending_accepts.pop(key, None)
        return False

    try:
        await asyncio.wait_for(event.wait(), timeout=DRIVER_ACCEPT_TIMEOUT)
        accepted_driver = _accepted_by.pop(key, None)
        _pending_accepts.pop(key, None)
        return accepted_driver == driver.id
    except asyncio.TimeoutError:
        _pending_accepts.pop(key, None)
        await driver_manager.send(
            driver.user_id,
            {"type": "ride_expired", "data": {"ride_id": str(ride_id)}},
        )
        return False


def signal_driver_accepted(ride_id: UUID, driver_id: UUID) -> bool:
    """Called when a driver accepts — signals the waiting offer coroutine."""
    key = str(ride_id)
    event = _pending_accepts.get(key)
    if event is None:
        return False
    _accepted_by[key] = driver_id
    event.set()
    return True


_matching_disabled = False  # Set to True in tests to skip matching

async def run_matching(ride_id: UUID, pickup_lng: float, pickup_lat: float, dropoff_lng: float = 0, dropoff_lat: float = 0) -> None:
    """Background task: keep searching for drivers up to MAX_SEARCH_TIME seconds.

    - Searches for nearby drivers sorted by score then distance
    - If no drivers found, waits and retries (a driver may come online)
    - Sends periodic search updates to the rider
    - Only gives up after MAX_SEARCH_TIME seconds
    """
    if _matching_disabled:
        return

    key = str(ride_id)
    _tried_drivers[key] = set()
    start = time.monotonic()

    try:
        while True:
            elapsed = time.monotonic() - start
            if elapsed >= MAX_SEARCH_TIME:
                break

            async with get_session_factory()() as db:
                ride_result = await db.execute(select(Ride).where(Ride.id == ride_id))
                ride = ride_result.scalar_one_or_none()
                if ride is None or ride.status != RideStatus.requested:
                    return  # Ride was cancelled or already matched

                # Get rider phone for driver to call
                from models.user import Rider, User
                rider_result = await db.execute(
                    select(User).join(Rider, Rider.user_id == User.id).where(Rider.id == ride.rider_id)
                )
                rider_user = rider_result.scalar_one_or_none()
                rider_phone = rider_user.phone if rider_user else None

                drivers = await find_nearby_drivers(
                    db, pickup_lng, pickup_lat,
                    exclude_ids=_tried_drivers.get(key, set()),
                )

                if not drivers:
                    # No drivers available — notify rider we're still searching
                    await rider_manager.send(
                        ride.rider_id,
                        {
                            "type": "search_update",
                            "data": {
                                "ride_id": str(ride_id),
                                "elapsed": int(elapsed),
                                "message": "Looking for nearby drivers...",
                            },
                        },
                    )
                    # Wait before retrying
                    await asyncio.sleep(SEARCH_RETRY_INTERVAL)
                    continue

                # Try each driver
                for driver in drivers:
                    # Re-check ride status
                    await db.refresh(ride)
                    if ride.status != RideStatus.requested:
                        return

                    accepted = await offer_ride_to_driver(ride_id, driver, ride, pickup_lng, pickup_lat, dropoff_lng, dropoff_lat, rider_phone)
                    if accepted:
                        return  # Done — driver accepted

                    # Track as tried so we don't re-offer
                    _tried_drivers.setdefault(key, set()).add(driver.id)

                # All found drivers declined — wait then search again
                await rider_manager.send(
                    ride.rider_id,
                    {
                        "type": "search_update",
                        "data": {
                            "ride_id": str(ride_id),
                            "elapsed": int(time.monotonic() - start),
                            "message": "Still searching for a driver...",
                        },
                    },
                )
                await asyncio.sleep(SEARCH_RETRY_INTERVAL)

        # Timed out — cancel the ride
        async with get_session_factory()() as db:
            ride_result = await db.execute(select(Ride).where(Ride.id == ride_id))
            ride = ride_result.scalar_one_or_none()
            if ride and ride.status == RideStatus.requested:
                ride.status = RideStatus.cancelled
                event = RideEvent(ride_id=ride.id, event=RideEventType.cancelled)
                db.add(event)
                await db.commit()

                await rider_manager.send(
                    ride.rider_id,
                    {
                        "type": "ride_status",
                        "data": {
                            "ride_id": str(ride_id),
                            "status": "cancelled",
                            "reason": "no_drivers_available",
                        },
                    },
                )
    finally:
        _tried_drivers.pop(key, None)

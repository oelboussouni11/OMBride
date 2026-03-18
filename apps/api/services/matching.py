"""Driver matching logic — find nearby drivers and cascade ride offers."""

import asyncio
from uuid import UUID

from sqlalchemy import Numeric, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session_factory
from models.credit import CreditTransaction, CreditType
from models.fare import FareConfig
from models.ride import Ride, RideEvent, RideEventType, RideStatus
from models.user import Driver, DriverStatus
from services.ws_manager import driver_manager, rider_manager

# How long each driver has to accept (seconds)
DRIVER_ACCEPT_TIMEOUT = 15
# Max drivers to try
MAX_DRIVERS_TO_TRY = 5
# Search radius in metres
SEARCH_RADIUS_M = 5000

# In-memory tracking of pending ride offers: ride_id -> asyncio.Event
_pending_accepts: dict[str, asyncio.Event] = {}
_accepted_by: dict[str, UUID] = {}


async def find_nearby_drivers(
    db: AsyncSession,
    lng: float,
    lat: float,
    limit: int = MAX_DRIVERS_TO_TRY,
) -> list[Driver]:
    """Find nearby available, verified drivers with sufficient credits."""
    # Get active commission rate
    fare_result = await db.execute(
        select(FareConfig.commission_per_ride).where(FareConfig.is_active.is_(True)).limit(1)
    )
    commission = fare_result.scalar_one_or_none() or 1.00

    stmt = (
        select(Driver)
        .where(
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
        )
        .order_by(
            text(
                "ST_Distance("
                "drivers.current_location::geography, "
                f"ST_SetSRID(ST_MakePoint({lng}, {lat}), 4326)::geography)"
            )
        )
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def offer_ride_to_driver(ride_id: UUID, driver: Driver, ride: Ride) -> bool:
    """Send a ride offer to a driver via WebSocket and wait for acceptance."""
    event = asyncio.Event()
    key = str(ride_id)
    _pending_accepts[key] = event

    # Send ride request to driver
    sent = await driver_manager.send(
        driver.user_id,
        {
            "type": "ride_request",
            "data": {
                "ride_id": str(ride_id),
                "pickup_address": ride.pickup_address,
                "dropoff_address": ride.dropoff_address,
                "fare": float(ride.fare) if ride.fare else None,
                "distance_km": float(ride.distance_km) if ride.distance_km else None,
                "duration_min": ride.duration_min,
            },
        },
    )
    if not sent:
        _pending_accepts.pop(key, None)
        return False

    # Wait for driver to accept (or timeout)
    try:
        await asyncio.wait_for(event.wait(), timeout=DRIVER_ACCEPT_TIMEOUT)
        accepted_driver = _accepted_by.pop(key, None)
        _pending_accepts.pop(key, None)
        return accepted_driver == driver.id
    except asyncio.TimeoutError:
        _pending_accepts.pop(key, None)
        # Notify driver the offer expired
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


async def run_matching(ride_id: UUID, pickup_lng: float, pickup_lat: float) -> None:
    """Background task: cascade ride offers to nearby drivers."""
    async with get_session_factory()() as db:
        ride_result = await db.execute(select(Ride).where(Ride.id == ride_id))
        ride = ride_result.scalar_one_or_none()
        if ride is None or ride.status != RideStatus.requested:
            return

        drivers = await find_nearby_drivers(db, pickup_lng, pickup_lat)

        for driver in drivers:
            # Re-check ride is still requested
            await db.refresh(ride)
            if ride.status != RideStatus.requested:
                return

            accepted = await offer_ride_to_driver(ride_id, driver, ride)
            if accepted:
                return  # Driver accepted — handled in the accept endpoint

        # No driver accepted — update ride status
        await db.refresh(ride)
        if ride.status == RideStatus.requested:
            ride.status = RideStatus.cancelled
            event = RideEvent(ride_id=ride.id, event=RideEventType.cancelled)
            db.add(event)
            await db.commit()

            # Notify rider
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

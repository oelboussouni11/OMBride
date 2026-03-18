"""Driver location forwarding — pushes driver location to the matched rider."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session_factory
from models.ride import Ride, RideStatus
from services.ws_manager import rider_manager


async def forward_driver_location_to_rider(
    driver_id: UUID,
    lat: float,
    lng: float,
) -> None:
    """If the driver has an active ride, send their location to the rider."""
    active_statuses = [RideStatus.matched, RideStatus.arriving, RideStatus.in_progress]

    async with get_session_factory()() as db:
        result = await db.execute(
            select(Ride)
            .where(Ride.driver_id == driver_id, Ride.status.in_(active_statuses))
            .limit(1)
        )
        ride = result.scalar_one_or_none()
        if ride is None:
            return

    await rider_manager.send(
        ride.rider_id,
        {
            "type": "driver_location",
            "data": {"lat": lat, "lng": lng, "ride_id": str(ride.id)},
        },
    )

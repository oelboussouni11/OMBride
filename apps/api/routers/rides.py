"""Ride routes — estimate, request, accept, status transitions, rating."""

import asyncio
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from dependencies import get_current_user, get_redis, require_role, require_verified_driver
from models.credit import CreditTransaction, CreditType
from models.fare import FareConfig
from models.ride import Ride, RideEvent, RideEventType, RideStatus
from models.user import Driver, Rider, User, UserRole
from schemas.ride import (
    EstimateRequest,
    EstimateResponse,
    RideDetailResponse,
    RideRequest,
    RideResponse,
)
from services.fare import calculate_fare, get_active_fare_config, get_route_info
from services.matching import run_matching, signal_driver_accepted
from services.ws_manager import admin_manager, driver_manager, rider_manager

router = APIRouter(prefix="/rides", tags=["rides"])


# ── Helpers ──────────────────────────────────────────────────────────────────


def _make_point(lng: float, lat: float):
    """Create a PostGIS POINT WKT element."""
    return f"SRID=4326;POINT({lng} {lat})"


async def _get_ride_or_404(db: AsyncSession, ride_id: UUID) -> Ride:
    result = await db.execute(select(Ride).where(Ride.id == ride_id))
    ride = result.scalar_one_or_none()
    if ride is None:
        raise HTTPException(status_code=404, detail="Ride not found")
    return ride


# ── Active Ride ──────────────────────────────────────────────────────────────


@router.get("/active")
async def get_active_ride(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get the current active ride for this user (if any).
    Returns ride + driver/rider info for state recovery on refresh.
    """
    active_statuses = [
        RideStatus.requested, RideStatus.matched,
        RideStatus.arriving, RideStatus.in_progress,
    ]

    ride = None
    if user.rider:
        result = await db.execute(
            select(Ride).where(
                Ride.rider_id == user.rider.id,
                Ride.status.in_(active_statuses),
            ).order_by(Ride.created_at.desc()).limit(1)
        )
        ride = result.scalar_one_or_none()
    elif user.driver:
        result = await db.execute(
            select(Ride).where(
                Ride.driver_id == user.driver.id,
                Ride.status.in_(active_statuses),
            ).order_by(Ride.created_at.desc()).limit(1)
        )
        ride = result.scalar_one_or_none()

    if ride is None:
        return {"ride": None}

    # Build response with driver info for rider, or rider info for driver
    resp: dict = {
        "ride": {
            "id": str(ride.id),
            "rider_id": str(ride.rider_id),
            "driver_id": str(ride.driver_id) if ride.driver_id else None,
            "pickup_address": ride.pickup_address,
            "dropoff_address": ride.dropoff_address,
            "distance_km": float(ride.distance_km) if ride.distance_km else None,
            "duration_min": ride.duration_min,
            "fare": float(ride.fare) if ride.fare else None,
            "status": ride.status.value,
            "created_at": ride.created_at.isoformat() if ride.created_at else None,
        },
    }

    # If rider, include driver info
    if user.rider and ride.driver_id:
        from sqlalchemy.orm import selectinload as _sel
        driver_result = await db.execute(
            select(Driver).options(_sel(Driver.user)).where(Driver.id == ride.driver_id)
        )
        driver = driver_result.scalar_one_or_none()
        if driver:
            # Get driver average rating
            from sqlalchemy import func as sqlfunc
            avg_result = await db.execute(
                select(sqlfunc.avg(Ride.rating)).where(
                    Ride.driver_id == driver.id, Ride.rating.isnot(None)
                )
            )
            avg_rating = avg_result.scalar()
            resp["driver_info"] = {
                "driver_name": driver.user.name,
                "driver_phone": driver.user.phone,
                "vehicle_model": driver.vehicle_model,
                "plate_number": driver.plate_number,
                "average_rating": round(float(avg_rating or 5.0), 1),
            }

    return resp


# ── History ──────────────────────────────────────────────────────────────────


@router.get("/history", response_model=list[RideResponse])
async def ride_history(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[RideResponse]:
    """Get ride history for the current user (rider or driver)."""
    if user.rider:
        result = await db.execute(
            select(Ride)
            .where(Ride.rider_id == user.rider.id)
            .order_by(Ride.created_at.desc())
            .limit(50)
        )
    elif user.driver:
        result = await db.execute(
            select(Ride)
            .where(Ride.driver_id == user.driver.id)
            .order_by(Ride.created_at.desc())
            .limit(50)
        )
    else:
        return []

    rides = result.scalars().all()
    return [
        RideResponse(
            id=r.id,
            rider_id=r.rider_id,
            driver_id=r.driver_id,
            pickup_address=r.pickup_address,
            dropoff_address=r.dropoff_address,
            distance_km=float(r.distance_km) if r.distance_km else None,
            duration_min=r.duration_min,
            fare=float(r.fare) if r.fare else None,
            status=r.status,
            created_at=r.created_at,
            completed_at=r.completed_at,
        )
        for r in rides
    ]


# ── Estimate ─────────────────────────────────────────────────────────────────


@router.post("/estimate", response_model=EstimateResponse)
async def estimate_ride(
    body: EstimateRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> EstimateResponse:
    """Calculate a fare estimate without creating a ride."""
    distance_km, duration_min = await get_route_info(
        body.pickup_lat, body.pickup_lng, body.dropoff_lat, body.dropoff_lng
    )
    config = await get_active_fare_config(db)
    fare = calculate_fare(distance_km, duration_min, config)
    return EstimateResponse(
        distance_km=distance_km,
        duration_min=duration_min,
        estimated_fare=fare,
    )


# ── Request ──────────────────────────────────────────────────────────────────


@router.post(
    "/request",
    response_model=RideResponse,
    status_code=status.HTTP_201_CREATED,
)
async def request_ride(
    body: RideRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.rider)),
) -> RideResponse:
    """Rider requests a new ride."""
    # Get rider record
    result = await db.execute(select(Rider).where(Rider.user_id == user.id))
    rider = result.scalar_one_or_none()
    if rider is None:
        raise HTTPException(status_code=400, detail="Rider profile not found")

    # Calculate route and fare
    distance_km, duration_min = await get_route_info(
        body.pickup_lat, body.pickup_lng, body.dropoff_lat, body.dropoff_lng
    )
    config = await get_active_fare_config(db)
    fare = calculate_fare(distance_km, duration_min, config)

    # Create ride
    ride = Ride(
        rider_id=rider.id,
        pickup_location=_make_point(body.pickup_lng, body.pickup_lat),
        dropoff_location=_make_point(body.dropoff_lng, body.dropoff_lat),
        pickup_address=body.pickup_address,
        dropoff_address=body.dropoff_address,
        distance_km=distance_km,
        duration_min=duration_min,
        fare=fare,
        status=RideStatus.requested,
    )
    db.add(ride)
    await db.flush()

    # Log event
    event = RideEvent(ride_id=ride.id, event=RideEventType.requested)
    db.add(event)
    await db.commit()
    await db.refresh(ride)

    # Trigger driver matching in background
    background_tasks.add_task(run_matching, ride.id, body.pickup_lng, body.pickup_lat, body.dropoff_lng, body.dropoff_lat)

    return RideResponse(
        id=ride.id,
        rider_id=ride.rider_id,
        driver_id=ride.driver_id,
        pickup_address=ride.pickup_address,
        dropoff_address=ride.dropoff_address,
        distance_km=float(ride.distance_km) if ride.distance_km else None,
        duration_min=ride.duration_min,
        fare=float(ride.fare) if ride.fare else None,
        status=ride.status,
        created_at=ride.created_at,
        completed_at=ride.completed_at,
    )


# ── Accept ───────────────────────────────────────────────────────────────────


@router.post("/{ride_id}/accept", response_model=RideResponse)
async def accept_ride(
    ride_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_verified_driver),
) -> RideResponse:
    """Verified driver accepts a ride."""
    ride = await _get_ride_or_404(db, ride_id)

    if ride.status != RideStatus.requested:
        raise HTTPException(status_code=400, detail="Ride is no longer available")

    driver = user.driver
    if driver is None:
        raise HTTPException(status_code=400, detail="Driver profile not found")

    # Check credits
    config = await get_active_fare_config(db)
    if float(driver.credit_balance) < float(config.commission_per_ride):
        raise HTTPException(status_code=400, detail="Insufficient credits")

    # Update ride
    ride.status = RideStatus.matched
    ride.driver_id = driver.id
    event = RideEvent(ride_id=ride.id, event=RideEventType.driver_assigned)
    db.add(event)
    await db.commit()
    await db.refresh(ride)

    # Signal the matching task
    signal_driver_accepted(ride_id, driver.id)

    # Notify rider
    # Get driver average rating
    from sqlalchemy import func as sqlfunc
    avg_result = await db.execute(
        select(sqlfunc.avg(Ride.rating)).where(
            Ride.driver_id == driver.id, Ride.rating.isnot(None)
        )
    )
    avg_rating = avg_result.scalar()

    await rider_manager.send(
        ride.rider_id,
        {
            "type": "ride_accepted",
            "data": {
                "ride_id": str(ride_id),
                "driver_name": user.name,
                "driver_phone": user.phone,
                "vehicle_model": driver.vehicle_model,
                "plate_number": driver.plate_number,
                "average_rating": round(float(avg_rating or 5.0), 1),
            },
        },
    )

    return RideResponse(
        id=ride.id,
        rider_id=ride.rider_id,
        driver_id=ride.driver_id,
        pickup_address=ride.pickup_address,
        dropoff_address=ride.dropoff_address,
        distance_km=float(ride.distance_km) if ride.distance_km else None,
        duration_min=ride.duration_min,
        fare=float(ride.fare) if ride.fare else None,
        status=ride.status,
        created_at=ride.created_at,
        completed_at=ride.completed_at,
    )


# ── Arriving ─────────────────────────────────────────────────────────────────


@router.post("/{ride_id}/arriving", response_model=RideResponse)
async def arriving(
    ride_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_verified_driver),
) -> RideResponse:
    """Driver signals arrival at pickup."""
    ride = await _get_ride_or_404(db, ride_id)

    if ride.status != RideStatus.matched:
        raise HTTPException(status_code=400, detail="Ride is not in matched state")
    if ride.driver_id != user.driver.id:
        raise HTTPException(status_code=403, detail="Not your ride")

    ride.status = RideStatus.arriving
    event = RideEvent(ride_id=ride.id, event=RideEventType.driver_arriving)
    db.add(event)
    await db.commit()
    await db.refresh(ride)

    await rider_manager.send(
        ride.rider_id,
        {"type": "ride_status", "data": {"ride_id": str(ride_id), "status": "arriving"}},
    )

    return RideResponse(
        id=ride.id,
        rider_id=ride.rider_id,
        driver_id=ride.driver_id,
        pickup_address=ride.pickup_address,
        dropoff_address=ride.dropoff_address,
        distance_km=float(ride.distance_km) if ride.distance_km else None,
        duration_min=ride.duration_min,
        fare=float(ride.fare) if ride.fare else None,
        status=ride.status,
        created_at=ride.created_at,
        completed_at=ride.completed_at,
    )


# ── Start ────────────────────────────────────────────────────────────────────


@router.post("/{ride_id}/start", response_model=RideResponse)
async def start_ride(
    ride_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_verified_driver),
) -> RideResponse:
    """Driver starts the ride (rider picked up)."""
    ride = await _get_ride_or_404(db, ride_id)

    if ride.status != RideStatus.arriving:
        raise HTTPException(status_code=400, detail="Ride is not in arriving state")
    if ride.driver_id != user.driver.id:
        raise HTTPException(status_code=403, detail="Not your ride")

    ride.status = RideStatus.in_progress
    event = RideEvent(ride_id=ride.id, event=RideEventType.ride_started)
    db.add(event)
    await db.commit()
    await db.refresh(ride)

    await rider_manager.send(
        ride.rider_id,
        {"type": "ride_status", "data": {"ride_id": str(ride_id), "status": "in_progress"}},
    )

    return RideResponse(
        id=ride.id,
        rider_id=ride.rider_id,
        driver_id=ride.driver_id,
        pickup_address=ride.pickup_address,
        dropoff_address=ride.dropoff_address,
        distance_km=float(ride.distance_km) if ride.distance_km else None,
        duration_min=ride.duration_min,
        fare=float(ride.fare) if ride.fare else None,
        status=ride.status,
        created_at=ride.created_at,
        completed_at=ride.completed_at,
    )


# ── Complete ─────────────────────────────────────────────────────────────────


@router.post("/{ride_id}/complete", response_model=RideResponse)
async def complete_ride(
    ride_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_verified_driver),
) -> RideResponse:
    """Driver completes the ride — deducts commission from driver credits."""
    ride = await _get_ride_or_404(db, ride_id)

    if ride.status != RideStatus.in_progress:
        raise HTTPException(status_code=400, detail="Ride is not in progress")
    if ride.driver_id != user.driver.id:
        raise HTTPException(status_code=403, detail="Not your ride")

    config = await get_active_fare_config(db)
    fare_amount = float(ride.fare) if ride.fare else 0

    # Calculate commission: fixed DH or percentage of fare
    commission_type = getattr(config, "commission_type", "fixed") or "fixed"
    if commission_type == "percentage":
        commission = round(fare_amount * float(config.commission_per_ride) / 100, 2)
    else:
        commission = float(config.commission_per_ride)

    # Deduct commission
    driver = user.driver
    driver.credit_balance = float(driver.credit_balance) - commission

    # Record ride earned (the fare the driver made)
    earned_txn = CreditTransaction(
        driver_id=driver.id,
        amount=fare_amount,
        type=CreditType.ride_earned,
        reference_code=f"Ride {str(ride.id)[:8]} — {ride.pickup_address} to {ride.dropoff_address}",
    )
    db.add(earned_txn)

    # Record commission deduction
    commission_label = f"{config.commission_per_ride}%" if commission_type == "percentage" else f"{commission:.2f} DH"
    fee_txn = CreditTransaction(
        driver_id=driver.id,
        amount=-commission,
        type=CreditType.ride_fee,
        reference_code=f"Commission on {fare_amount:.2f} DH fare ({commission_label})",
    )
    db.add(fee_txn)

    ride.status = RideStatus.completed
    ride.completed_at = datetime.now(timezone.utc)
    event = RideEvent(ride_id=ride.id, event=RideEventType.ride_completed)
    db.add(event)
    await db.commit()
    await db.refresh(ride)

    # Notify rider
    await rider_manager.send(
        ride.rider_id,
        {
            "type": "ride_status",
            "data": {
                "ride_id": str(ride_id),
                "status": "completed",
                "fare": float(ride.fare) if ride.fare else None,
            },
        },
    )

    # Notify admin
    await admin_manager.broadcast(
        {
            "type": "ride_completed",
            "data": {"ride_id": str(ride_id), "fare": float(ride.fare) if ride.fare else None},
        }
    )

    return RideResponse(
        id=ride.id,
        rider_id=ride.rider_id,
        driver_id=ride.driver_id,
        pickup_address=ride.pickup_address,
        dropoff_address=ride.dropoff_address,
        distance_km=float(ride.distance_km) if ride.distance_km else None,
        duration_min=ride.duration_min,
        fare=float(ride.fare) if ride.fare else None,
        status=ride.status,
        created_at=ride.created_at,
        completed_at=ride.completed_at,
    )


# ── Cancel ───────────────────────────────────────────────────────────────────


@router.post("/{ride_id}/cancel", response_model=RideResponse)
async def cancel_ride(
    ride_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RideResponse:
    """Either rider or driver cancels the ride."""
    ride = await _get_ride_or_404(db, ride_id)

    if ride.status in (RideStatus.completed, RideStatus.cancelled):
        raise HTTPException(status_code=400, detail="Ride already finished or cancelled")

    # Verify the user is part of this ride
    is_rider = False
    is_driver = False
    if user.rider and ride.rider_id == user.rider.id:
        is_rider = True
    if user.driver and ride.driver_id == user.driver.id:
        is_driver = True

    if not is_rider and not is_driver and user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Not authorized to cancel this ride")

    ride.status = RideStatus.cancelled
    event = RideEvent(ride_id=ride.id, event=RideEventType.cancelled)
    db.add(event)
    await db.commit()
    await db.refresh(ride)

    # Notify the other party
    if is_rider and ride.driver_id:
        # Notify driver that rider cancelled
        driver_result = await db.execute(select(Driver).where(Driver.id == ride.driver_id))
        driver = driver_result.scalar_one_or_none()
        if driver:
            await driver_manager.send(
                driver.user_id,
                {"type": "ride_status", "data": {"ride_id": str(ride_id), "status": "cancelled", "reason": "rider_cancelled"}},
            )
    if is_driver:
        await rider_manager.send(
            ride.rider_id,
            {"type": "ride_status", "data": {"ride_id": str(ride_id), "status": "cancelled"}},
        )

    return RideResponse(
        id=ride.id,
        rider_id=ride.rider_id,
        driver_id=ride.driver_id,
        pickup_address=ride.pickup_address,
        dropoff_address=ride.dropoff_address,
        distance_km=float(ride.distance_km) if ride.distance_km else None,
        duration_min=ride.duration_min,
        fare=float(ride.fare) if ride.fare else None,
        status=ride.status,
        created_at=ride.created_at,
        completed_at=ride.completed_at,
    )


# ── Rate ────────────────────────────────────────────────────────────────────


class RateRideRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5)


@router.post("/{ride_id}/rate")
async def rate_ride(
    ride_id: UUID,
    body: RateRideRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Rate a completed ride. Rider rates driver, driver rates rider."""
    ride = await _get_ride_or_404(db, ride_id)
    if ride.status != RideStatus.completed:
        raise HTTPException(status_code=400, detail="Can only rate completed rides")

    is_rider = user.rider is not None and ride.rider_id == user.rider.id
    is_driver = user.driver is not None and ride.driver_id == user.driver.id

    if not is_rider and not is_driver:
        raise HTTPException(status_code=403, detail="Not part of this ride")

    if is_rider:
        if ride.rating is not None:
            raise HTTPException(status_code=400, detail="Already rated")
        ride.rating = body.rating
    elif is_driver:
        if ride.rider_rating is not None:
            raise HTTPException(status_code=400, detail="Already rated")
        ride.rider_rating = body.rating

    await db.commit()
    return {"status": "ok", "rating": body.rating}

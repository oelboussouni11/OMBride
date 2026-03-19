"""Admin dashboard routes — stats, fare config."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from dependencies import require_admin
from models.credit import CreditTransaction, CreditType
from models.fare import FareConfig
from models.ride import Ride, RideStatus
from models.user import Driver, DriverStatus, Rider, User
from schemas.admin import (
    DashboardResponse,
    DashboardStats,
    FareConfigResponse,
    FareConfigUpdateRequest,
    RecentRide,
    RideListItem,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard", response_model=DashboardResponse)
async def dashboard(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> DashboardResponse:
    """Return high-level dashboard statistics."""
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = today - timedelta(days=7)
    month_ago = today - timedelta(days=30)

    # Ride counts
    rides_today = (await db.execute(
        select(func.count()).select_from(Ride).where(Ride.created_at >= today)
    )).scalar() or 0

    rides_week = (await db.execute(
        select(func.count()).select_from(Ride).where(Ride.created_at >= week_ago)
    )).scalar() or 0

    rides_month = (await db.execute(
        select(func.count()).select_from(Ride).where(Ride.created_at >= month_ago)
    )).scalar() or 0

    # Total commission revenue (sum of ride_fee transactions, absolute value)
    revenue = (await db.execute(
        select(func.coalesce(func.sum(func.abs(CreditTransaction.amount)), 0))
        .where(CreditTransaction.type == CreditType.ride_fee)
    )).scalar() or 0

    # Active drivers (online + verified)
    active_drivers = (await db.execute(
        select(func.count()).select_from(Driver)
        .where(Driver.is_available.is_(True), Driver.status == DriverStatus.verified)
    )).scalar() or 0

    # Pending verifications
    pending = (await db.execute(
        select(func.count()).select_from(Driver)
        .where(Driver.status == DriverStatus.pending)
    )).scalar() or 0

    # Recent 10 rides
    rides_result = await db.execute(
        select(Ride)
        .options(
            selectinload(Ride.rider).selectinload(Rider.user),
            selectinload(Ride.driver).selectinload(Driver.user),
        )
        .order_by(Ride.created_at.desc())
        .limit(10)
    )
    rides = rides_result.scalars().all()

    recent = [
        RecentRide(
            id=r.id,
            rider_name=r.rider.user.name if r.rider else "Unknown",
            driver_name=r.driver.user.name if r.driver else None,
            pickup_address=r.pickup_address,
            dropoff_address=r.dropoff_address,
            fare=float(r.fare) if r.fare else None,
            status=r.status,
            created_at=r.created_at,
        )
        for r in rides
    ]

    return DashboardResponse(
        stats=DashboardStats(
            rides_today=rides_today,
            rides_week=rides_week,
            rides_month=rides_month,
            revenue_total=float(revenue),
            active_drivers=active_drivers,
            pending_verifications=pending,
        ),
        recent_rides=recent,
    )


@router.get("/fare-config", response_model=FareConfigResponse)
async def get_fare_config(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> FareConfigResponse:
    """Return the current active fare configuration."""
    result = await db.execute(
        select(FareConfig).where(FareConfig.is_active.is_(True)).limit(1)
    )
    config = result.scalar_one_or_none()
    if config is None:
        raise HTTPException(status_code=404, detail="No active fare config")
    return FareConfigResponse(
        id=config.id,
        base_fare=float(config.base_fare),
        price_per_km=float(config.price_per_km),
        price_per_min=float(config.price_per_min),
        booking_fee=float(config.booking_fee),
        minimum_fare=float(config.minimum_fare),
        commission_per_ride=float(config.commission_per_ride),
        is_active=config.is_active,
        updated_at=config.updated_at,
    )


@router.put("/fare-config", response_model=FareConfigResponse)
async def update_fare_config(
    body: FareConfigUpdateRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> FareConfigResponse:
    """Deactivate old config and create a new active one."""
    # Deactivate existing
    await db.execute(
        update(FareConfig).where(FareConfig.is_active.is_(True)).values(is_active=False)
    )

    config = FareConfig(
        base_fare=body.base_fare,
        price_per_km=body.price_per_km,
        price_per_min=body.price_per_min,
        booking_fee=body.booking_fee,
        minimum_fare=body.minimum_fare,
        commission_per_ride=body.commission_per_ride,
        commission_type=body.commission_type,
        weight_rating=body.weight_rating,
        weight_distance=body.weight_distance,
        is_active=True,
        updated_by=admin.id,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)

    return FareConfigResponse(
        id=config.id,
        base_fare=float(config.base_fare),
        price_per_km=float(config.price_per_km),
        price_per_min=float(config.price_per_min),
        booking_fee=float(config.booking_fee),
        minimum_fare=float(config.minimum_fare),
        commission_per_ride=float(config.commission_per_ride),
        is_active=config.is_active,
        updated_at=config.updated_at,
    )


@router.get("/rides", response_model=list[RideListItem])
async def list_rides(
    status: RideStatus | None = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[RideListItem]:
    """List all rides with optional status filter."""
    stmt = (
        select(Ride)
        .options(
            selectinload(Ride.rider).selectinload(Rider.user),
            selectinload(Ride.driver).selectinload(Driver.user),
        )
        .order_by(Ride.created_at.desc())
    )
    if status is not None:
        stmt = stmt.where(Ride.status == status)

    result = await db.execute(stmt)
    rides = result.scalars().all()

    return [
        RideListItem(
            id=r.id,
            rider_name=r.rider.user.name if r.rider else "Unknown",
            driver_name=r.driver.user.name if r.driver else None,
            pickup_address=r.pickup_address,
            dropoff_address=r.dropoff_address,
            fare=float(r.fare) if r.fare else None,
            status=r.status,
            created_at=r.created_at,
        )
        for r in rides
    ]

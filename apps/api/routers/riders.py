"""Rider management routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from dependencies import get_current_user, require_admin
from models.ride import Ride
from models.user import Rider, User, UserRole
from schemas.admin import RiderListItem

router = APIRouter(prefix="/riders", tags=["riders"])


# ── Saved locations schemas ──────────────────────────────────────────────────


class SavedLocation(BaseModel):
    label: str = Field(..., min_length=1, max_length=50)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    address: str = Field("", max_length=200)


class SavedLocationResponse(SavedLocation):
    pass


# ── Saved locations endpoints ────────────────────────────────────────────────


@router.get("/saved-locations", response_model=list[SavedLocationResponse])
async def get_saved_locations(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SavedLocationResponse]:
    """Get rider's saved locations."""
    result = await db.execute(select(Rider).where(Rider.user_id == user.id))
    rider = result.scalar_one_or_none()
    if rider is None:
        raise HTTPException(status_code=404, detail="Rider profile not found")

    locations = rider.saved_locations or []
    return [SavedLocationResponse(**loc) for loc in locations]


@router.post("/saved-locations", response_model=list[SavedLocationResponse])
async def add_saved_location(
    body: SavedLocation,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SavedLocationResponse]:
    """Add a saved location (e.g. Home, Work)."""
    result = await db.execute(select(Rider).where(Rider.user_id == user.id))
    rider = result.scalar_one_or_none()
    if rider is None:
        raise HTTPException(status_code=404, detail="Rider profile not found")

    locations = rider.saved_locations or []

    # Replace if same label exists
    locations = [loc for loc in locations if loc.get("label", "").lower() != body.label.lower()]
    locations.append(body.model_dump())

    rider.saved_locations = locations
    await db.commit()

    return [SavedLocationResponse(**loc) for loc in locations]


@router.delete("/saved-locations/{label}", response_model=list[SavedLocationResponse])
async def delete_saved_location(
    label: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SavedLocationResponse]:
    """Delete a saved location by label."""
    result = await db.execute(select(Rider).where(Rider.user_id == user.id))
    rider = result.scalar_one_or_none()
    if rider is None:
        raise HTTPException(status_code=404, detail="Rider profile not found")

    locations = rider.saved_locations or []
    locations = [loc for loc in locations if loc.get("label", "").lower() != label.lower()]

    rider.saved_locations = locations
    await db.commit()

    return [SavedLocationResponse(**loc) for loc in locations]


# ── Admin: list riders ───────────────────────────────────────────────────────


@router.get("/", response_model=list[RiderListItem])
async def list_riders(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[RiderListItem]:
    """List all riders with ride counts."""
    result = await db.execute(
        select(Rider)
        .options(selectinload(Rider.user))
        .order_by(Rider.id)
    )
    riders = result.scalars().all()

    items = []
    for r in riders:
        count = (await db.execute(
            select(func.count()).select_from(Ride).where(Ride.rider_id == r.id)
        )).scalar() or 0

        items.append(
            RiderListItem(
                id=r.id,
                user_id=r.user_id,
                name=r.user.name,
                phone=r.user.phone,
                total_rides=count,
                created_at=r.user.created_at,
            )
        )
    return items

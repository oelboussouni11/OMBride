"""Rider management routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from dependencies import require_admin
from models.ride import Ride
from models.user import Rider, User
from schemas.admin import RiderListItem

router = APIRouter(prefix="/riders", tags=["riders"])


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

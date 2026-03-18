"""Driver management routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from dependencies import require_admin
from models.credit import CreditTransaction, CreditType
from models.ride import Ride
from models.user import Driver, DriverDocument, DriverStatus, User
from schemas.admin import (
    CreditTopupRequest,
    CreditTransactionResponse,
    DocumentResponse,
    DriverDetailResponse,
    DriverListItem,
    DriverRideResponse,
    VerifyDriverRequest,
)

router = APIRouter(prefix="/drivers", tags=["drivers"])


@router.get("/", response_model=list[DriverListItem])
async def list_drivers(
    status: DriverStatus | None = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[DriverListItem]:
    """List all drivers with optional status filter."""
    stmt = (
        select(Driver)
        .options(selectinload(Driver.user))
        .order_by(Driver.created_at.desc())
    )
    if status is not None:
        stmt = stmt.where(Driver.status == status)

    result = await db.execute(stmt)
    drivers = result.scalars().all()

    return [
        DriverListItem(
            id=d.id,
            user_id=d.user_id,
            name=d.user.name,
            phone=d.user.phone,
            vehicle_model=d.vehicle_model,
            plate_number=d.plate_number,
            status=d.status,
            credit_balance=float(d.credit_balance),
            is_available=d.is_available,
            created_at=d.created_at,
        )
        for d in drivers
    ]


@router.get("/{driver_id}", response_model=DriverDetailResponse)
async def get_driver(
    driver_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> DriverDetailResponse:
    """Get full driver details including documents, transactions, rides."""
    result = await db.execute(
        select(Driver)
        .options(
            selectinload(Driver.user),
            selectinload(Driver.documents),
            selectinload(Driver.credit_transactions),
            selectinload(Driver.rides),
        )
        .where(Driver.id == driver_id)
    )
    driver = result.scalar_one_or_none()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    return DriverDetailResponse(
        id=driver.id,
        user_id=driver.user_id,
        name=driver.user.name,
        phone=driver.user.phone,
        email=driver.user.email,
        vehicle_model=driver.vehicle_model,
        plate_number=driver.plate_number,
        status=driver.status,
        credit_balance=float(driver.credit_balance),
        is_available=driver.is_available,
        created_at=driver.created_at,
        documents=[
            DocumentResponse(
                id=doc.id,
                doc_type=doc.doc_type,
                file_url=doc.file_url,
                status=doc.status,
                uploaded_at=doc.uploaded_at,
            )
            for doc in driver.documents
        ],
        credit_transactions=[
            CreditTransactionResponse(
                id=t.id,
                amount=float(t.amount),
                type=t.type,
                payment_method=t.payment_method,
                reference_code=t.reference_code,
                created_at=t.created_at,
            )
            for t in sorted(driver.credit_transactions, key=lambda t: t.created_at, reverse=True)
        ],
        rides=[
            DriverRideResponse(
                id=r.id,
                pickup_address=r.pickup_address,
                dropoff_address=r.dropoff_address,
                fare=float(r.fare) if r.fare else None,
                status=r.status,
                created_at=r.created_at,
            )
            for r in sorted(driver.rides, key=lambda r: r.created_at, reverse=True)
        ],
    )


@router.put("/{driver_id}/verify", response_model=DriverListItem)
async def verify_driver(
    driver_id: UUID,
    body: VerifyDriverRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> DriverListItem:
    """Update driver verification status."""
    if body.status not in (DriverStatus.verified, DriverStatus.rejected):
        raise HTTPException(status_code=400, detail="Status must be 'verified' or 'rejected'")

    result = await db.execute(
        select(Driver).options(selectinload(Driver.user)).where(Driver.id == driver_id)
    )
    driver = result.scalar_one_or_none()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    driver.status = body.status
    await db.commit()
    await db.refresh(driver)

    return DriverListItem(
        id=driver.id,
        user_id=driver.user_id,
        name=driver.user.name,
        phone=driver.user.phone,
        vehicle_model=driver.vehicle_model,
        plate_number=driver.plate_number,
        status=driver.status,
        credit_balance=float(driver.credit_balance),
        is_available=driver.is_available,
        created_at=driver.created_at,
    )


@router.post("/{driver_id}/credit", response_model=CreditTransactionResponse)
async def credit_driver(
    driver_id: UUID,
    body: CreditTopupRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> CreditTransactionResponse:
    """Manually top up a driver's credit balance."""
    result = await db.execute(select(Driver).where(Driver.id == driver_id))
    driver = result.scalar_one_or_none()
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")

    # Update balance
    driver.credit_balance = float(driver.credit_balance) + body.amount

    # Record transaction
    txn = CreditTransaction(
        driver_id=driver.id,
        amount=body.amount,
        type=CreditType.topup,
        payment_method=body.payment_method,
        reference_code=body.reference_code or None,
        approved_by=admin.id,
    )
    db.add(txn)
    await db.commit()
    await db.refresh(txn)

    return CreditTransactionResponse(
        id=txn.id,
        amount=float(txn.amount),
        type=txn.type,
        payment_method=txn.payment_method,
        reference_code=txn.reference_code,
        created_at=txn.created_at,
    )

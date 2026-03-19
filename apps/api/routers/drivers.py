"""Driver management routes."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from dependencies import get_current_user, require_admin
from models.credit import CreditTransaction, CreditType
from models.ride import Ride
from models.user import Driver, DriverDocument, DriverStatus, User, UserRole
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


class VerificationSubmission(BaseModel):
    full_name: str = Field(..., min_length=2)
    phone: str = Field(..., min_length=8)
    licence_number: str = Field(..., min_length=2)
    vehicle_brand: str = Field(..., min_length=1)
    vehicle_model: str = Field(..., min_length=1)
    vehicle_color: str = Field(..., min_length=1)
    vehicle_year: int = Field(..., ge=1990, le=2030)
    plate_number: str = Field(..., min_length=2)
    # Document URIs (base64 or URLs — stored in verification_data JSON)
    selfie: str = Field(default="")
    licence_front: str = Field(default="")
    licence_back: str = Field(default="")
    car_photo: str = Field(default="")
    carte_grise: str = Field(default="")


@router.post("/submit-verification")
async def submit_verification(
    body: VerificationSubmission,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Driver submits verification info and documents. Status must be pending or rejected."""
    if user.role != UserRole.driver or user.driver is None:
        raise HTTPException(status_code=403, detail="Only drivers can submit verification")

    driver = user.driver
    if driver.status == DriverStatus.verified:
        raise HTTPException(status_code=400, detail="Already verified. Request re-verification first.")

    # Update driver fields
    driver.full_name = body.full_name
    driver.licence_number = body.licence_number
    driver.vehicle_brand = body.vehicle_brand
    driver.vehicle_model = body.vehicle_model
    driver.vehicle_color = body.vehicle_color
    driver.vehicle_year = body.vehicle_year
    driver.plate_number = body.plate_number
    driver.rejection_note = None
    driver.status = DriverStatus.pending
    driver.submitted_at = datetime.now(timezone.utc)
    driver.verification_data = {
        "full_name": body.full_name,
        "phone": body.phone,
        "licence_number": body.licence_number,
        "vehicle_brand": body.vehicle_brand,
        "vehicle_model": body.vehicle_model,
        "vehicle_color": body.vehicle_color,
        "vehicle_year": body.vehicle_year,
        "plate_number": body.plate_number,
        "selfie": body.selfie,
        "licence_front": body.licence_front,
        "licence_back": body.licence_back,
        "car_photo": body.car_photo,
        "carte_grise": body.carte_grise,
    }
    driver.is_available = False

    await db.commit()
    return {"status": "pending", "message": "Verification submitted. Awaiting admin review."}


@router.post("/request-reverification")
async def request_reverification(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Verified driver requests to re-verify (resets to pending)."""
    if user.role != UserRole.driver or user.driver is None:
        raise HTTPException(status_code=403, detail="Only drivers can request re-verification")

    driver = user.driver
    if driver.status != DriverStatus.verified:
        raise HTTPException(status_code=400, detail="Only verified drivers can request re-verification")

    driver.status = DriverStatus.pending
    driver.is_available = False
    driver.rejection_note = None
    driver.verification_data = None
    driver.submitted_at = None
    await db.commit()

    return {"status": "pending", "message": "Verification reset. Please re-submit your documents."}


@router.get("/", response_model=list[DriverListItem])
async def list_drivers(
    status: DriverStatus | None = None,
    search: str | None = Query(None, description="Search by name, phone, or plate"),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[DriverListItem]:
    """List all drivers with optional status filter and search."""
    stmt = (
        select(Driver)
        .options(selectinload(Driver.user))
        .order_by(Driver.created_at.desc())
    )
    if status is not None:
        stmt = stmt.where(Driver.status == status)
    if search:
        term = f"%{search}%"
        stmt = stmt.join(User, Driver.user_id == User.id).where(
            or_(
                User.name.ilike(term),
                User.phone.ilike(term),
                Driver.plate_number.ilike(term),
                Driver.full_name.ilike(term),
            )
        )

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
            account_status=getattr(d.user, "account_status", "active") or "active",
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
    if body.status == DriverStatus.rejected:
        driver.rejection_note = body.note or "No reason provided"
        driver.is_available = False
    elif body.status == DriverStatus.verified:
        driver.rejection_note = None
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
        account_status=getattr(driver.user, "account_status", "active") or "active",
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

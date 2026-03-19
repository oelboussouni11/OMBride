"""Credit / wallet routes."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user, require_verified_driver
from models.credit import CreditTransaction, CreditType
from models.user import User
from schemas.admin import CreditTopupRequest, CreditTransactionResponse

router = APIRouter(prefix="/credits", tags=["credits"])


@router.get("/", response_model=list[CreditTransactionResponse])
async def list_credits(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CreditTransactionResponse]:
    """List credit transactions for the current driver."""
    if user.driver is None:
        return []

    result = await db.execute(
        select(CreditTransaction)
        .where(CreditTransaction.driver_id == user.driver.id)
        .order_by(CreditTransaction.created_at.desc())
    )
    txns = result.scalars().all()

    return [
        CreditTransactionResponse(
            id=t.id,
            amount=float(t.amount),
            type=t.type,
            payment_method=t.payment_method,
            reference_code=t.reference_code,
            created_at=t.created_at,
        )
        for t in txns
    ]


@router.post("/topup", response_model=CreditTransactionResponse, status_code=status.HTTP_201_CREATED)
async def request_topup(
    body: CreditTopupRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_verified_driver),
) -> CreditTransactionResponse:
    """Request a credit top-up (pending admin approval).

    Creates a CreditTransaction with type='topup' and approved_by=NULL.
    The balance is NOT credited until an admin approves the transaction.
    """
    txn = CreditTransaction(
        driver_id=user.driver.id,
        amount=body.amount,
        type=CreditType.topup,
        payment_method=body.payment_method,
        reference_code=body.reference_code,
        approved_by=None,
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

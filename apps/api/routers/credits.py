"""Credit / wallet routes."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models.credit import CreditTransaction
from models.user import User
from schemas.admin import CreditTransactionResponse

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

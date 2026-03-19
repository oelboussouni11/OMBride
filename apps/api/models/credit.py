"""CreditTransaction model."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class CreditType(str, enum.Enum):
    topup = "topup"
    ride_fee = "ride_fee"
    ride_earned = "ride_earned"


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    driver_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("drivers.id"), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    type: Mapped[CreditType] = mapped_column(Enum(CreditType), nullable=False)
    payment_method: Mapped[str | None] = mapped_column(String, nullable=True)
    reference_code: Mapped[str | None] = mapped_column(String, nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    driver: Mapped["Driver"] = relationship(back_populates="credit_transactions")  # noqa: F821

    __table_args__ = (
        Index("ix_credit_transactions_driver_id", "driver_id"),
    )

"""FareConfig model."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class FareConfig(Base):
    __tablename__ = "fare_config"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    base_fare: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    price_per_km: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    price_per_min: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    booking_fee: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    minimum_fare: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    commission_per_ride: Mapped[float] = mapped_column(Numeric(10, 2), default=1.00)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

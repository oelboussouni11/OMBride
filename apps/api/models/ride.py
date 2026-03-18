"""Ride and RideEvent models."""

import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class RideStatus(str, enum.Enum):
    requested = "requested"
    matched = "matched"
    arriving = "arriving"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


class RideEventType(str, enum.Enum):
    requested = "requested"
    driver_assigned = "driver_assigned"
    driver_arriving = "driver_arriving"
    ride_started = "ride_started"
    ride_completed = "ride_completed"
    cancelled = "cancelled"


class Ride(Base):
    __tablename__ = "rides"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rider_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("riders.id"), nullable=False)
    driver_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("drivers.id"), nullable=True)
    pickup_location = mapped_column(Geometry("POINT", srid=4326), nullable=False)
    dropoff_location = mapped_column(Geometry("POINT", srid=4326), nullable=False)
    pickup_address: Mapped[str] = mapped_column(String, nullable=False)
    dropoff_address: Mapped[str] = mapped_column(String, nullable=False)
    distance_km: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    duration_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fare: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    status: Mapped[RideStatus] = mapped_column(Enum(RideStatus), default=RideStatus.requested)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    rider: Mapped["Rider"] = relationship(back_populates="rides")  # noqa: F821
    driver: Mapped["Driver | None"] = relationship(back_populates="rides")  # noqa: F821
    events: Mapped[list["RideEvent"]] = relationship(back_populates="ride")

    __table_args__ = (
        Index("ix_rides_status", "status"),
        Index("ix_rides_rider_id", "rider_id"),
        Index("ix_rides_driver_id", "driver_id"),
    )


class RideEvent(Base):
    __tablename__ = "ride_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ride_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rides.id"), nullable=False)
    event: Mapped[RideEventType] = mapped_column(Enum(RideEventType), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    ride: Mapped["Ride"] = relationship(back_populates="events")

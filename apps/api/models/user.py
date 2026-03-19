"""User, Rider, Driver, and DriverDocument models."""

import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class UserRole(str, enum.Enum):
    rider = "rider"
    driver = "driver"
    admin = "admin"


class DriverStatus(str, enum.Enum):
    pending = "pending"
    verified = "verified"
    rejected = "rejected"


class DocType(str, enum.Enum):
    license = "license"
    id_card = "id_card"
    insurance = "insurance"
    vehicle_registration = "vehicle_registration"


class DocStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    rider: Mapped["Rider | None"] = relationship(back_populates="user", uselist=False)
    driver: Mapped["Driver | None"] = relationship(back_populates="user", uselist=False)


class Rider(Base):
    __tablename__ = "riders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    saved_locations: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    user: Mapped["User"] = relationship(back_populates="rider")
    rides: Mapped[list["Ride"]] = relationship(back_populates="rider")  # noqa: F821


class Driver(Base):
    __tablename__ = "drivers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    # Vehicle info
    vehicle_model: Mapped[str] = mapped_column(String, nullable=False)
    vehicle_brand: Mapped[str | None] = mapped_column(String, nullable=True)
    vehicle_color: Mapped[str | None] = mapped_column(String, nullable=True)
    vehicle_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    plate_number: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    # Verification
    full_name: Mapped[str | None] = mapped_column(String, nullable=True)  # Name as on licence
    licence_number: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[DriverStatus] = mapped_column(Enum(DriverStatus), default=DriverStatus.pending)
    rejection_note: Mapped[str | None] = mapped_column(String, nullable=True)
    verification_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # Stores all submitted docs/info as JSON
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Operational
    is_available: Mapped[bool] = mapped_column(Boolean, default=False)
    credit_balance: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    current_location = mapped_column(Geometry("POINT", srid=4326), nullable=True)
    location_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="driver")
    documents: Mapped[list["DriverDocument"]] = relationship(back_populates="driver")
    credit_transactions: Mapped[list["CreditTransaction"]] = relationship(back_populates="driver")  # noqa: F821
    rides: Mapped[list["Ride"]] = relationship(back_populates="driver")  # noqa: F821

    __table_args__ = (
        Index("ix_drivers_location", "current_location", postgresql_using="gist"),
        Index("ix_drivers_available_status", "is_available", "status"),
    )


class DriverDocument(Base):
    __tablename__ = "driver_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    driver_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("drivers.id"), nullable=False)
    doc_type: Mapped[DocType] = mapped_column(Enum(DocType), nullable=False)
    file_url: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[DocStatus] = mapped_column(Enum(DocStatus), default=DocStatus.pending)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    driver: Mapped["Driver"] = relationship(back_populates="documents")

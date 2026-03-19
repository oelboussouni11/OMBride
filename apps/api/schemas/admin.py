"""Pydantic schemas for admin endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from models.credit import CreditType
from models.ride import RideStatus
from models.user import DocStatus, DocType, DriverStatus, UserRole


# ── Dashboard ────────────────────────────────────────────────────────────────


class DashboardStats(BaseModel):
    rides_today: int
    rides_week: int
    rides_month: int
    revenue_total: float
    active_drivers: int
    pending_verifications: int


class RecentRide(BaseModel):
    id: UUID
    rider_name: str
    driver_name: str | None
    pickup_address: str
    dropoff_address: str
    fare: float | None
    status: RideStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class DashboardResponse(BaseModel):
    stats: DashboardStats
    recent_rides: list[RecentRide]


# ── Drivers ──────────────────────────────────────────────────────────────────


class DriverListItem(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    phone: str
    vehicle_model: str
    plate_number: str
    status: DriverStatus
    account_status: str = "active"
    credit_balance: float
    is_available: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentResponse(BaseModel):
    id: UUID
    doc_type: DocType
    file_url: str
    status: DocStatus
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class CreditTransactionResponse(BaseModel):
    id: UUID
    amount: float
    type: CreditType
    payment_method: str | None
    reference_code: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DriverRideResponse(BaseModel):
    id: UUID
    pickup_address: str
    dropoff_address: str
    fare: float | None
    status: RideStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class DriverDetailResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    phone: str
    email: str | None
    vehicle_model: str
    plate_number: str
    status: DriverStatus
    credit_balance: float
    is_available: bool
    created_at: datetime
    documents: list[DocumentResponse]
    credit_transactions: list[CreditTransactionResponse]
    rides: list[DriverRideResponse]


class VerifyDriverRequest(BaseModel):
    status: DriverStatus = Field(..., description="'verified' or 'rejected'")
    note: str = Field(default="", description="Rejection reason (shown to driver)")


class CreditTopupRequest(BaseModel):
    amount: float = Field(..., gt=0)
    payment_method: str = Field(..., min_length=1)
    reference_code: str = Field(default="", max_length=100)


# ── Riders ───────────────────────────────────────────────────────────────────


class RiderListItem(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    phone: str
    total_rides: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Rides ────────────────────────────────────────────────────────────────────


class RideListItem(BaseModel):
    id: UUID
    rider_name: str
    driver_name: str | None
    pickup_address: str
    dropoff_address: str
    fare: float | None
    status: RideStatus
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Fare Config ──────────────────────────────────────────────────────────────


class FareConfigResponse(BaseModel):
    id: UUID
    base_fare: float
    price_per_km: float
    price_per_min: float
    booking_fee: float
    minimum_fare: float
    commission_per_ride: float
    commission_type: str  # "fixed" or "percentage"
    weight_rating: float
    weight_distance: float
    is_active: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class FareConfigUpdateRequest(BaseModel):
    base_fare: float = Field(..., ge=0)
    price_per_km: float = Field(..., ge=0)
    price_per_min: float = Field(..., ge=0)
    booking_fee: float = Field(..., ge=0)
    minimum_fare: float = Field(..., ge=0)
    commission_per_ride: float = Field(..., ge=0)
    commission_type: str = Field("fixed", description="'fixed' (DH) or 'percentage' (% of fare)")
    weight_rating: float = Field(1.0, ge=0, le=10)
    weight_distance: float = Field(0.5, ge=0, le=10)

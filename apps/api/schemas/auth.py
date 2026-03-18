"""Pydantic schemas for authentication endpoints."""

from uuid import UUID

from pydantic import BaseModel, Field

from models.user import DriverStatus, UserRole


# ── Request schemas ──────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    phone: str = Field(..., min_length=10, max_length=20, examples=["+212612345678"])
    name: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=6, max_length=128)
    role: UserRole = Field(..., description="Must be 'rider' or 'driver'")

    # Driver-only fields (required when role == driver)
    vehicle_model: str | None = Field(None, max_length=100)
    plate_number: str | None = Field(None, max_length=20)


class LoginRequest(BaseModel):
    phone: str = Field(..., min_length=10, max_length=20)
    password: str = Field(..., min_length=1)


class RefreshRequest(BaseModel):
    refresh_token: str


# ── Response schemas ─────────────────────────────────────────────────────────


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class DriverInfo(BaseModel):
    driver_id: UUID
    vehicle_model: str
    plate_number: str
    status: DriverStatus
    credit_balance: float

    model_config = {"from_attributes": True}


class UserResponse(BaseModel):
    id: UUID
    phone: str
    name: str
    email: str | None
    role: UserRole
    is_active: bool
    driver: DriverInfo | None = None

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class RegisterResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


# ── Error schema ─────────────────────────────────────────────────────────────


class ErrorResponse(BaseModel):
    detail: str
    code: str

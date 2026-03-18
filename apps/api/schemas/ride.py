"""Pydantic schemas for ride endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from models.ride import RideStatus


class EstimateRequest(BaseModel):
    pickup_lat: float = Field(..., ge=-90, le=90)
    pickup_lng: float = Field(..., ge=-180, le=180)
    dropoff_lat: float = Field(..., ge=-90, le=90)
    dropoff_lng: float = Field(..., ge=-180, le=180)


class EstimateResponse(BaseModel):
    distance_km: float
    duration_min: int
    estimated_fare: float


class RideRequest(BaseModel):
    pickup_lat: float = Field(..., ge=-90, le=90)
    pickup_lng: float = Field(..., ge=-180, le=180)
    dropoff_lat: float = Field(..., ge=-90, le=90)
    dropoff_lng: float = Field(..., ge=-180, le=180)
    pickup_address: str = Field(..., min_length=1)
    dropoff_address: str = Field(..., min_length=1)


class RideResponse(BaseModel):
    id: UUID
    rider_id: UUID
    driver_id: UUID | None
    pickup_address: str
    dropoff_address: str
    distance_km: float | None
    duration_min: int | None
    fare: float | None
    status: RideStatus
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class RideDetailResponse(RideResponse):
    driver_name: str | None = None
    driver_phone: str | None = None
    driver_vehicle: str | None = None
    driver_plate: str | None = None

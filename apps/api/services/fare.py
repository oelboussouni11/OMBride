"""Fare calculation utilities."""

from decimal import Decimal

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from models.fare import FareConfig

settings = get_settings()


async def get_active_fare_config(db: AsyncSession) -> FareConfig:
    """Return the currently active fare config row."""
    result = await db.execute(
        select(FareConfig).where(FareConfig.is_active.is_(True)).limit(1)
    )
    config = result.scalar_one_or_none()
    if config is None:
        raise ValueError("No active fare configuration found")
    return config


async def get_route_info(
    pickup_lat: float,
    pickup_lng: float,
    dropoff_lat: float,
    dropoff_lng: float,
) -> tuple[float, int]:
    """Query Mapbox Directions API and return (distance_km, duration_min).

    Falls back to Haversine estimate if Mapbox token is not configured.
    """
    if settings.MAPBOX_ACCESS_TOKEN:
        url = (
            f"https://api.mapbox.com/directions/v5/mapbox/driving/"
            f"{pickup_lng},{pickup_lat};{dropoff_lng},{dropoff_lat}"
            f"?access_token={settings.MAPBOX_ACCESS_TOKEN}"
        )
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                route = data["routes"][0]
                distance_km = round(route["distance"] / 1000, 2)
                duration_min = round(route["duration"] / 60)
                return distance_km, duration_min

    # Fallback: Haversine approximation
    import math

    R = 6371  # Earth radius in km
    dlat = math.radians(dropoff_lat - pickup_lat)
    dlng = math.radians(dropoff_lng - pickup_lng)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(pickup_lat))
        * math.cos(math.radians(dropoff_lat))
        * math.sin(dlng / 2) ** 2
    )
    distance_km = round(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)), 2)
    # Estimate duration at ~30 km/h average city speed
    duration_min = max(1, round(distance_km / 30 * 60))
    return distance_km, duration_min


def calculate_fare(
    distance_km: float,
    duration_min: int,
    config: FareConfig,
) -> float:
    """Calculate fare from distance, duration, and active fare config."""
    fare = (
        Decimal(str(config.base_fare))
        + Decimal(str(config.price_per_km)) * Decimal(str(distance_km))
        + Decimal(str(config.price_per_min)) * Decimal(str(duration_min))
        + Decimal(str(config.booking_fee))
    )
    minimum = Decimal(str(config.minimum_fare))
    return float(max(fare, minimum).quantize(Decimal("0.01")))

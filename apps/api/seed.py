"""Seed script — inserts default admin user and fare config."""

import asyncio
import uuid

from passlib.context import CryptContext
from sqlalchemy import select

from config import get_settings
from database import get_engine, get_session_factory
from models.fare import FareConfig
from models.user import User, UserRole

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()

ADMIN_PHONE = "+212600000000"
ADMIN_PASSWORD = "admin123"
ADMIN_NAME = "Admin"


async def seed() -> None:
    async with get_session_factory()() as session:
        # --- Admin user ---
        existing = await session.execute(select(User).where(User.phone == ADMIN_PHONE))
        if existing.scalar_one_or_none() is None:
            admin = User(
                id=uuid.uuid4(),
                phone=ADMIN_PHONE,
                name=ADMIN_NAME,
                role=UserRole.admin,
                password_hash=pwd_context.hash(ADMIN_PASSWORD),
                is_active=True,
            )
            session.add(admin)
            print(f"Created admin user: {ADMIN_PHONE}")
        else:
            admin = existing.scalar_one_or_none()
            # re-fetch since we already consumed the result
            result = await session.execute(select(User).where(User.phone == ADMIN_PHONE))
            admin = result.scalar_one()
            print("Admin user already exists, skipping.")

        # --- Default fare config ---
        existing_fare = await session.execute(select(FareConfig).where(FareConfig.is_active.is_(True)))
        if existing_fare.scalar_one_or_none() is None:
            # Need the admin user id for updated_by
            admin_result = await session.execute(select(User).where(User.phone == ADMIN_PHONE))
            admin_user = admin_result.scalar_one()

            fare = FareConfig(
                id=uuid.uuid4(),
                base_fare=5.00,
                price_per_km=3.50,
                price_per_min=0.50,
                booking_fee=2.00,
                minimum_fare=10.00,
                commission_per_ride=1.00,
                is_active=True,
                updated_by=admin_user.id,
            )
            session.add(fare)
            print("Created default fare config.")
        else:
            print("Active fare config already exists, skipping.")

        await session.commit()

    await get_engine().dispose()


if __name__ == "__main__":
    asyncio.run(seed())

"""ORM models package — import all models so Alembic autogenerate detects them."""

from models.credit import CreditTransaction, CreditType  # noqa: F401
from models.fare import FareConfig  # noqa: F401
from models.ride import Ride, RideEvent, RideEventType, RideStatus  # noqa: F401
from models.user import (  # noqa: F401
    DocStatus,
    DocType,
    Driver,
    DriverDocument,
    DriverStatus,
    Rider,
    User,
    UserRole,
)

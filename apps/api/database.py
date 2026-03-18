"""SQLAlchemy engine, session factory, and declarative Base."""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""

    pass


# Lazy singletons — not created at import time so Alembic can import Base
# without needing the async driver.
_engine = None
_session_factory = None


def _init():
    global _engine, _session_factory
    if _engine is not None:
        return
    from config import get_settings

    settings = get_settings()
    _engine = create_async_engine(settings.DATABASE_URL, echo=False)
    _session_factory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


def get_engine():
    _init()
    return _engine


def get_session_factory():
    _init()
    return _session_factory


async def get_db():
    """Yield a database session and ensure it is closed after use."""
    _init()
    async with _session_factory() as session:
        yield session

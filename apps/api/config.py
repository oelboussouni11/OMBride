"""Application configuration loaded from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings populated from env vars or .env file."""

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/rideapp"
    REDIS_URL: str = "redis://localhost:6379/0"
    JWT_SECRET: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    MAPBOX_ACCESS_TOKEN: str = ""
    FCM_SERVER_KEY: str = ""
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        """Return CORS origins as a list."""
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()

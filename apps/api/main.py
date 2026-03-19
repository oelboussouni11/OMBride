"""OMBdrive API -- FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from routers import admin, auth, credits, drivers, riders, rides, ws

settings = get_settings()

app = FastAPI(
    title="OMBdrive API",
    version="0.1.0",
    description="Backend API for the OMBdrive ride-hailing platform.",
)

# -- CORS middleware ----------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -- Routers ------------------------------------------------------------------
app.include_router(auth.router)
app.include_router(riders.router)
app.include_router(drivers.router)
app.include_router(rides.router)
app.include_router(credits.router)
app.include_router(admin.router)
app.include_router(ws.router)


@app.get("/healthz", tags=["health"])
async def healthcheck() -> dict:
    """Simple liveness probe."""
    return {"status": "ok"}

"""Authentication routes — register, login, refresh, me."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from dependencies import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_redis,
    hash_password,
    store_refresh_token,
    validate_refresh_token,
    verify_password,
)
from models.user import Driver, Rider, User, UserRole
from schemas.auth import (
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    RegisterRequest,
    RegisterResponse,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _build_user_response(user: User) -> UserResponse:
    """Build a UserResponse from a User ORM object (with driver eagerly loaded)."""
    from schemas.auth import DriverInfo

    driver_info = None
    if user.driver is not None:
        driver_info = DriverInfo(
            driver_id=user.driver.id,
            vehicle_model=user.driver.vehicle_model,
            plate_number=user.driver.plate_number,
            status=user.driver.status,
            credit_balance=float(user.driver.credit_balance),
        )
    return UserResponse(
        id=user.id,
        phone=user.phone,
        name=user.name,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        driver=driver_info,
    )


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
) -> RegisterResponse:
    """Register a new user account (rider or driver)."""
    if body.role == UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot register as admin",
        )

    # Validate driver-specific fields
    if body.role == UserRole.driver:
        if not body.vehicle_model or not body.plate_number:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="vehicle_model and plate_number are required for drivers",
            )

    # Check phone uniqueness
    existing = await db.execute(select(User).where(User.phone == body.phone))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Phone number already registered",
        )

    # Check plate uniqueness for drivers
    if body.role == UserRole.driver and body.plate_number:
        existing_plate = await db.execute(
            select(Driver).where(Driver.plate_number == body.plate_number)
        )
        if existing_plate.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Plate number already registered",
            )

    # Create user
    user = User(
        phone=body.phone,
        name=body.name,
        role=body.role,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    await db.flush()  # get user.id

    # Create role-specific record
    if body.role == UserRole.rider:
        rider = Rider(user_id=user.id)
        db.add(rider)
    elif body.role == UserRole.driver:
        driver = Driver(
            user_id=user.id,
            vehicle_model=body.vehicle_model,
            plate_number=body.plate_number,
        )
        db.add(driver)

    await db.commit()

    # Re-fetch with relationships loaded
    result = await db.execute(
        select(User)
        .options(selectinload(User.driver), selectinload(User.rider))
        .where(User.id == user.id)
    )
    user = result.scalar_one()

    # Generate tokens
    access_token = create_access_token(user.id, user.role)
    refresh_token = create_refresh_token(user.id)
    await store_refresh_token(redis, user.id, refresh_token)

    return RegisterResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_build_user_response(user),
    )


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
) -> LoginResponse:
    """Authenticate and return access + refresh tokens."""
    result = await db.execute(
        select(User)
        .options(selectinload(User.driver), selectinload(User.rider))
        .where(User.phone == body.phone)
    )
    user = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid phone or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account deactivated",
        )

    access_token = create_access_token(user.id, user.role)
    refresh_token = create_refresh_token(user.id)
    await store_refresh_token(redis, user.id, refresh_token)

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_build_user_response(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
) -> TokenResponse:
    """Refresh an expired access token using a valid refresh token."""
    payload = await validate_refresh_token(redis, body.refresh_token)
    user_id = payload["sub"]

    # Fetch user to get current role
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
        )

    # Rotate tokens
    new_access = create_access_token(user.id, user.role)
    new_refresh = create_refresh_token(user.id)
    await store_refresh_token(redis, user.id, new_refresh)

    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)) -> UserResponse:
    """Return the currently authenticated user's profile."""
    return _build_user_response(user)

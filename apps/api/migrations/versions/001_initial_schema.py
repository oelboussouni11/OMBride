"""Initial schema — all tables, indexes, PostGIS extension.

Revision ID: 001_initial
Revises:
Create Date: 2026-03-18
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from geoalchemy2 import Geometry

# revision identifiers, used by Alembic.
revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable PostGIS extension
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("phone", sa.String(), unique=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column(
            "role",
            sa.Enum("rider", "driver", "admin", name="userrole"),
            nullable=False,
        ),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )

    # --- riders ---
    op.create_table(
        "riders",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            unique=True,
            nullable=False,
        ),
        sa.Column("saved_locations", sa.JSON(), nullable=True),
    )

    # --- drivers ---
    op.create_table(
        "drivers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            unique=True,
            nullable=False,
        ),
        sa.Column("vehicle_model", sa.String(), nullable=False),
        sa.Column("plate_number", sa.String(), unique=True, nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "verified", "rejected", name="driverstatus"),
            server_default="pending",
        ),
        sa.Column("is_available", sa.Boolean(), server_default=sa.text("false")),
        sa.Column(
            "credit_balance", sa.Numeric(10, 2), server_default=sa.text("0")
        ),
        sa.Column(
            "current_location", Geometry("POINT", srid=4326), nullable=True
        ),
        sa.Column(
            "location_updated_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_drivers_location",
        "drivers",
        ["current_location"],
        postgresql_using="gist",
    )
    op.create_index(
        "ix_drivers_available_status",
        "drivers",
        ["is_available", "status"],
    )

    # --- driver_documents ---
    op.create_table(
        "driver_documents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "driver_id",
            UUID(as_uuid=True),
            sa.ForeignKey("drivers.id"),
            nullable=False,
        ),
        sa.Column(
            "doc_type",
            sa.Enum(
                "license", "id_card", "insurance", "vehicle_registration",
                name="doctype",
            ),
            nullable=False,
        ),
        sa.Column("file_url", sa.String(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "approved", "rejected", name="docstatus"),
            server_default="pending",
        ),
        sa.Column(
            "reviewed_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )

    # --- credit_transactions ---
    op.create_table(
        "credit_transactions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "driver_id",
            UUID(as_uuid=True),
            sa.ForeignKey("drivers.id"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "type",
            sa.Enum("topup", "ride_fee", name="credittype"),
            nullable=False,
        ),
        sa.Column("payment_method", sa.String(), nullable=True),
        sa.Column("reference_code", sa.String(), nullable=True),
        sa.Column(
            "approved_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_credit_transactions_driver_id",
        "credit_transactions",
        ["driver_id"],
    )

    # --- rides ---
    op.create_table(
        "rides",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "rider_id",
            UUID(as_uuid=True),
            sa.ForeignKey("riders.id"),
            nullable=False,
        ),
        sa.Column(
            "driver_id",
            UUID(as_uuid=True),
            sa.ForeignKey("drivers.id"),
            nullable=True,
        ),
        sa.Column(
            "pickup_location", Geometry("POINT", srid=4326), nullable=False
        ),
        sa.Column(
            "dropoff_location", Geometry("POINT", srid=4326), nullable=False
        ),
        sa.Column("pickup_address", sa.String(), nullable=False),
        sa.Column("dropoff_address", sa.String(), nullable=False),
        sa.Column("distance_km", sa.Numeric(8, 2), nullable=True),
        sa.Column("duration_min", sa.Integer(), nullable=True),
        sa.Column("fare", sa.Numeric(10, 2), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "requested", "matched", "arriving", "in_progress",
                "completed", "cancelled",
                name="ridestatus",
            ),
            server_default="requested",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_rides_status", "rides", ["status"])
    op.create_index("ix_rides_rider_id", "rides", ["rider_id"])
    op.create_index("ix_rides_driver_id", "rides", ["driver_id"])

    # --- ride_events ---
    op.create_table(
        "ride_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "ride_id",
            UUID(as_uuid=True),
            sa.ForeignKey("rides.id"),
            nullable=False,
        ),
        sa.Column(
            "event",
            sa.Enum(
                "requested", "driver_assigned", "driver_arriving",
                "ride_started", "ride_completed", "cancelled",
                name="rideeventtype",
            ),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )

    # --- fare_config ---
    op.create_table(
        "fare_config",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("base_fare", sa.Numeric(10, 2), nullable=False),
        sa.Column("price_per_km", sa.Numeric(10, 2), nullable=False),
        sa.Column("price_per_min", sa.Numeric(10, 2), nullable=False),
        sa.Column("booking_fee", sa.Numeric(10, 2), nullable=False),
        sa.Column("minimum_fare", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "commission_per_ride",
            sa.Numeric(10, 2),
            server_default=sa.text("1.00"),
        ),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("fare_config")
    op.drop_table("ride_events")
    op.drop_table("rides")
    op.drop_table("credit_transactions")
    op.drop_table("driver_documents")
    op.drop_table("drivers")
    op.drop_table("riders")
    op.drop_table("users")

    # Drop enums
    for name in [
        "rideeventtype", "ridestatus", "credittype", "docstatus",
        "doctype", "driverstatus", "userrole",
    ]:
        op.execute(f"DROP TYPE IF EXISTS {name}")

    op.execute("DROP EXTENSION IF EXISTS postgis")

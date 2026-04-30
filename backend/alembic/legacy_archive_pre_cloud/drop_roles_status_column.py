"""Remove status column from roles table.

Revision ID: drop_roles_status
Revises: f2c72dfb1ee9
Create Date: 2026-03-16

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "drop_roles_status"
down_revision = "f2c72dfb1ee9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("roles", "status")
    op.execute(sa.text("DROP TYPE IF EXISTS rolestatus"))


def downgrade() -> None:
    op.execute(
        sa.text("CREATE TYPE rolestatus AS ENUM ('ACTIVE', 'INACTIVE')")
    )
    op.add_column(
        "roles",
        sa.Column(
            "status",
            postgresql.ENUM("ACTIVE", "INACTIVE", name="rolestatus"),
            nullable=False,
            server_default="ACTIVE",
        ),
    )

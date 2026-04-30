"""Rename quotestatus enum to estimatestatus

Revision ID: rename_quotestatus_enum
Revises: fix_estimate_constraint_names
Create Date: 2025-01-XX XX:XX:XX.000000

This migration renames the quotestatus enum type to estimatestatus.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'rename_quotestatus_enum'
down_revision = 'fix_estimate_constraint_names'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename the enum type from quotestatus to estimatestatus
    op.execute(sa.text("ALTER TYPE quotestatus RENAME TO estimatestatus"))
    
    # Update the column to use the new enum type name (PostgreSQL should handle this automatically,
    # but we'll be explicit)
    op.execute(sa.text("ALTER TABLE estimates ALTER COLUMN status TYPE estimatestatus USING status::text::estimatestatus"))


def downgrade() -> None:
    # Rename the enum type back from estimatestatus to quotestatus
    op.execute(sa.text("ALTER TABLE estimates ALTER COLUMN status TYPE quotestatus USING status::text::quotestatus"))
    op.execute(sa.text("ALTER TYPE estimatestatus RENAME TO quotestatus"))




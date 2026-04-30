"""Fix estimate constraint names

Revision ID: fix_estimate_constraint_names
Revises: rename_quotes_to_estimates
Create Date: 2025-01-XX XX:XX:XX.000000

This migration fixes remaining constraint names from quote to estimate.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'fix_estimate_constraint_names'
down_revision = 'rename_quotes_to_estimates'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Update primary key constraint names
    op.execute(sa.text("ALTER TABLE estimates RENAME CONSTRAINT quotes_pkey TO estimates_pkey"))
    op.execute(sa.text("ALTER TABLE estimate_line_items RENAME CONSTRAINT quote_line_items_pkey TO estimate_line_items_pkey"))
    op.execute(sa.text("ALTER TABLE estimate_phases RENAME CONSTRAINT quote_phases_pkey TO estimate_phases_pkey"))
    op.execute(sa.text("ALTER TABLE estimate_weekly_hours RENAME CONSTRAINT quote_weekly_hours_pkey TO estimate_weekly_hours_pkey"))


def downgrade() -> None:
    # Revert primary key constraint names
    op.execute(sa.text("ALTER TABLE estimate_weekly_hours RENAME CONSTRAINT estimate_weekly_hours_pkey TO quote_weekly_hours_pkey"))
    op.execute(sa.text("ALTER TABLE estimate_phases RENAME CONSTRAINT estimate_phases_pkey TO quote_phases_pkey"))
    op.execute(sa.text("ALTER TABLE estimate_line_items RENAME CONSTRAINT estimate_line_items_pkey TO quote_line_items_pkey"))
    op.execute(sa.text("ALTER TABLE estimates RENAME CONSTRAINT estimates_pkey TO quotes_pkey"))




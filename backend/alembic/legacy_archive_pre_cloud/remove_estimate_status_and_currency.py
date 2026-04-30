"""Remove status and currency from estimates

Revision ID: remove_estimate_status_currency
Revises: rename_quotestatus_enum
Create Date: 2025-01-XX XX:XX:XX.000000

This migration removes the status and currency columns from the estimates table.
Status is no longer needed as only active_version matters.
Currency is now derived from the release's default_currency.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'remove_estimate_status_currency'
down_revision = 'rename_quotestatus_enum'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the status column and enum type
    op.drop_column('estimates', 'status')
    op.execute(sa.text("DROP TYPE IF EXISTS estimatestatus"))
    
    # Drop the currency column
    op.drop_column('estimates', 'currency')


def downgrade() -> None:
    # Re-add currency column
    op.add_column('estimates',
        sa.Column('currency', sa.String(length=3), nullable=False, server_default='USD')
    )
    
    # Re-create status enum and column
    op.execute(sa.text("CREATE TYPE estimatestatus AS ENUM ('draft', 'submitted', 'approved', 'rejected')"))
    op.add_column('estimates',
        sa.Column('status', postgresql.ENUM('draft', 'submitted', 'approved', 'rejected', name='estimatestatus'), nullable=False, server_default='draft')
    )


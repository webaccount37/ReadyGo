"""add_billable_to_estimate_line_items

Revision ID: add_billable_est_line_items
Revises: rename_quote_tables_to_estimates
Create Date: 2025-01-15 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_billable_est_line_items'
down_revision = 'remove_estimate_status_currency'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add billable column to estimate_line_items table
    op.add_column('estimate_line_items', 
        sa.Column('billable', sa.Boolean(), nullable=False, server_default='true')
    )


def downgrade() -> None:
    op.drop_column('estimate_line_items', 'billable')


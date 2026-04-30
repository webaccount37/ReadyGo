"""add_billable_expense_percentage_to_estimate_line_items

Revision ID: add_billable_expense_pct
Revises: add_billable_est_line_items
Create Date: 2025-01-20 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_billable_expense_pct'
down_revision = 'add_billable_est_line_items'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add billable_expense_percentage column to estimate_line_items table
    op.add_column('estimate_line_items', 
        sa.Column('billable_expense_percentage', sa.Numeric(5, 2), nullable=False, server_default='0')
    )


def downgrade() -> None:
    op.drop_column('estimate_line_items', 'billable_expense_percentage')


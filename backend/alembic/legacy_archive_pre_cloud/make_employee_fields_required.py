"""Make employee fields required

Revision ID: make_employee_fields_required
Revises: replace_default_currency
Create Date: 2025-12-04 12:00:00.000000

This migration makes the following employee fields required (NOT NULL):
- employee_type (already NOT NULL in model)
- status (already NOT NULL in model)
- internal_cost_rate
- internal_bill_rate
- external_bill_rate
- start_date
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'make_employee_fields_required'
down_revision = 'replace_default_currency'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # First, update any NULL values to defaults (required before making non-nullable)
    # Set rates to 0 if NULL
    op.execute(sa.text("UPDATE employees SET internal_cost_rate = 0 WHERE internal_cost_rate IS NULL"))
    op.execute(sa.text("UPDATE employees SET internal_bill_rate = 0 WHERE internal_bill_rate IS NULL"))
    op.execute(sa.text("UPDATE employees SET external_bill_rate = 0 WHERE external_bill_rate IS NULL"))
    
    # Set start_date to current date if NULL
    op.execute(sa.text("UPDATE employees SET start_date = CURRENT_DATE WHERE start_date IS NULL"))
    
    # Then alter columns to be non-nullable
    op.alter_column('employees', 'internal_cost_rate', nullable=False)
    op.alter_column('employees', 'internal_bill_rate', nullable=False)
    op.alter_column('employees', 'external_bill_rate', nullable=False)
    op.alter_column('employees', 'start_date', nullable=False)


def downgrade() -> None:
    # Revert columns to nullable
    op.alter_column('employees', 'internal_cost_rate', nullable=True)
    op.alter_column('employees', 'internal_bill_rate', nullable=True)
    op.alter_column('employees', 'external_bill_rate', nullable=True)
    op.alter_column('employees', 'start_date', nullable=True)










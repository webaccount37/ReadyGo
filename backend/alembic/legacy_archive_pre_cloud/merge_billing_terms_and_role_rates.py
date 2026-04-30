"""
Merge heads: billing_terms_table and add_role_rates_and_employee_delivery_center.

Revision ID: merge_billing_terms_role_rates
Revises: billing_terms_table, add_role_rates_dc_fk
Create Date: 2025-12-05 02:05:00.000000
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "merge_billing_terms_role_rates"
down_revision = ("billing_terms_table", "add_role_rates_dc_fk")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Merge migration, no schema changes.
    pass


def downgrade() -> None:
    # Merge point; nothing to downgrade.
    pass


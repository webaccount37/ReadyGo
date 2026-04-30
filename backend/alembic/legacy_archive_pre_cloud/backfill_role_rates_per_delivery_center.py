"""Backfill role_rates: ensure every role has one rate per delivery center.

Revision ID: backfill_role_rates
Revises: drop_roles_status
Create Date: 2026-03-16

For each role, adds RoleRate for any delivery center that doesn't already have one.
Uses delivery center default_currency, internal_cost_rate=0, external_rate=0.
"""

from alembic import op
import sqlalchemy as sa
import uuid as uuid_module

revision = "backfill_role_rates"
down_revision = "drop_roles_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Insert missing role_rates: (role_id, delivery_center_id) combinations
    # that don't exist yet. Use default_currency from delivery_centers,
    # internal_cost_rate=0, external_rate=0.
    op.execute(
        sa.text("""
            INSERT INTO role_rates (id, role_id, delivery_center_id, default_currency, internal_cost_rate, external_rate)
            SELECT
                gen_random_uuid(),
                r.id,
                dc.id,
                COALESCE(dc.default_currency, 'USD'),
                0.0,
                0.0
            FROM roles r
            CROSS JOIN delivery_centers dc
            WHERE NOT EXISTS (
                SELECT 1 FROM role_rates rr
                WHERE rr.role_id = r.id AND rr.delivery_center_id = dc.id
            )
        """)
    )


def downgrade() -> None:
    # No automatic rollback - we don't know which rows were added by this migration.
    # Manual cleanup would be required if needed.
    pass

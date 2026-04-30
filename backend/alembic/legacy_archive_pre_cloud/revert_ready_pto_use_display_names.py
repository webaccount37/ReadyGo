"""revert_ready_pto_use_display_names

Revision ID: revert_ready_pto
Revises: seed_ready_pto
Create Date: 2026-03-07

Removes any Ready/PTO data created by seed_ready_pto. Adds display-only fields
(account_display_name, engagement_display_name) so Holiday timesheet rows can show
"Ready" and "PTO" without requiring actual Account/Project records.
"""
from alembic import op
from sqlalchemy import text
import sqlalchemy as sa


revision = 'revert_ready_pto'
down_revision = 'seed_ready_pto'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Add display-only columns for Holiday rows
    op.add_column(
        'timesheet_entries',
        sa.Column('account_display_name', sa.String(255), nullable=True),
    )
    op.add_column(
        'timesheet_entries',
        sa.Column('engagement_display_name', sa.String(255), nullable=True),
    )

    # 2. Make account_id nullable first (so we can set it to null on holiday rows)
    op.alter_column(
        'timesheet_entries',
        'account_id',
        existing_type=sa.dialects.postgresql.UUID(as_uuid=True),
        nullable=True,
    )

    # 3. Update existing holiday rows: null out FKs, set display names
    conn.execute(text("""
        UPDATE timesheet_entries
        SET account_id = NULL, engagement_id = NULL, opportunity_id = NULL, engagement_phase_id = NULL,
            account_display_name = 'Ready', engagement_display_name = 'PTO'
        WHERE is_holiday_row = true
    """))

    # 4. Remove Ready/PTO data if it exists (from seed_ready_pto if it ran before we made it no-op)
    conn.execute(text("""
        DELETE FROM engagement_phases WHERE name = 'PTO' AND engagement_id IN
        (SELECT id FROM engagements WHERE name = 'PTO')
    """))
    conn.execute(text("DELETE FROM engagements WHERE name = 'PTO'"))
    conn.execute(text("DELETE FROM quotes WHERE quote_number = 'PTO-001'"))
    conn.execute(text("""
        DELETE FROM estimates WHERE name = 'PTO' AND opportunity_id IN
        (SELECT id FROM opportunities WHERE name = 'PTO')
    """))
    conn.execute(text("""
        DELETE FROM opportunities WHERE name = 'PTO' AND account_id IN
        (SELECT id FROM accounts WHERE company_name = 'Ready')
    """))
    conn.execute(text("DELETE FROM accounts WHERE company_name = 'Ready'"))


def downgrade() -> None:
    op.drop_column('timesheet_entries', 'engagement_display_name')
    op.drop_column('timesheet_entries', 'account_display_name')
    op.alter_column(
        'timesheet_entries',
        'account_id',
        existing_type=sa.dialects.postgresql.UUID(as_uuid=True),
        nullable=False,
    )
    # Note: Cannot restore Ready/PTO data; would need to re-run seed logic.

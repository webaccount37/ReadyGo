"""add_holiday_to_timesheet_entries

Revision ID: add_holiday_ts
Revises: redesign_cal
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa


revision = 'add_holiday_ts'
down_revision = 'redesign_cal'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add HOLIDAY to timesheetentrytype enum (PostgreSQL)
    op.execute("ALTER TYPE timesheetentrytype ADD VALUE 'HOLIDAY'")
    # Add is_holiday_row column
    op.add_column(
        'timesheet_entries',
        sa.Column('is_holiday_row', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('timesheet_entries', 'is_holiday_row')
    # Note: PostgreSQL does not support removing enum values easily.
    # A full downgrade would require recreating the enum and column.
    pass

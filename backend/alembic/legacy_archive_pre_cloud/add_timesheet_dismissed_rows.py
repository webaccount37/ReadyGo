"""add_timesheet_dismissed_rows

Revision ID: add_ts_dismissed
Revises: remove_dup_0hr
Create Date: 2026-03-07

Creates timesheet_dismissed_rows table for permanently removed engagement/holiday rows.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = 'add_ts_dismissed'
down_revision = 'remove_dup_0hr'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'timesheet_dismissed_rows',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('timesheet_id', UUID(as_uuid=True), sa.ForeignKey('timesheets.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('engagement_line_item_id', UUID(as_uuid=True), nullable=False, index=True),
        sa.UniqueConstraint('timesheet_id', 'engagement_line_item_id', name='uq_ts_dismissed_ts_key'),
    )


def downgrade() -> None:
    op.drop_table('timesheet_dismissed_rows')

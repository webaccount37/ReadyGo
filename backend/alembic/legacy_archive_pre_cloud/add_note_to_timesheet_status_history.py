"""add_note_to_timesheet_status_history

Revision ID: add_note_tsh
Revises: add_timesheet_tables
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa


revision = 'add_note_tsh'
down_revision = 'add_timesheet_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'timesheet_status_history',
        sa.Column('note', sa.String(2000), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('timesheet_status_history', 'note')

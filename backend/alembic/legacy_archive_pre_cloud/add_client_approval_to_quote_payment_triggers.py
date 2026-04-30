"""add_client_approval_to_quote_payment_triggers

Revision ID: add_client_approval_trigger
Revises: add_ts_dismissed
Create Date: 2026-03-07

Adds client_approval column to quote_payment_triggers for Fixed Bid quotes.
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_client_approval_trigger'
down_revision = 'add_ts_dismissed'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'quote_payment_triggers',
        sa.Column('client_approval', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('quote_payment_triggers', 'client_approval')

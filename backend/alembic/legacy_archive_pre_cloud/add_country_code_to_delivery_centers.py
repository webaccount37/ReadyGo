"""add_country_code_to_delivery_centers

Revision ID: add_country_dc
Revises: add_note_tsh
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa


revision = 'add_country_dc'
down_revision = 'add_note_tsh'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'delivery_centers',
        sa.Column('country_code', sa.String(2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('delivery_centers', 'country_code')

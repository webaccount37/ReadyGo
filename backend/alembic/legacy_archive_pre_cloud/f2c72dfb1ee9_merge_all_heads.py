"""merge_all_heads

Revision ID: f2c72dfb1ee9
Revises: add_billable_expense_pct, add_currency_rates, rename_releases_engagements
Create Date: 2026-01-01 18:33:49.498765

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f2c72dfb1ee9'
down_revision = ('add_billable_expense_pct', 'add_currency_rates', 'rename_releases_engagements')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass












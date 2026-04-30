"""merge all heads before accounts update

Revision ID: merge_accounts_heads
Revises: 90b703184eec, merge_engagements_opportunities
Create Date: 2025-01-XX

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'merge_accounts_heads'
down_revision = ('90b703184eec', 'merge_engagements_opportunities')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

"""Partial index on quotes(opportunity_id) for active quotes (list + lock checks)."""

from alembic import op

revision = "quotes_ix_opportunity_active_001"
down_revision = "expense_mgmt_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_quotes_opportunity_active "
        "ON quotes (opportunity_id) WHERE is_active = true"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_quotes_opportunity_active")

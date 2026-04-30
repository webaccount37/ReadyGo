"""Index to support default quotes list ORDER BY created_at DESC."""

from alembic import op

revision = "quotes_list_perf_created_at_001"
down_revision = "quotes_ix_opportunity_active_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_quotes_created_at_id_desc "
        "ON quotes (created_at DESC, id DESC)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_quotes_created_at_id_desc")

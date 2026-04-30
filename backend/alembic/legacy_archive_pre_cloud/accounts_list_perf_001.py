"""Indexes for account list filtering, sorting, and related aggregates."""

from alembic import op

revision = "accounts_list_perf_001"
down_revision = "accounts_docs_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Account list ORDER BY / WHERE (search uses ILIKE; btree still helps equality + range on sort columns)
    op.execute("CREATE INDEX IF NOT EXISTS ix_accounts_city ON accounts (city)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_accounts_region ON accounts (region)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_accounts_industry ON accounts (industry)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_accounts_country ON accounts (country)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_accounts_region_company_name ON accounts (region, company_name)"
    )
    # Approved / invoiced timesheets joined heavily from plan-actuals batch reads
    op.execute("CREATE INDEX IF NOT EXISTS ix_timesheets_status ON timesheets (status)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_timesheets_status")
    op.execute("DROP INDEX IF EXISTS ix_accounts_region_company_name")
    op.execute("DROP INDEX IF EXISTS ix_accounts_country")
    op.execute("DROP INDEX IF EXISTS ix_accounts_industry")
    op.execute("DROP INDEX IF EXISTS ix_accounts_region")
    op.execute("DROP INDEX IF EXISTS ix_accounts_city")

"""Add discovery to opportunitystatus enum; default new rows to discovery.

Revision ID: a003_discovery_status
Revises: expense_mgmt_001
Create Date: 2026-04-17

"""
from alembic import op


revision = "a003_discovery_status"
down_revision = "expense_mgmt_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL: a new enum label is not usable until committed; Alembic runs the
    # migration in one transaction, so ADD VALUE must run in an autocommit block.
    op.execute("ALTER TABLE opportunities ALTER COLUMN status DROP DEFAULT")
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE opportunitystatus ADD VALUE 'discovery' BEFORE 'qualified'")
    op.execute(
        "ALTER TABLE opportunities ALTER COLUMN status SET DEFAULT 'discovery'::opportunitystatus"
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE opportunities
        SET status = 'qualified'
        WHERE status = 'discovery'
        """
    )
    op.execute("ALTER TABLE opportunities ALTER COLUMN status DROP DEFAULT")
    op.execute(
        """
        CREATE TYPE opportunitystatus_old AS ENUM (
            'qualified', 'proposal', 'negotiation', 'won', 'lost', 'cancelled'
        )
        """
    )
    op.execute(
        """
        ALTER TABLE opportunities
            ALTER COLUMN status TYPE opportunitystatus_old
            USING status::text::opportunitystatus_old
        """
    )
    op.execute("DROP TYPE opportunitystatus")
    op.execute("ALTER TYPE opportunitystatus_old RENAME TO opportunitystatus")
    op.execute(
        "ALTER TABLE opportunities ALTER COLUMN status SET DEFAULT 'qualified'::opportunitystatus"
    )

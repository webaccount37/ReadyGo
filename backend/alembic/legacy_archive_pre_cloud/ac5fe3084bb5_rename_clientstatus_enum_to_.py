"""rename_clientstatus_enum_to_accountstatus

Revision ID: ac5fe3084bb5
Revises: e98a09c1e5b4
Create Date: 2025-12-06 05:21:59.037155

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ac5fe3084bb5'
down_revision = 'e98a09c1e5b4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename the enum type from clientstatus to accountstatus
    # Check if clientstatus exists and accountstatus doesn't
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clientstatus')
            AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'accountstatus')
            THEN
                ALTER TYPE clientstatus RENAME TO accountstatus;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    # Revert the enum type from accountstatus to clientstatus
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'accountstatus')
            AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clientstatus')
            THEN
                ALTER TYPE accountstatus RENAME TO clientstatus;
            END IF;
        END $$;
    """)





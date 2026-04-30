"""cleanup duplicate engagements table and enums

Revision ID: 541d4c1511e4
Revises: a06afe444aa4
Create Date: 2026-01-05 05:35:41.136976

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '541d4c1511e4'
down_revision = 'a06afe444aa4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the old engagements table if it exists (data should already be in opportunities)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'engagements') THEN
                DROP TABLE IF EXISTS engagements CASCADE;
            END IF;
        END $$;
    """)
    
    # Drop old enum types if they exist (opportunity enums should already exist)
    op.execute("""
        DO $$
        BEGIN
            -- Drop engagementstatus enum if it exists
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'engagementstatus') THEN
                DROP TYPE IF EXISTS engagementstatus CASCADE;
            END IF;
            
            -- Drop engagementtype enum if it exists
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'engagementtype') THEN
                DROP TYPE IF EXISTS engagementtype CASCADE;
            END IF;
            
            -- Drop array types if they exist
            DROP TYPE IF EXISTS _engagementstatus CASCADE;
            DROP TYPE IF EXISTS _engagementtype CASCADE;
        END $$;
    """)


def downgrade() -> None:
    # Note: This downgrade cannot recreate the engagements table with data
    # as we don't have the original data structure
    pass













"""rename_project_enums_to_engagement_enums

Revision ID: 88e3e4f24793
Revises: ac5fe3084bb5
Create Date: 2025-12-06 05:25:36.613863

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '88e3e4f24793'
down_revision = 'ac5fe3084bb5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename enum types from projectstatus/projecttype to engagementstatus/engagementtype
    # Check if they exist before renaming
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'projectstatus')
            AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'engagementstatus')
            THEN
                ALTER TYPE projectstatus RENAME TO engagementstatus;
            END IF;
            
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'projecttype')
            AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'engagementtype')
            THEN
                ALTER TYPE projecttype RENAME TO engagementtype;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    # Revert enum types from engagementstatus/engagementtype to projectstatus/projecttype
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'engagementstatus')
            AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'projectstatus')
            THEN
                ALTER TYPE engagementstatus RENAME TO projectstatus;
            END IF;
            
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'engagementtype')
            AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'projecttype')
            THEN
                ALTER TYPE engagementtype RENAME TO projecttype;
            END IF;
        END $$;
    """)





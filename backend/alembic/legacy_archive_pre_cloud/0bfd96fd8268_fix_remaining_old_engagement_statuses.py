"""fix_remaining_old_engagement_statuses

Revision ID: 0bfd96fd8268
Revises: 3922f929429d
Create Date: 2025-12-06 06:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0bfd96fd8268'
down_revision = '3922f929429d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Fix any remaining old status values that might have been missed
    # This handles case-insensitive matching and any edge cases
    op.execute("""
        UPDATE engagements 
        SET status = CASE 
            WHEN LOWER(status::text) = 'planning' THEN 'discovery'::engagementstatus
            WHEN LOWER(status::text) = 'active' THEN 'qualified'::engagementstatus
            WHEN LOWER(status::text) = 'completed' THEN 'won'::engagementstatus
            WHEN LOWER(status::text) IN ('on-hold', 'on_hold') THEN 'discovery'::engagementstatus
            ELSE status
        END
        WHERE LOWER(status::text) IN ('planning', 'active', 'completed', 'on-hold', 'on_hold')
    """)


def downgrade() -> None:
    # No-op - cannot downgrade without old enum values
    pass

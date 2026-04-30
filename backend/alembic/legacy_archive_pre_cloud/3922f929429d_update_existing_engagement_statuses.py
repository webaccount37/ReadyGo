"""update_existing_engagement_statuses

Revision ID: 3922f929429d
Revises: 3b1f4147b1aa
Create Date: 2025-12-06 06:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3922f929429d'
down_revision = '3b1f4147b1aa'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Update existing engagement statuses from old values to new values
    # This runs after the enum values have been committed
    # Handle both lowercase and uppercase enum values (PostgreSQL stores enum values as-is)
    # Use LOWER() to handle case-insensitive matching
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
    
    # Calculate probability for existing records based on their new status
    op.execute("""
        UPDATE engagements 
        SET probability = CASE 
            WHEN status::text = 'discovery' THEN 10.0
            WHEN status::text = 'qualified' THEN 25.0
            WHEN status::text = 'proposal' THEN 50.0
            WHEN status::text = 'negotiation' THEN 80.0
            WHEN status::text = 'won' THEN 100.0
            ELSE 0.0
        END
        WHERE probability IS NULL
    """)


def downgrade() -> None:
    # Note: Cannot downgrade because old enum values ('planning', 'active', 'completed', 'on-hold') 
    # no longer exist in the engagementstatus enum type.
    # To downgrade, you would need to:
    # 1. Add back the old enum values
    # 2. Update records back to old values
    # 3. Remove new enum values
    # This is complex and not recommended, so we'll leave this as a no-op
    pass

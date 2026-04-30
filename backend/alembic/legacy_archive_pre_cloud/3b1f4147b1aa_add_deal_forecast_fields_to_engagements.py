"""add_deal_forecast_fields_to_engagements

Revision ID: 3b1f4147b1aa
Revises: 88e3e4f24793
Create Date: 2025-12-06 05:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '3b1f4147b1aa'
down_revision = '88e3e4f24793'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create new enum types (only if they don't exist)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'winprobability') THEN
                CREATE TYPE winprobability AS ENUM ('low', 'medium', 'high');
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'accountability') THEN
                CREATE TYPE accountability AS ENUM ('full_ownership', 'mgmt_accountable', 'mgmt_advisory', 'staff_aug_limited');
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'strategicimportance') THEN
                CREATE TYPE strategicimportance AS ENUM ('critical', 'high', 'medium', 'low');
            END IF;
        END $$;
    """)
    
    # Update EngagementStatus enum - add new values
    # Note: We'll add enum values but won't update existing data in the same transaction
    # The enum values will be available after the migration commits
    # Existing data will keep old values until manually updated or new records use new values
    
    # Add new enum values (they'll be committed when the migration transaction commits)
    op.execute("ALTER TYPE engagementstatus ADD VALUE IF NOT EXISTS 'discovery'")
    op.execute("ALTER TYPE engagementstatus ADD VALUE IF NOT EXISTS 'qualified'")
    op.execute("ALTER TYPE engagementstatus ADD VALUE IF NOT EXISTS 'proposal'")
    op.execute("ALTER TYPE engagementstatus ADD VALUE IF NOT EXISTS 'negotiation'")
    op.execute("ALTER TYPE engagementstatus ADD VALUE IF NOT EXISTS 'won'")
    op.execute("ALTER TYPE engagementstatus ADD VALUE IF NOT EXISTS 'lost'")
    op.execute("ALTER TYPE engagementstatus ADD VALUE IF NOT EXISTS 'cancelled'")
    
    # Note: We can't update existing records here because enum values need to be committed first
    # We'll update them in a post-migration script or let them be updated naturally
    # For now, we'll just add the enum values and columns
    
    # Add new columns to engagements table
    op.add_column('engagements', sa.Column('probability', sa.Float(), nullable=True))
    op.add_column('engagements', sa.Column('win_probability', postgresql.ENUM('low', 'medium', 'high', name='winprobability', create_type=False), nullable=True))
    op.add_column('engagements', sa.Column('accountability', postgresql.ENUM('full_ownership', 'mgmt_accountable', 'mgmt_advisory', 'staff_aug_limited', name='accountability', create_type=False), nullable=True))
    op.add_column('engagements', sa.Column('strategic_importance', postgresql.ENUM('critical', 'high', 'medium', 'low', name='strategicimportance', create_type=False), nullable=True))
    op.add_column('engagements', sa.Column('deal_creation_date', sa.Date(), nullable=True))
    op.add_column('engagements', sa.Column('deal_value', sa.Numeric(precision=15, scale=2), nullable=True))
    op.add_column('engagements', sa.Column('deal_value_usd', sa.Numeric(precision=15, scale=2), nullable=True))
    op.add_column('engagements', sa.Column('close_date', sa.Date(), nullable=True))
    op.add_column('engagements', sa.Column('deal_length', sa.Integer(), nullable=True))
    op.add_column('engagements', sa.Column('forecast_value', sa.Numeric(precision=15, scale=2), nullable=True))
    op.add_column('engagements', sa.Column('forecast_value_usd', sa.Numeric(precision=15, scale=2), nullable=True))
    op.add_column('engagements', sa.Column('project_start_month', sa.Integer(), nullable=True))
    op.add_column('engagements', sa.Column('project_start_year', sa.Integer(), nullable=True))
    op.add_column('engagements', sa.Column('project_duration_months', sa.Integer(), nullable=True))
    
    # Set default status to 'discovery' for new records
    op.execute("ALTER TABLE engagements ALTER COLUMN status SET DEFAULT 'discovery'::engagementstatus")
    
    # Set deal_creation_date for existing records (this doesn't require enum values)
    op.execute("UPDATE engagements SET deal_creation_date = COALESCE(deal_creation_date, start_date)")
    
    # Note: We'll update status values and calculate probability in a separate migration
    # after the enum values are committed, or the application will handle it naturally


def downgrade() -> None:
    # Remove new columns
    op.drop_column('engagements', 'project_duration_months')
    op.drop_column('engagements', 'project_start_year')
    op.drop_column('engagements', 'project_start_month')
    op.drop_column('engagements', 'forecast_value_usd')
    op.drop_column('engagements', 'forecast_value')
    op.drop_column('engagements', 'deal_length')
    op.drop_column('engagements', 'close_date')
    op.drop_column('engagements', 'deal_value_usd')
    op.drop_column('engagements', 'deal_value')
    op.drop_column('engagements', 'deal_creation_date')
    op.drop_column('engagements', 'strategic_importance')
    op.drop_column('engagements', 'accountability')
    op.drop_column('engagements', 'win_probability')
    op.drop_column('engagements', 'probability')
    
    # Revert status values (map new back to old)
    op.execute("""
        UPDATE engagements 
        SET status = CASE 
            WHEN status::text = 'discovery' THEN 'planning'::engagementstatus
            WHEN status::text = 'qualified' THEN 'active'::engagementstatus
            WHEN status::text = 'won' THEN 'completed'::engagementstatus
            WHEN status::text = 'lost' THEN 'on-hold'::engagementstatus
            WHEN status::text = 'cancelled' THEN 'on-hold'::engagementstatus
            WHEN status::text = 'proposal' THEN 'planning'::engagementstatus
            WHEN status::text = 'negotiation' THEN 'active'::engagementstatus
            ELSE status
        END
    """)
    
    # Set default status back to 'planning'
    op.execute("ALTER TABLE engagements ALTER COLUMN status SET DEFAULT 'planning'::engagementstatus")
    
    # Drop enum types
    op.execute("DROP TYPE IF EXISTS strategicimportance")
    op.execute("DROP TYPE IF EXISTS accountability")
    op.execute("DROP TYPE IF EXISTS winprobability")
    
    # Note: We don't remove the new enum values from engagementstatus as PostgreSQL
    # doesn't support removing enum values easily. They'll remain but unused.

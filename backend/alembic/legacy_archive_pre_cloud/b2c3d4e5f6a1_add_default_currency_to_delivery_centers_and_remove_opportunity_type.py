"""add_default_currency_to_delivery_centers_and_remove_opportunity_type

Revision ID: b2c3d4e5f6a1
Revises: 3b1f4147b1aa
Create Date: 2025-01-15 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6a1'
down_revision = 'add_payable_center_id'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add default_currency column to delivery_centers table
    op.add_column('delivery_centers', 
        sa.Column('default_currency', sa.String(3), nullable=False, server_default='USD')
    )
    
    # Update existing delivery centers with appropriate default currencies
    # Based on common currency usage by region
    op.execute("""
        UPDATE delivery_centers 
        SET default_currency = CASE 
            WHEN code = 'north-america' THEN 'USD'
            WHEN code = 'thailand' THEN 'THB'
            WHEN code = 'philippines' THEN 'PHP'
            WHEN code = 'australia' THEN 'AUD'
            ELSE 'USD'
        END
    """)
    
    # Drop opportunity_type column from opportunities table
    # First, drop any foreign key constraints or indexes if they exist
    op.drop_column('opportunities', 'opportunity_type')


def downgrade() -> None:
    # Recreate opportunity_type column
    # Check if OpportunityType enum exists, if not create it
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'opportunitytype') THEN
                CREATE TYPE opportunitytype AS ENUM ('implementation', 'consulting', 'support');
            END IF;
        END $$;
    """)
    
    op.add_column('opportunities',
        sa.Column('opportunity_type', postgresql.ENUM('implementation', 'consulting', 'support', name='opportunitytype', create_type=False), nullable=False, server_default='implementation')
    )
    
    # Remove default_currency column from delivery_centers table
    op.drop_column('delivery_centers', 'default_currency')


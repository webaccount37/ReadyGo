"""rename engagement_id to opportunity_id in estimates and quotes tables

Revision ID: 90b703184eec
Revises: 541d4c1511e4
Create Date: 2026-01-05 05:46:59.267604

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '90b703184eec'
down_revision = '541d4c1511e4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Delete orphaned records that reference non-existent engagements/opportunities
    # First, delete quotes that reference non-existent opportunities
    op.execute("""
        DELETE FROM quotes 
        WHERE engagement_id IS NOT NULL 
        AND engagement_id NOT IN (SELECT id FROM opportunities)
    """)
    
    # Then, delete estimates that reference non-existent opportunities
    op.execute("""
        DELETE FROM estimates 
        WHERE engagement_id IS NOT NULL 
        AND engagement_id NOT IN (SELECT id FROM opportunities)
    """)
    
    # Step 2: Rename engagement_id to opportunity_id in estimates table
    op.alter_column('estimates', 'engagement_id', new_column_name='opportunity_id')
    
    # Step 3: Rename engagement_id to opportunity_id in quotes table
    op.alter_column('quotes', 'engagement_id', new_column_name='opportunity_id')
    
    # Step 4: Rename indexes
    op.execute("ALTER INDEX IF EXISTS ix_estimates_engagement_id RENAME TO ix_estimates_opportunity_id")
    op.execute("ALTER INDEX IF EXISTS ix_quotes_engagement_id RENAME TO ix_quotes_opportunity_id")
    
    # Step 5: Create foreign key constraint for estimates.opportunity_id -> opportunities.id
    op.create_foreign_key(
        'fk_estimates_opportunity_id',
        'estimates', 'opportunities',
        ['opportunity_id'], ['id'],
        ondelete='CASCADE'
    )
    
    # Step 6: Create foreign key constraint for quotes.opportunity_id -> opportunities.id
    op.create_foreign_key(
        'fk_quotes_opportunity_id',
        'quotes', 'opportunities',
        ['opportunity_id'], ['id'],
        ondelete='CASCADE'
    )


def downgrade() -> None:
    # Step 1: Drop foreign key constraints
    op.drop_constraint('fk_quotes_opportunity_id', 'quotes', type_='foreignkey')
    op.drop_constraint('fk_estimates_opportunity_id', 'estimates', type_='foreignkey')
    
    # Step 2: Rename indexes back
    op.execute("ALTER INDEX IF EXISTS ix_quotes_opportunity_id RENAME TO ix_quotes_engagement_id")
    op.execute("ALTER INDEX IF EXISTS ix_estimates_opportunity_id RENAME TO ix_estimates_engagement_id")
    
    # Step 3: Rename opportunity_id back to engagement_id in quotes table
    op.alter_column('quotes', 'opportunity_id', new_column_name='engagement_id')
    
    # Step 4: Rename opportunity_id back to engagement_id in estimates table
    op.alter_column('estimates', 'opportunity_id', new_column_name='engagement_id')













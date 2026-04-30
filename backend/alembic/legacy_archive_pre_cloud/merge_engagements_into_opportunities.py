"""Merge engagements into opportunities

Revision ID: merge_engagements_opportunities
Revises: 0bfd96fd8268
Create Date: 2025-01-XX XX:XX:XX.000000

This migration merges the Engagement and Opportunity entities:
1. Migrates estimates.engagement_id -> estimates.opportunity_id
2. Migrates quotes.engagement_id -> quotes.opportunity_id
3. Drops engagements table
4. Drops employee_engagements table
5. Updates all foreign key constraints
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'merge_engagements_opportunities'
down_revision = '0bfd96fd8268'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Add opportunity_id columns to estimates and quotes (nullable initially)
    op.add_column(
        'estimates',
        sa.Column('opportunity_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_index('ix_estimates_opportunity_id', 'estimates', ['opportunity_id'])
    
    op.add_column(
        'quotes',
        sa.Column('opportunity_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_index('ix_quotes_opportunity_id', 'quotes', ['opportunity_id'])
    
    # Step 2: Migrate data from engagement_id to opportunity_id
    # For estimates: get opportunity_id from engagement.opportunity_id
    op.execute(sa.text("""
        UPDATE estimates e
        SET opportunity_id = eng.opportunity_id
        FROM engagements eng
        WHERE e.engagement_id = eng.id
    """))
    
    # For quotes: get opportunity_id from engagement.opportunity_id
    op.execute(sa.text("""
        UPDATE quotes q
        SET opportunity_id = eng.opportunity_id
        FROM engagements eng
        WHERE q.engagement_id = eng.id
    """))
    
    # Step 3: Ensure all opportunities have delivery_center_id set
    # Set a default delivery center if any opportunity is missing one
    op.execute(sa.text("""
        UPDATE opportunities o
        SET delivery_center_id = (
            SELECT id FROM delivery_centers LIMIT 1
        )
        WHERE o.delivery_center_id IS NULL
        AND EXISTS (SELECT 1 FROM delivery_centers)
    """))
    
    # Step 4: Make opportunity_id NOT NULL now that data is migrated
    op.alter_column('estimates', 'opportunity_id', nullable=False)
    op.alter_column('quotes', 'opportunity_id', nullable=False)
    
    # Step 5: Drop foreign key constraints on engagement_id
    # Drop constraints from estimates
    op.execute(sa.text("""
        DO $$
        DECLARE
            r record;
        BEGIN
            FOR r IN (
                SELECT conname
                FROM pg_constraint
                WHERE conrelid = 'estimates'::regclass
                  AND contype = 'f'
                  AND conname LIKE '%engagement_id%'
            ) LOOP
                EXECUTE 'ALTER TABLE estimates DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
            END LOOP;
        END $$;
    """))
    
    # Drop constraints from quotes
    op.execute(sa.text("""
        DO $$
        DECLARE
            r record;
        BEGIN
            FOR r IN (
                SELECT conname
                FROM pg_constraint
                WHERE conrelid = 'quotes'::regclass
                  AND contype = 'f'
                  AND conname LIKE '%engagement_id%'
            ) LOOP
                EXECUTE 'ALTER TABLE quotes DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
            END LOOP;
        END $$;
    """))
    
    # Step 6: Drop engagement_id columns
    op.drop_index('ix_estimates_engagement_id', table_name='estimates', if_exists=True)
    op.drop_column('estimates', 'engagement_id')
    
    op.drop_index('ix_quotes_engagement_id', table_name='quotes', if_exists=True)
    op.drop_column('quotes', 'engagement_id')
    
    # Step 7: Add foreign key constraints on opportunity_id
    op.create_foreign_key(
        'fk_estimates_opportunity_id',
        'estimates',
        'opportunities',
        ['opportunity_id'],
        ['id'],
        ondelete='CASCADE'
    )
    
    op.create_foreign_key(
        'fk_quotes_opportunity_id',
        'quotes',
        'opportunities',
        ['opportunity_id'],
        ['id'],
        ondelete='CASCADE'
    )
    
    # Step 8: Drop employee_engagements table if it exists
    op.execute(sa.text("""
        DROP TABLE IF EXISTS employee_engagements CASCADE;
    """))
    
    # Step 9: Drop engagements table
    # First drop any remaining foreign key constraints
    op.execute(sa.text("""
        DO $$
        DECLARE
            r record;
        BEGIN
            FOR r IN (
                SELECT conname
                FROM pg_constraint
                WHERE conrelid = 'engagements'::regclass
                  AND contype = 'f'
            ) LOOP
                EXECUTE 'ALTER TABLE engagements DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
            END LOOP;
        END $$;
    """))
    
    # Drop indexes on engagements
    op.execute(sa.text("""
        DROP INDEX IF EXISTS ix_engagements_id;
        DROP INDEX IF EXISTS ix_engagements_name;
        DROP INDEX IF EXISTS ix_engagements_opportunity_id;
        DROP INDEX IF EXISTS ix_engagements_status;
        DROP INDEX IF EXISTS ix_engagements_billing_term_id;
        DROP INDEX IF EXISTS ix_engagements_delivery_center_id;
    """))
    
    # Drop the engagements table
    op.drop_table('engagements')


def downgrade() -> None:
    # Recreate engagements table
    op.create_table(
        'engagements',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('opportunity_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('budget', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('status', postgresql.ENUM('planning', 'active', 'completed', 'on-hold', name='engagementstatus'), nullable=False),
        sa.Column('billing_term_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('description', sa.String(length=2000), nullable=True),
        sa.Column('default_currency', sa.String(length=3), nullable=False, server_default='USD'),
        sa.Column('delivery_center_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('attributes', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(['opportunity_id'], ['opportunities.id']),
        sa.ForeignKeyConstraint(['billing_term_id'], ['billing_terms.id']),
        sa.ForeignKeyConstraint(['delivery_center_id'], ['delivery_centers.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_engagements_delivery_center_id', 'engagements', ['delivery_center_id'])
    op.create_index('ix_engagements_billing_term_id', 'engagements', ['billing_term_id'])
    op.create_index('ix_engagements_status', 'engagements', ['status'])
    op.create_index('ix_engagements_opportunity_id', 'engagements', ['opportunity_id'])
    op.create_index('ix_engagements_name', 'engagements', ['name'])
    op.create_index('ix_engagements_id', 'engagements', ['id'])
    
    # Recreate employee_engagements table
    op.create_table(
        'employee_engagements',
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('engagement_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('role_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('project_rate', sa.Float(), nullable=False),
        sa.Column('delivery_center', postgresql.ENUM('north-america', 'thailand', 'philippines', 'australia', name='deliverycenterenum'), nullable=False),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id']),
        sa.ForeignKeyConstraint(['engagement_id'], ['engagements.id']),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id']),
        sa.PrimaryKeyConstraint('employee_id', 'engagement_id')
    )
    
    # Add engagement_id columns back to estimates and quotes
    op.add_column(
        'estimates',
        sa.Column('engagement_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_index('ix_estimates_engagement_id', 'estimates', ['engagement_id'])
    
    op.add_column(
        'quotes',
        sa.Column('engagement_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_index('ix_quotes_engagement_id', 'quotes', ['engagement_id'])
    
    # Migrate data back (create engagements from opportunities)
    # This is a simplified downgrade - we'll create one engagement per opportunity
    op.execute(sa.text("""
        INSERT INTO engagements (id, name, opportunity_id, start_date, end_date, status, default_currency, delivery_center_id)
        SELECT 
            gen_random_uuid() as id,
            o.name || ' - Engagement' as name,
            o.id as opportunity_id,
            o.start_date,
            o.end_date,
            'planning'::engagementstatus as status,
            o.default_currency,
            o.delivery_center_id
        FROM opportunities o
        WHERE NOT EXISTS (
            SELECT 1 FROM engagements e WHERE e.opportunity_id = o.id
        )
    """))
    
    # Link estimates back to engagements (use first engagement per opportunity)
    op.execute(sa.text("""
        UPDATE estimates e
        SET engagement_id = eng.id
        FROM engagements eng
        WHERE e.opportunity_id = eng.opportunity_id
        AND eng.id = (
            SELECT id FROM engagements 
            WHERE opportunity_id = eng.opportunity_id 
            ORDER BY id LIMIT 1
        )
    """))
    
    # Link quotes back to engagements
    op.execute(sa.text("""
        UPDATE quotes q
        SET engagement_id = eng.id
        FROM engagements eng
        WHERE q.opportunity_id = eng.opportunity_id
        AND eng.id = (
            SELECT id FROM engagements 
            WHERE opportunity_id = eng.opportunity_id 
            ORDER BY id LIMIT 1
        )
    """))
    
    # Make engagement_id NOT NULL
    op.alter_column('estimates', 'engagement_id', nullable=False)
    op.alter_column('quotes', 'engagement_id', nullable=False)
    
    # Drop foreign key constraints on opportunity_id
    op.drop_constraint('fk_quotes_opportunity_id', 'quotes', type_='foreignkey')
    op.drop_constraint('fk_estimates_opportunity_id', 'estimates', type_='foreignkey')
    
    # Drop opportunity_id columns
    op.drop_index('ix_quotes_opportunity_id', table_name='quotes')
    op.drop_column('quotes', 'opportunity_id')
    
    op.drop_index('ix_estimates_opportunity_id', table_name='estimates')
    op.drop_column('estimates', 'opportunity_id')
    
    # Re-add foreign key constraints on engagement_id
    op.create_foreign_key(
        'fk_estimates_engagement_id',
        'estimates',
        'engagements',
        ['engagement_id'],
        ['id'],
        ondelete='CASCADE'
    )
    
    op.create_foreign_key(
        'fk_quotes_engagement_id',
        'quotes',
        'engagements',
        ['engagement_id'],
        ['id'],
        ondelete='CASCADE'
    )

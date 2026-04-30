"""Rename Engagements to Opportunities

Revision ID: e170c8985fb
Revises: add_billable_est_line_items
Create Date: 2025-01-XX

This migration:
1. Renames engagements table to opportunities
2. Renames engagement_id columns to opportunity_id
3. Renames parent_engagement_id to parent_opportunity_id
4. Renames engagement_owner_id to opportunity_owner_id
5. Renames enum types: engagementstatus -> opportunitystatus, engagementtype -> opportunitytype
6. Updates all foreign key constraints and indexes
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'e170c8985fb'
down_revision = 'add_billable_est_line_items'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Rename enum types
    op.execute("ALTER TYPE engagementstatus RENAME TO opportunitystatus")
    op.execute("ALTER TYPE engagementtype RENAME TO opportunitytype")
    
    # Step 2: Rename engagements table to opportunities
    op.rename_table('engagements', 'opportunities')
    
    # Step 3: Rename columns in opportunities table
    op.alter_column('opportunities', 'parent_engagement_id', new_column_name='parent_opportunity_id')
    op.alter_column('opportunities', 'engagement_owner_id', new_column_name='opportunity_owner_id')
    op.alter_column('opportunities', 'engagement_type', new_column_name='opportunity_type')
    
    # Step 4: Update self-referential foreign key for parent_opportunity_id
    # Drop and recreate the foreign key constraint
    op.execute("""
        DO $$
        DECLARE
            constraint_name text;
        BEGIN
            -- Find and drop the parent_engagement_id constraint
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = 'opportunities'::regclass
            AND contype = 'f'
            AND (conname LIKE '%parent%engagement%' OR conname LIKE '%parent_engagement%')
            LIMIT 1;
            IF constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE opportunities DROP CONSTRAINT %I', constraint_name);
            END IF;
        END $$;
    """)
    
    # Create new foreign key constraint
    op.create_foreign_key(
        'fk_opportunities_parent_opportunity_id',
        'opportunities', 'opportunities',
        ['parent_opportunity_id'], ['id']
    )
    
    # Step 5: Update foreign key constraint for opportunity_owner_id
    op.execute("""
        DO $$
        DECLARE
            constraint_name text;
        BEGIN
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = 'opportunities'::regclass
            AND contype = 'f'
            AND (conname LIKE '%engagement_owner%' OR conname LIKE '%engagement%owner%')
            LIMIT 1;
            IF constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE opportunities RENAME CONSTRAINT %I TO fk_opportunities_opportunity_owner_id', constraint_name);
            END IF;
        END $$;
    """)
    
    # Step 6: Rename indexes on opportunities table
    op.execute("ALTER INDEX IF EXISTS ix_engagements_id RENAME TO ix_opportunities_id")
    op.execute("ALTER INDEX IF EXISTS ix_engagements_name RENAME TO ix_opportunities_name")
    op.execute("ALTER INDEX IF EXISTS ix_engagements_account_id RENAME TO ix_opportunities_account_id")
    op.execute("ALTER INDEX IF EXISTS ix_engagements_billing_term_id RENAME TO ix_opportunities_billing_term_id")
    op.execute("ALTER INDEX IF EXISTS ix_engagements_delivery_center_id RENAME TO ix_opportunities_delivery_center_id")
    op.execute("ALTER INDEX IF EXISTS ix_engagements_engagement_owner_id RENAME TO ix_opportunities_opportunity_owner_id")
    
    # Step 7: Rename foreign key constraints on opportunities table
    op.execute("""
        DO $$
        DECLARE
            constraint_name text;
        BEGIN
            -- Rename account_id constraint
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = 'opportunities'::regclass
            AND contype = 'f'
            AND (conname LIKE '%account%' OR conname LIKE '%account_id%')
            AND conname NOT LIKE '%parent%'
            AND conname NOT LIKE '%owner%'
            LIMIT 1;
            IF constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE opportunities RENAME CONSTRAINT %I TO fk_opportunities_account_id', constraint_name);
            END IF;
            
            -- Rename billing_term_id constraint
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = 'opportunities'::regclass
            AND contype = 'f'
            AND (conname LIKE '%billing_term%' OR conname LIKE '%billing%term%')
            LIMIT 1;
            IF constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE opportunities RENAME CONSTRAINT %I TO fk_opportunities_billing_term_id', constraint_name);
            END IF;
            
            -- Rename delivery_center_id constraint
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = 'opportunities'::regclass
            AND contype = 'f'
            AND (conname LIKE '%delivery_center%' OR conname LIKE '%delivery%center%')
            LIMIT 1;
            IF constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE opportunities RENAME CONSTRAINT %I TO fk_opportunities_delivery_center_id', constraint_name);
            END IF;
        END $$;
    """)
    
    # Step 8: Update releases table - rename engagement_id to opportunity_id
    op.alter_column('releases', 'engagement_id', new_column_name='opportunity_id')
    
    # Update foreign key constraint in releases table
    op.execute("""
        DO $$
        DECLARE
            constraint_name text;
        BEGIN
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = 'releases'::regclass
            AND contype = 'f'
            AND (conname LIKE '%engagement%' OR conname LIKE '%engagement_id%')
            LIMIT 1;
            IF constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE releases DROP CONSTRAINT %I', constraint_name);
            END IF;
        END $$;
    """)
    
    op.create_foreign_key(
        'fk_releases_opportunity_id',
        'releases', 'opportunities',
        ['opportunity_id'], ['id']
    )
    
    # Rename index on releases table
    op.execute("ALTER INDEX IF EXISTS ix_releases_engagement_id RENAME TO ix_releases_opportunity_id")


def downgrade() -> None:
    # Reverse all changes in opposite order
    
    # Step 8: Revert releases table
    op.execute("ALTER INDEX IF EXISTS ix_releases_opportunity_id RENAME TO ix_releases_engagement_id")
    op.drop_constraint('fk_releases_opportunity_id', 'releases', type_='foreignkey')
    op.create_foreign_key(
        'fk_releases_engagement_id',
        'releases', 'opportunities',
        ['opportunity_id'], ['id']
    )
    op.alter_column('releases', 'opportunity_id', new_column_name='engagement_id')
    
    # Step 7: Revert foreign key constraints on opportunities table
    op.execute("""
        DO $$
        DECLARE
            constraint_name text;
        BEGIN
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = 'opportunities'::regclass
            AND contype = 'f'
            AND conname = 'fk_opportunities_delivery_center_id'
            LIMIT 1;
            IF constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE opportunities RENAME CONSTRAINT %I TO fk_engagements_delivery_center_id', constraint_name);
            END IF;
            
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = 'opportunities'::regclass
            AND contype = 'f'
            AND conname = 'fk_opportunities_billing_term_id'
            LIMIT 1;
            IF constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE opportunities RENAME CONSTRAINT %I TO fk_engagements_billing_term_id', constraint_name);
            END IF;
            
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = 'opportunities'::regclass
            AND contype = 'f'
            AND conname = 'fk_opportunities_account_id'
            LIMIT 1;
            IF constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE opportunities RENAME CONSTRAINT %I TO fk_engagements_account_id', constraint_name);
            END IF;
        END $$;
    """)
    
    # Step 6: Revert indexes
    op.execute("ALTER INDEX IF EXISTS ix_opportunities_opportunity_owner_id RENAME TO ix_engagements_engagement_owner_id")
    op.execute("ALTER INDEX IF EXISTS ix_opportunities_delivery_center_id RENAME TO ix_engagements_delivery_center_id")
    op.execute("ALTER INDEX IF EXISTS ix_opportunities_billing_term_id RENAME TO ix_engagements_billing_term_id")
    op.execute("ALTER INDEX IF EXISTS ix_opportunities_account_id RENAME TO ix_engagements_account_id")
    op.execute("ALTER INDEX IF EXISTS ix_opportunities_name RENAME TO ix_engagements_name")
    op.execute("ALTER INDEX IF EXISTS ix_opportunities_id RENAME TO ix_engagements_id")
    
    # Step 5: Revert opportunity_owner_id constraint
    op.execute("""
        DO $$
        DECLARE
            constraint_name text;
        BEGIN
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = 'opportunities'::regclass
            AND contype = 'f'
            AND conname = 'fk_opportunities_opportunity_owner_id'
            LIMIT 1;
            IF constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE opportunities RENAME CONSTRAINT %I TO fk_engagements_engagement_owner_id', constraint_name);
            END IF;
        END $$;
    """)
    
    # Step 4: Revert parent_opportunity_id foreign key
    op.drop_constraint('fk_opportunities_parent_opportunity_id', 'opportunities', type_='foreignkey')
    op.create_foreign_key(
        'fk_engagements_parent_engagement_id',
        'opportunities', 'opportunities',
        ['parent_opportunity_id'], ['id']
    )
    
    # Step 3: Revert column names
    op.alter_column('opportunities', 'opportunity_type', new_column_name='engagement_type')
    op.alter_column('opportunities', 'opportunity_owner_id', new_column_name='engagement_owner_id')
    op.alter_column('opportunities', 'parent_opportunity_id', new_column_name='parent_engagement_id')
    
    # Step 2: Revert table name
    op.rename_table('opportunities', 'engagements')
    
    # Step 1: Revert enum types
    op.execute("ALTER TYPE opportunitystatus RENAME TO engagementstatus")
    op.execute("ALTER TYPE opportunitytype RENAME TO engagementtype")


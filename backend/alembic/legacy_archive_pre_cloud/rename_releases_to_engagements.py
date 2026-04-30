"""rename_releases_to_engagements

Revision ID: rename_releases_engagements
Revises: replace_account_region_releases
Create Date: 2025-12-07 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'rename_releases_engagements'
down_revision = 'replace_account_region_releases'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename the enum type if it exists (PostgreSQL creates enum types)
    op.execute("""
        DO $$ 
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'releasestatus') THEN
                ALTER TYPE releasestatus RENAME TO engagementstatus;
            END IF;
        END $$;
    """)
    
    # Rename employee_releases table to employee_engagements first (before renaming releases table)
    # Check if employee_releases table exists before renaming
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'employee_releases') THEN
                ALTER TABLE employee_releases RENAME TO employee_engagements;
            END IF;
        END $$;
    """)
    
    # Rename release_id to engagement_id in employee_engagements table (if table exists)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'employee_engagements') THEN
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employee_engagements' AND column_name = 'release_id') THEN
                    ALTER TABLE employee_engagements RENAME COLUMN release_id TO engagement_id;
                END IF;
            END IF;
        END $$;
    """)
    
    # Rename foreign key columns in estimates and quotes tables (before renaming releases table)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'estimates' AND column_name = 'release_id') THEN
                ALTER TABLE estimates RENAME COLUMN release_id TO engagement_id;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'release_id') THEN
                ALTER TABLE quotes RENAME COLUMN release_id TO engagement_id;
            END IF;
        END $$;
    """)
    
    # Now rename the releases table to engagements
    op.rename_table('releases', 'engagements')
    
    # Update foreign key constraint in employee_engagements to reference engagements table
    op.execute("""
        DO $$
        DECLARE
            constraint_name text;
        BEGIN
            -- Only proceed if employee_engagements table exists
            IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'employee_engagements') THEN
                -- Find and drop the old foreign key constraint
                SELECT conname INTO constraint_name
                FROM pg_constraint
                WHERE conrelid = 'employee_engagements'::regclass
                AND contype = 'f'
                AND conname LIKE '%release%';
                
                IF constraint_name IS NOT NULL THEN
                    -- Drop old constraint
                    EXECUTE format('ALTER TABLE employee_engagements DROP CONSTRAINT %I', constraint_name);
                    -- Create new constraint pointing to engagements
                    EXECUTE format('ALTER TABLE employee_engagements ADD CONSTRAINT %I FOREIGN KEY (engagement_id) REFERENCES engagements(id)',
                        replace(constraint_name, 'release', 'engagement'));
                END IF;
            END IF;
        END $$;
    """)
    
    # Rename foreign key constraints in estimates
    op.execute("""
        DO $$
        DECLARE
            constraint_name text;
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'estimates') THEN
                SELECT conname INTO constraint_name
                FROM pg_constraint
                WHERE conrelid = 'estimates'::regclass
                AND conname LIKE '%release%';
                
                IF constraint_name IS NOT NULL THEN
                    EXECUTE format('ALTER TABLE estimates RENAME CONSTRAINT %I TO %I', 
                        constraint_name, 
                        replace(constraint_name, 'release', 'engagement'));
                END IF;
            END IF;
        END $$;
    """)
    
    # Rename foreign key constraints in quotes
    op.execute("""
        DO $$
        DECLARE
            constraint_name text;
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'quotes') THEN
                SELECT conname INTO constraint_name
                FROM pg_constraint
                WHERE conrelid = 'quotes'::regclass
                AND conname LIKE '%release%';
                
                IF constraint_name IS NOT NULL THEN
                    EXECUTE format('ALTER TABLE quotes RENAME CONSTRAINT %I TO %I', 
                        constraint_name, 
                        replace(constraint_name, 'release', 'engagement'));
                END IF;
            END IF;
        END $$;
    """)
    
    # Rename indexes for foreign keys
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_estimates_release_id') THEN
                ALTER INDEX ix_estimates_release_id RENAME TO ix_estimates_engagement_id;
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_quotes_release_id') THEN
                ALTER INDEX ix_quotes_release_id RENAME TO ix_quotes_engagement_id;
            END IF;
        END $$;
    """)
    
    # Rename foreign key constraints on engagements table
    op.execute("""
        DO $$
        DECLARE
            constraint_name text;
        BEGIN
            FOR constraint_name IN
                SELECT conname
                FROM pg_constraint
                WHERE conrelid = 'engagements'::regclass
                AND conname LIKE '%releases%'
            LOOP
                EXECUTE format('ALTER TABLE engagements RENAME CONSTRAINT %I TO %I', 
                    constraint_name, 
                    replace(constraint_name, 'releases', 'engagements'));
            END LOOP;
        END $$;
    """)
    
    # Rename indexes on engagements table
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_releases_opportunity_id') THEN
                ALTER INDEX ix_releases_opportunity_id RENAME TO ix_engagements_opportunity_id;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_releases_billing_term_id') THEN
                ALTER INDEX ix_releases_billing_term_id RENAME TO ix_engagements_billing_term_id;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_releases_delivery_center_id') THEN
                ALTER INDEX ix_releases_delivery_center_id RENAME TO ix_engagements_delivery_center_id;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_releases_name') THEN
                ALTER INDEX ix_releases_name RENAME TO ix_engagements_name;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    # Rename the table back first
    op.rename_table('engagements', 'releases')
    
    # Rename indexes back on releases table
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_engagements_opportunity_id') THEN
                ALTER INDEX ix_engagements_opportunity_id RENAME TO ix_releases_opportunity_id;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_engagements_billing_term_id') THEN
                ALTER INDEX ix_engagements_billing_term_id RENAME TO ix_releases_billing_term_id;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_engagements_delivery_center_id') THEN
                ALTER INDEX ix_engagements_delivery_center_id RENAME TO ix_releases_delivery_center_id;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_engagements_name') THEN
                ALTER INDEX ix_engagements_name RENAME TO ix_releases_name;
            END IF;
        END $$;
    """)
    
    # Rename foreign key constraints back on releases table
    op.execute("""
        DO $$
        DECLARE
            constraint_name text;
        BEGIN
            FOR constraint_name IN
                SELECT conname
                FROM pg_constraint
                WHERE conrelid = 'releases'::regclass
                AND conname LIKE '%engagements%'
            LOOP
                EXECUTE format('ALTER TABLE releases RENAME CONSTRAINT %I TO %I', 
                    constraint_name, 
                    replace(constraint_name, 'engagements', 'releases'));
            END LOOP;
        END $$;
    """)
    
    # Rename indexes back for foreign keys
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_estimates_engagement_id') THEN
                ALTER INDEX ix_estimates_engagement_id RENAME TO ix_estimates_release_id;
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_quotes_engagement_id') THEN
                ALTER INDEX ix_quotes_engagement_id RENAME TO ix_quotes_release_id;
            END IF;
        END $$;
    """)
    
    # Rename foreign key constraints back in estimates
    op.execute("""
        DO $$
        DECLARE
            constraint_name text;
        BEGIN
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = 'estimates'::regclass
            AND conname LIKE '%engagement%';
            
            IF constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE estimates RENAME CONSTRAINT %I TO %I', 
                    constraint_name, 
                    replace(constraint_name, 'engagement', 'release'));
            END IF;
        END $$;
    """)
    
    # Rename foreign key constraints back in quotes
    op.execute("""
        DO $$
        DECLARE
            constraint_name text;
        BEGIN
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = 'quotes'::regclass
            AND conname LIKE '%engagement%';
            
            IF constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE quotes RENAME CONSTRAINT %I TO %I', 
                    constraint_name, 
                    replace(constraint_name, 'engagement', 'release'));
            END IF;
        END $$;
    """)
    
    # Rename the table back first
    op.rename_table('engagements', 'releases')
    
    # Update foreign key constraint back in employee_engagements to reference releases table
    op.execute("""
        DO $$
        DECLARE
            constraint_name text;
        BEGIN
            -- Find and drop the engagement foreign key constraint
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = 'employee_engagements'::regclass
            AND contype = 'f'
            AND conname LIKE '%engagement%';
            
            IF constraint_name IS NOT NULL THEN
                -- Drop engagement constraint
                EXECUTE format('ALTER TABLE employee_engagements DROP CONSTRAINT %I', constraint_name);
                -- Create new constraint pointing to releases
                EXECUTE format('ALTER TABLE employee_engagements ADD CONSTRAINT %I FOREIGN KEY (engagement_id) REFERENCES releases(id)',
                    replace(constraint_name, 'engagement', 'release'));
            END IF;
        END $$;
    """)
    
    # Rename employee_engagements table back to employee_releases
    op.rename_column('employee_engagements', 'engagement_id', 'release_id')
    op.rename_table('employee_engagements', 'employee_releases')
    
    # Rename foreign key columns back
    op.rename_column('estimates', 'engagement_id', 'release_id')
    op.rename_column('quotes', 'engagement_id', 'release_id')
    
    # Rename the enum type back
    op.execute("""
        DO $$ 
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'engagementstatus') THEN
                ALTER TYPE engagementstatus RENAME TO releasestatus;
            END IF;
        END $$;
    """)


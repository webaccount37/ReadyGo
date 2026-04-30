"""Update accounts and contacts schema

Revision ID: update_accounts_contacts
Revises: f2c72dfb1ee9
Create Date: 2025-01-XX

This migration:
1. Removes AccountStatus enum and status column from accounts
2. Creates AccountType enum and adds type column to accounts (required)
3. Makes street_address, city, region, billing_term_id nullable in accounts
4. Adds created_at column to accounts with default
5. Adds is_billing column to contacts table
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = 'update_accounts_contacts'
down_revision = 'merge_accounts_heads'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Create AccountType enum (only if it doesn't exist)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'accounttype') THEN
                CREATE TYPE accounttype AS ENUM ('vendor', 'customer', 'partner', 'network');
            END IF;
        END $$;
    """)
    
    # Step 2: Add type column to accounts (temporarily nullable)
    # Check if column already exists
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'accounts' AND column_name = 'type'
            ) THEN
                ALTER TABLE accounts ADD COLUMN type accounttype;
            END IF;
        END $$;
    """)
    
    # Step 3: Set default type for existing accounts (customer)
    op.execute("UPDATE accounts SET type = 'customer' WHERE type IS NULL")
    
    # Step 4: Make type column NOT NULL
    op.alter_column('accounts', 'type', nullable=False, type_=postgresql.ENUM('vendor', 'customer', 'partner', 'network', name='accounttype', create_type=False))
    
    # Step 5: Create index on type column (if it doesn't exist)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_accounts_type ON accounts(type);
    """)
    
    # Step 6: Make street_address, city, region nullable (if they're not already)
    op.execute("""
        DO $$
        BEGIN
            -- Check and alter street_address
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'accounts' AND column_name = 'street_address' AND is_nullable = 'NO'
            ) THEN
                ALTER TABLE accounts ALTER COLUMN street_address DROP NOT NULL;
            END IF;
            
            -- Check and alter city
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'accounts' AND column_name = 'city' AND is_nullable = 'NO'
            ) THEN
                ALTER TABLE accounts ALTER COLUMN city DROP NOT NULL;
            END IF;
            
            -- Check and alter region
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'accounts' AND column_name = 'region' AND is_nullable = 'NO'
            ) THEN
                ALTER TABLE accounts ALTER COLUMN region DROP NOT NULL;
            END IF;
        END $$;
    """)
    
    # Step 7: Make billing_term_id nullable (if it's not already)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'accounts' AND column_name = 'billing_term_id' AND is_nullable = 'NO'
            ) THEN
                ALTER TABLE accounts ALTER COLUMN billing_term_id DROP NOT NULL;
            END IF;
        END $$;
    """)
    
    # Step 8: Add created_at column with default (if it doesn't exist)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'accounts' AND column_name = 'created_at'
            ) THEN
                ALTER TABLE accounts ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();
            END IF;
        END $$;
    """)
    
    # Step 9: Remove status column from accounts (if it exists)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'accounts' AND column_name = 'status'
            ) THEN
                ALTER TABLE accounts DROP COLUMN status;
            END IF;
        END $$;
    """)
    
    # Step 10: Drop AccountStatus enum (if it exists and no longer used)
    op.execute("""
        DO $$
        BEGIN
            -- Only drop if no columns are using it
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'accountstatus')
            AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE udt_name = 'accountstatus'
            ) THEN
                DROP TYPE accountstatus;
            END IF;
        END $$;
    """)
    
    # Step 11: Add is_billing column to contacts (if it doesn't exist)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'contacts' AND column_name = 'is_billing'
            ) THEN
                ALTER TABLE contacts ADD COLUMN is_billing VARCHAR(10) NOT NULL DEFAULT 'false';
            END IF;
        END $$;
    """)
    
    # Step 12: Create index on is_billing for performance (if it doesn't exist)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_contacts_is_billing ON contacts(is_billing);
    """)


def downgrade() -> None:
    # Step 1: Remove is_billing column from contacts
    op.drop_index(op.f('ix_contacts_is_billing'), table_name='contacts')
    op.drop_column('contacts', 'is_billing')
    
    # Step 2: Recreate AccountStatus enum
    op.execute("""
        CREATE TYPE accountstatus AS ENUM ('active', 'inactive', 'prospect')
    """)
    
    # Step 3: Add status column back to accounts
    op.add_column('accounts', sa.Column('status', postgresql.ENUM('active', 'inactive', 'prospect', name='accountstatus', create_type=False), nullable=False, server_default='active'))
    
    # Step 4: Remove created_at column
    op.drop_column('accounts', 'created_at')
    
    # Step 5: Make billing_term_id NOT NULL (set default first)
    op.execute("UPDATE accounts SET billing_term_id = (SELECT id FROM billing_terms LIMIT 1) WHERE billing_term_id IS NULL")
    op.alter_column('accounts', 'billing_term_id', nullable=False)
    
    # Step 6: Make street_address, city, region NOT NULL (set defaults first)
    op.execute("UPDATE accounts SET street_address = 'Address Required' WHERE street_address IS NULL")
    op.execute("UPDATE accounts SET city = 'City Required' WHERE city IS NULL")
    op.execute("UPDATE accounts SET region = 'Region Required' WHERE region IS NULL")
    op.alter_column('accounts', 'street_address', nullable=False)
    op.alter_column('accounts', 'city', nullable=False)
    op.alter_column('accounts', 'region', nullable=False)
    
    # Step 7: Remove type column and index
    op.drop_index(op.f('ix_accounts_type'), table_name='accounts')
    op.drop_column('accounts', 'type')
    
    # Step 8: Drop AccountType enum
    op.execute("DROP TYPE IF EXISTS accounttype")

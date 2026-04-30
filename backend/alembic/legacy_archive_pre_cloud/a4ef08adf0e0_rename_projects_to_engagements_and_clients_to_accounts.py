"""Rename Projects to Engagements and Clients to Accounts

Revision ID: a4ef08adf0e0
Revises: merge_billing_terms_role_rates
Create Date: 2025-01-XX

This migration:
1. Updates projects table schema (add/remove columns, change column types)
2. Renames projects table to engagements
3. Renames clients table to accounts
4. Updates all foreign key columns (project_id -> engagement_id, client_id -> account_id)
5. Updates all indexes and constraints
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'a4ef08adf0e0'
down_revision = 'merge_billing_terms_role_rates'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Update projects table schema first (before renaming)
    # Remove columns: budget, estimated_hours, actual_hours, account_region, financial_terms
    op.drop_column('projects', 'budget')
    op.drop_column('projects', 'estimated_hours')
    op.drop_column('projects', 'actual_hours')
    op.drop_column('projects', 'account_region')
    op.drop_column('projects', 'financial_terms')
    
    # Add new columns: delivery_center_id, engagement_owner_id, invoice_customer, billable_expenses
    op.add_column('projects', sa.Column('delivery_center_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('projects', sa.Column('engagement_owner_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('projects', sa.Column('invoice_customer', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('projects', sa.Column('billable_expenses', sa.Boolean(), nullable=False, server_default='true'))
    
    # Change financial_terms to billing_term_id (already exists from previous migration, but ensure it's correct)
    # Note: billing_term_id should already exist, but we'll ensure it's set correctly
    
    # Update any NULL start_date and end_date values before making them NOT NULL
    # Set start_date to CURRENT_DATE if NULL
    op.execute("""
        UPDATE projects 
        SET start_date = CURRENT_DATE 
        WHERE start_date IS NULL
    """)
    
    # Set end_date to start_date + 30 days if NULL, or CURRENT_DATE + 30 if start_date is also NULL
    op.execute("""
        UPDATE projects 
        SET end_date = COALESCE(start_date, CURRENT_DATE) + INTERVAL '30 days'
        WHERE end_date IS NULL
    """)
    
    # Now make start_date and end_date NOT NULL
    op.alter_column('projects', 'start_date', nullable=False)
    op.alter_column('projects', 'end_date', nullable=False)
    
    # Add foreign keys for new columns
    op.create_foreign_key(
        'fk_projects_delivery_center_id',
        'projects', 'delivery_centers',
        ['delivery_center_id'], ['id']
    )
    op.create_foreign_key(
        'fk_projects_engagement_owner_id',
        'projects', 'employees',
        ['engagement_owner_id'], ['id']
    )
    op.create_index(op.f('ix_projects_delivery_center_id'), 'projects', ['delivery_center_id'], unique=False)
    op.create_index(op.f('ix_projects_engagement_owner_id'), 'projects', ['engagement_owner_id'], unique=False)
    
    # Set default delivery_center_id for existing projects (use first delivery center)
    op.execute("""
        UPDATE projects 
        SET delivery_center_id = (SELECT id FROM delivery_centers LIMIT 1)
        WHERE delivery_center_id IS NULL
    """)
    
    # Make delivery_center_id NOT NULL after setting defaults
    op.alter_column('projects', 'delivery_center_id', nullable=False)
    
    # Step 2: Rename clients table to accounts
    op.rename_table('clients', 'accounts')
    
    # Rename the enum type from clientstatus to accountstatus
    op.execute("ALTER TYPE clientstatus RENAME TO accountstatus")
    
    # Rename indexes on accounts table
    op.execute("ALTER INDEX IF EXISTS ix_clients_id RENAME TO ix_accounts_id")
    op.execute("ALTER INDEX IF EXISTS ix_clients_company_name RENAME TO ix_accounts_company_name")
    op.execute("ALTER INDEX IF EXISTS ix_clients_billing_term_id RENAME TO ix_accounts_billing_term_id")
    
    # Rename foreign key constraints
    op.execute("ALTER TABLE accounts RENAME CONSTRAINT fk_clients_billing_term_id TO fk_accounts_billing_term_id")
    
    # Step 3: Rename projects table to engagements
    op.rename_table('projects', 'engagements')
    
    # Rename indexes on engagements table
    op.execute("ALTER INDEX IF EXISTS ix_projects_id RENAME TO ix_engagements_id")
    op.execute("ALTER INDEX IF EXISTS ix_projects_name RENAME TO ix_engagements_name")
    op.execute("ALTER INDEX IF EXISTS ix_projects_client_id RENAME TO ix_engagements_account_id")
    op.execute("ALTER INDEX IF EXISTS ix_projects_billing_term_id RENAME TO ix_engagements_billing_term_id")
    op.execute("ALTER INDEX IF EXISTS ix_projects_delivery_center_id RENAME TO ix_engagements_delivery_center_id")
    op.execute("ALTER INDEX IF EXISTS ix_projects_engagement_owner_id RENAME TO ix_engagements_engagement_owner_id")
    
    # Rename foreign key constraints on engagements (check if they exist first)
    # Use a DO block to safely rename constraints that may have different names
    op.execute("""
        DO $$
        DECLARE
            constraint_name text;
        BEGIN
            -- Rename parent_project_id constraint
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = 'engagements'::regclass
            AND contype = 'f'
            AND (conname LIKE '%parent%project%' OR conname LIKE '%parent_project%')
            LIMIT 1;
            IF constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE engagements RENAME CONSTRAINT %I TO engagements_parent_engagement_id_fkey', constraint_name);
            END IF;
            
            -- Rename client_id constraint
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = 'engagements'::regclass
            AND contype = 'f'
            AND (conname LIKE '%client%' OR conname LIKE '%client_id%')
            AND conname NOT LIKE '%parent%'
            LIMIT 1;
            IF constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE engagements RENAME CONSTRAINT %I TO engagements_account_id_fkey', constraint_name);
            END IF;
            
            -- Rename billing_term_id constraint
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = 'engagements'::regclass
            AND contype = 'f'
            AND (conname LIKE '%billing_term%' OR conname LIKE '%billing%term%')
            LIMIT 1;
            IF constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE engagements RENAME CONSTRAINT %I TO engagements_billing_term_id_fkey', constraint_name);
            END IF;
            
            -- Rename delivery_center_id constraint
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = 'engagements'::regclass
            AND contype = 'f'
            AND (conname LIKE '%delivery_center%' OR conname LIKE '%delivery%center%')
            LIMIT 1;
            IF constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE engagements RENAME CONSTRAINT %I TO fk_engagements_delivery_center_id', constraint_name);
            END IF;
            
            -- Rename engagement_owner_id constraint
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = 'engagements'::regclass
            AND contype = 'f'
            AND (conname LIKE '%engagement_owner%' OR conname LIKE '%engagement%owner%')
            LIMIT 1;
            IF constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE engagements RENAME CONSTRAINT %I TO fk_engagements_engagement_owner_id', constraint_name);
            END IF;
        END $$;
    """)
    
    # Step 4: Rename client_id column to account_id in engagements table
    op.alter_column('engagements', 'client_id', new_column_name='account_id')
    
    # Step 5: Rename parent_project_id to parent_engagement_id
    op.alter_column('engagements', 'parent_project_id', new_column_name='parent_engagement_id')
    
    # Rename project_type to engagement_type
    op.alter_column('engagements', 'project_type', new_column_name='engagement_type')
    
    # Rename enum types from projectstatus/projecttype to engagementstatus/engagementtype
    op.execute("ALTER TYPE projectstatus RENAME TO engagementstatus")
    op.execute("ALTER TYPE projecttype RENAME TO engagementtype")
    
    # Update the self-referential foreign key
    op.drop_constraint('engagements_parent_engagement_id_fkey', 'engagements', type_='foreignkey')
    op.create_foreign_key(
        'fk_engagements_parent_engagement_id',
        'engagements', 'engagements',
        ['parent_engagement_id'], ['id']
    )
    
    # Step 6: Update employee_projects table
    op.rename_table('employee_projects', 'employee_engagements')
    op.alter_column('employee_engagements', 'project_id', new_column_name='engagement_id')
    op.drop_constraint('employee_projects_project_id_fkey', 'employee_engagements', type_='foreignkey')
    op.create_foreign_key(
        'fk_employee_engagements_engagement_id',
        'employee_engagements', 'engagements',
        ['engagement_id'], ['id']
    )
    
    # Step 7: Update releases table
    op.alter_column('releases', 'project_id', new_column_name='engagement_id')
    op.drop_constraint('releases_project_id_fkey', 'releases', type_='foreignkey')
    op.create_foreign_key(
        'fk_releases_engagement_id',
        'releases', 'engagements',
        ['engagement_id'], ['id']
    )
    op.execute("ALTER INDEX IF EXISTS ix_releases_project_id RENAME TO ix_releases_engagement_id")
    
    # Step 8: Update project_roles association table
    op.rename_table('project_roles', 'engagement_roles')
    op.alter_column('engagement_roles', 'project_id', new_column_name='engagement_id')
    op.drop_constraint('project_roles_project_id_fkey', 'engagement_roles', type_='foreignkey')
    op.create_foreign_key(
        'fk_engagement_roles_engagement_id',
        'engagement_roles', 'engagements',
        ['engagement_id'], ['id']
    )
    
    # Step 9: Update contacts table
    op.alter_column('contacts', 'client_id', new_column_name='account_id')
    op.drop_constraint('contacts_client_id_fkey', 'contacts', type_='foreignkey')
    op.create_foreign_key(
        'fk_contacts_account_id',
        'contacts', 'accounts',
        ['account_id'], ['id']
    )
    op.execute("ALTER INDEX IF EXISTS ix_contacts_client_id RENAME TO ix_contacts_account_id")


def downgrade() -> None:
    # Reverse all changes in opposite order
    
    # Step 9: Revert contacts table
    op.execute("ALTER INDEX IF EXISTS ix_contacts_account_id RENAME TO ix_contacts_client_id")
    op.drop_constraint('fk_contacts_account_id', 'contacts', type_='foreignkey')
    op.create_foreign_key(
        'contacts_client_id_fkey',
        'contacts', 'accounts',
        ['account_id'], ['id']
    )
    op.alter_column('contacts', 'account_id', new_column_name='client_id')
    
    # Step 8: Revert engagement_roles table
    op.drop_constraint('fk_engagement_roles_engagement_id', 'engagement_roles', type_='foreignkey')
    op.create_foreign_key(
        'project_roles_project_id_fkey',
        'engagement_roles', 'engagements',
        ['engagement_id'], ['id']
    )
    op.alter_column('engagement_roles', 'engagement_id', new_column_name='project_id')
    op.rename_table('engagement_roles', 'project_roles')
    
    # Step 7: Revert releases table
    op.execute("ALTER INDEX IF EXISTS ix_releases_engagement_id RENAME TO ix_releases_project_id")
    op.drop_constraint('fk_releases_engagement_id', 'releases', type_='foreignkey')
    op.create_foreign_key(
        'releases_project_id_fkey',
        'releases', 'engagements',
        ['engagement_id'], ['id']
    )
    op.alter_column('releases', 'engagement_id', new_column_name='project_id')
    
    # Step 6: Revert employee_engagements table
    op.drop_constraint('fk_employee_engagements_engagement_id', 'employee_engagements', type_='foreignkey')
    op.create_foreign_key(
        'employee_projects_project_id_fkey',
        'employee_engagements', 'engagements',
        ['engagement_id'], ['id']
    )
    op.alter_column('employee_engagements', 'engagement_id', new_column_name='project_id')
    op.rename_table('employee_engagements', 'employee_projects')
    
    # Step 5: Revert parent_engagement_id and engagement_type
    op.drop_constraint('fk_engagements_parent_engagement_id', 'engagements', type_='foreignkey')
    op.create_foreign_key(
        'engagements_parent_engagement_id_fkey',
        'engagements', 'engagements',
        ['parent_engagement_id'], ['id']
    )
    # Revert enum types from engagementstatus/engagementtype to projectstatus/projecttype
    op.execute("ALTER TYPE engagementstatus RENAME TO projectstatus")
    op.execute("ALTER TYPE engagementtype RENAME TO projecttype")
    
    op.alter_column('engagements', 'engagement_type', new_column_name='project_type')
    op.alter_column('engagements', 'parent_engagement_id', new_column_name='parent_project_id')
    
    # Step 4: Revert account_id to client_id
    op.alter_column('engagements', 'account_id', new_column_name='client_id')
    
    # Step 3: Revert engagements table to projects
    op.execute("ALTER TABLE engagements RENAME CONSTRAINT fk_engagements_engagement_owner_id TO fk_projects_engagement_owner_id")
    op.execute("ALTER TABLE engagements RENAME CONSTRAINT fk_engagements_delivery_center_id TO fk_projects_delivery_center_id")
    op.execute("ALTER TABLE engagements RENAME CONSTRAINT engagements_billing_term_id_fkey TO projects_billing_term_id_fkey")
    op.execute("ALTER TABLE engagements RENAME CONSTRAINT engagements_account_id_fkey TO projects_client_id_fkey")
    op.execute("ALTER TABLE engagements RENAME CONSTRAINT engagements_parent_engagement_id_fkey TO projects_parent_project_id_fkey")
    
    op.execute("ALTER INDEX IF EXISTS ix_engagements_engagement_owner_id RENAME TO ix_projects_engagement_owner_id")
    op.execute("ALTER INDEX IF EXISTS ix_engagements_delivery_center_id RENAME TO ix_projects_delivery_center_id")
    op.execute("ALTER INDEX IF EXISTS ix_engagements_billing_term_id RENAME TO ix_projects_billing_term_id")
    op.execute("ALTER INDEX IF EXISTS ix_engagements_account_id RENAME TO ix_projects_client_id")
    op.execute("ALTER INDEX IF EXISTS ix_engagements_name RENAME TO ix_projects_name")
    op.execute("ALTER INDEX IF EXISTS ix_engagements_id RENAME TO ix_projects_id")
    
    op.rename_table('engagements', 'projects')
    
    # Step 2: Revert accounts table to clients
    op.execute("ALTER TABLE accounts RENAME CONSTRAINT fk_accounts_billing_term_id TO fk_clients_billing_term_id")
    
    op.execute("ALTER INDEX IF EXISTS ix_accounts_billing_term_id RENAME TO ix_clients_billing_term_id")
    op.execute("ALTER INDEX IF EXISTS ix_accounts_company_name RENAME TO ix_clients_company_name")
    op.execute("ALTER INDEX IF EXISTS ix_accounts_id RENAME TO ix_clients_id")
    
    op.rename_table('accounts', 'clients')
    
    # Revert the enum type from accountstatus to clientstatus
    op.execute("ALTER TYPE accountstatus RENAME TO clientstatus")
    
    # Step 1: Revert schema changes to projects table
    op.drop_index(op.f('ix_projects_engagement_owner_id'), table_name='projects')
    op.drop_index(op.f('ix_projects_delivery_center_id'), table_name='projects')
    op.drop_constraint('fk_projects_engagement_owner_id', 'projects', type_='foreignkey')
    op.drop_constraint('fk_projects_delivery_center_id', 'projects', type_='foreignkey')
    
    op.alter_column('projects', 'start_date', nullable=True)
    op.alter_column('projects', 'end_date', nullable=True)
    
    op.drop_column('projects', 'billable_expenses')
    op.drop_column('projects', 'invoice_customer')
    op.drop_column('projects', 'engagement_owner_id')
    op.drop_column('projects', 'delivery_center_id')
    
    op.add_column('projects', sa.Column('financial_terms', sa.String(length=500), nullable=True))
    op.add_column('projects', sa.Column('account_region', sa.String(length=100), nullable=True))
    op.add_column('projects', sa.Column('actual_hours', sa.Float(), nullable=True))
    op.add_column('projects', sa.Column('estimated_hours', sa.Float(), nullable=True))
    op.add_column('projects', sa.Column('budget', sa.Numeric(precision=15, scale=2), nullable=True))


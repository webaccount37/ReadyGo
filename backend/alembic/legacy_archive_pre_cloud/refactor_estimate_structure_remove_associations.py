"""Refactor estimate structure and remove association tables

Revision ID: refactor_estimate_structure
Revises: 0bfd96fd8268
Create Date: 2025-01-XX XX:XX:XX.000000

This migration implements the following changes:
1. ROLES: Remove role_internal_cost_rate, role_external_rate, default_currency columns
2. ESTIMATE_LINE_ITEMS: Remove delivery_center_id and role_id, add role_rates_id
3. ESTIMATES: Add active_version boolean column
4. ROLE_RATES: Rename currency to default_currency
5. EMPLOYEES: Remove role_id column
6. Delete tables: employee_engagements, employee_releases, engagement_roles, release_roles
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'refactor_estimate_structure'
down_revision = 'remove_phase_fields'  # Current head migration
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Add active_version column to quotes (estimates) table
    op.add_column(
        'quotes',
        sa.Column('active_version', sa.Boolean(), nullable=False, server_default='false')
    )
    op.create_index('ix_quotes_active_version', 'quotes', ['active_version'])
    
    # Step 2: Rename currency to default_currency in role_rates table
    op.alter_column('role_rates', 'currency', new_column_name='default_currency')
    
    # Step 3: Add role_rates_id to quote_line_items (estimate_line_items) table
    op.add_column(
        'quote_line_items',
        sa.Column('role_rates_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_index('ix_quote_line_items_role_rates_id', 'quote_line_items', ['role_rates_id'])
    
    # Step 4: Migrate data from role_id + delivery_center_id to role_rates_id
    # First, create role_rates records if they don't exist for existing line items
    op.execute(sa.text("""
        INSERT INTO role_rates (id, role_id, delivery_center_id, default_currency, internal_cost_rate, external_rate)
        SELECT 
            gen_random_uuid() as id,
            qli.role_id,
            qli.delivery_center_id,
            COALESCE(qli.currency, 'USD') as default_currency,
            0.0 as internal_cost_rate,
            0.0 as external_rate
        FROM quote_line_items qli
        WHERE qli.role_id IS NOT NULL 
          AND qli.delivery_center_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM role_rates rr
              WHERE rr.role_id = qli.role_id
                AND rr.delivery_center_id = qli.delivery_center_id
                AND rr.default_currency = COALESCE(qli.currency, 'USD')
          )
        GROUP BY qli.role_id, qli.delivery_center_id, COALESCE(qli.currency, 'USD')
    """))
    
    # Now update quote_line_items to set role_rates_id
    op.execute(sa.text("""
        UPDATE quote_line_items qli
        SET role_rates_id = rr.id
        FROM role_rates rr
        WHERE qli.role_id = rr.role_id
          AND qli.delivery_center_id = rr.delivery_center_id
          AND rr.default_currency = COALESCE(qli.currency, 'USD')
          AND qli.role_rates_id IS NULL
    """))
    
    # Step 5: Set active_version = true for one quote per release (the most recent one by id)
    # Since there's no created_at column, we'll use the highest id as a proxy for "most recent"
    op.execute(sa.text("""
        UPDATE quotes q1
        SET active_version = true
        WHERE q1.id = (
            SELECT q2.id
            FROM quotes q2
            WHERE q2.release_id = q1.release_id
            ORDER BY q2.id DESC
            LIMIT 1
        )
    """))
    
    # Step 6: Make role_rates_id NOT NULL now that data is migrated
    op.alter_column('quote_line_items', 'role_rates_id', nullable=False)
    
    # Step 7: Add foreign key constraint for role_rates_id
    op.create_foreign_key(
        'fk_quote_line_items_role_rates_id',
        'quote_line_items',
        'role_rates',
        ['role_rates_id'],
        ['id'],
        ondelete='RESTRICT'
    )
    
    # Step 8: Remove old columns from quote_line_items (role_id, delivery_center_id)
    # Drop foreign key constraints - need to find the actual constraint names
    op.execute(sa.text("""
        DO $$
        DECLARE
            r record;
        BEGIN
            FOR r IN (
                SELECT conname
                FROM pg_constraint
                WHERE conrelid = 'quote_line_items'::regclass
                  AND contype = 'f'
                  AND (conname LIKE '%role_id%' OR conname LIKE '%delivery_center_id%')
            ) LOOP
                EXECUTE 'ALTER TABLE quote_line_items DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
            END LOOP;
        END $$;
    """))
    op.drop_index('ix_quote_line_items_role_id', table_name='quote_line_items', if_exists=True)
    op.drop_index('ix_quote_line_items_delivery_center_id', table_name='quote_line_items', if_exists=True)
    op.drop_column('quote_line_items', 'role_id')
    op.drop_column('quote_line_items', 'delivery_center_id')
    
    # Step 9: Remove role_id from employees table (if it exists)
    op.execute(sa.text("""
        DO $$
        DECLARE
            r record;
        BEGIN
            -- Drop foreign key constraint if it exists
            FOR r IN (
                SELECT conname
                FROM pg_constraint
                WHERE conrelid = 'employees'::regclass
                  AND contype = 'f'
                  AND conname LIKE '%role_id%'
            ) LOOP
                EXECUTE 'ALTER TABLE employees DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
            END LOOP;
        END $$;
    """))
    op.drop_index('ix_employees_role_id', table_name='employees', if_exists=True)
    op.drop_column('employees', 'role_id')
    
    # Step 10: Remove columns from roles table
    op.drop_column('roles', 'role_internal_cost_rate')
    op.drop_column('roles', 'role_external_rate')
    op.drop_column('roles', 'default_currency')
    
    # Step 11: Add foreign key constraint from roles to role_rates (ensure role has at least one rate)
    # Note: This is a soft constraint - we'll enforce it at the application level
    # But we can add a check constraint if needed
    
    # Step 12: Delete association tables
    op.drop_table('employee_releases')
    op.drop_table('employee_engagements')
    op.drop_table('engagement_roles')
    op.drop_table('release_roles')


def downgrade() -> None:
    # Step 12: Recreate association tables
    op.create_table(
        'release_roles',
        sa.Column('release_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('role_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['release_id'], ['releases.id']),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id']),
        sa.PrimaryKeyConstraint('release_id', 'role_id')
    )
    
    op.create_table(
        'engagement_roles',
        sa.Column('engagement_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('role_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['engagement_id'], ['engagements.id']),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id']),
        sa.PrimaryKeyConstraint('engagement_id', 'role_id')
    )
    
    op.create_table(
        'employee_engagements',
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('engagement_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('role_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('project_rate', sa.Float(), nullable=False),
        sa.Column('delivery_center_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id']),
        sa.ForeignKeyConstraint(['engagement_id'], ['engagements.id']),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id']),
        sa.ForeignKeyConstraint(['delivery_center_id'], ['delivery_centers.id']),
        sa.PrimaryKeyConstraint('employee_id', 'engagement_id')
    )
    
    op.create_table(
        'employee_releases',
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('release_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('role_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('project_rate', sa.Float(), nullable=False),
        sa.Column('delivery_center_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id']),
        sa.ForeignKeyConstraint(['release_id'], ['releases.id']),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id']),
        sa.ForeignKeyConstraint(['delivery_center_id'], ['delivery_centers.id']),
        sa.PrimaryKeyConstraint('employee_id', 'release_id')
    )
    
    # Step 11: Re-add columns to roles table
    op.add_column('roles', sa.Column('default_currency', sa.String(length=3), nullable=True))
    op.add_column('roles', sa.Column('role_external_rate', sa.Float(), nullable=True))
    op.add_column('roles', sa.Column('role_internal_cost_rate', sa.Float(), nullable=True))
    
    # Step 10: Re-add role_id to employees table
    op.add_column('employees', sa.Column('role_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index('ix_employees_role_id', 'employees', ['role_id'])
    op.create_foreign_key('fk_employees_role_id', 'employees', 'roles', ['role_id'], ['id'])
    
    # Step 9: Re-add columns to quote_line_items
    op.add_column('quote_line_items', sa.Column('delivery_center_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('quote_line_items', sa.Column('role_id', postgresql.UUID(as_uuid=True), nullable=True))
    
    # Migrate data back from role_rates_id to role_id + delivery_center_id
    op.execute(sa.text("""
        UPDATE quote_line_items qli
        SET 
            role_id = rr.role_id,
            delivery_center_id = rr.delivery_center_id
        FROM role_rates rr
        WHERE qli.role_rates_id = rr.id
    """))
    
    op.alter_column('quote_line_items', 'role_id', nullable=False)
    op.alter_column('quote_line_items', 'delivery_center_id', nullable=False)
    
    op.create_index('ix_quote_line_items_delivery_center_id', 'quote_line_items', ['delivery_center_id'])
    op.create_index('ix_quote_line_items_role_id', 'quote_line_items', ['role_id'])
    op.create_foreign_key('fk_quote_line_items_delivery_center_id', 'quote_line_items', 'delivery_centers', ['delivery_center_id'], ['id'])
    op.create_foreign_key('fk_quote_line_items_role_id', 'quote_line_items', 'roles', ['role_id'], ['id'])
    
    # Step 8: Remove role_rates_id from quote_line_items
    op.drop_constraint('fk_quote_line_items_role_rates_id', 'quote_line_items', type_='foreignkey')
    op.drop_index('ix_quote_line_items_role_rates_id', table_name='quote_line_items')
    op.drop_column('quote_line_items', 'role_rates_id')
    
    # Step 7: Rename default_currency back to currency in role_rates
    op.alter_column('role_rates', 'default_currency', new_column_name='currency')
    
    # Step 6: Remove active_version from quotes
    op.drop_index('ix_quotes_active_version', table_name='quotes')
    op.drop_column('quotes', 'active_version')


"""Rename quote tables and columns to estimates

Revision ID: rename_quotes_to_estimates
Revises: refactor_estimate_structure
Create Date: 2025-01-XX XX:XX:XX.000000

This migration renames all quote-related tables and columns to estimate:
- quotes -> estimates
- quote_line_items -> estimate_line_items
- quote_phases -> estimate_phases
- quote_weekly_hours -> estimate_weekly_hours
- quote_id -> estimate_id
- quote_line_item_id -> estimate_line_item_id
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'rename_quotes_to_estimates'
down_revision = 'refactor_estimate_structure'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Rename tables
    op.rename_table('quotes', 'estimates')
    op.rename_table('quote_line_items', 'estimate_line_items')
    op.rename_table('quote_phases', 'estimate_phases')
    op.rename_table('quote_weekly_hours', 'estimate_weekly_hours')
    
    # Step 2: Rename columns in estimate_phases
    op.alter_column('estimate_phases', 'quote_id', new_column_name='estimate_id')
    
    # Step 3: Rename columns in estimate_line_items
    op.alter_column('estimate_line_items', 'quote_id', new_column_name='estimate_id')
    
    # Step 4: Rename columns in estimate_weekly_hours
    op.alter_column('estimate_weekly_hours', 'quote_line_item_id', new_column_name='estimate_line_item_id')
    
    # Step 5: Update foreign key constraints
    # Drop old foreign keys
    op.drop_constraint('quote_phases_quote_id_fkey', 'estimate_phases', type_='foreignkey')
    op.drop_constraint('quote_line_items_quote_id_fkey', 'estimate_line_items', type_='foreignkey')
    op.drop_constraint('quote_weekly_hours_quote_line_item_id_fkey', 'estimate_weekly_hours', type_='foreignkey')
    
    # Create new foreign keys with correct names
    op.create_foreign_key(
        'estimate_phases_estimate_id_fkey',
        'estimate_phases',
        'estimates',
        ['estimate_id'],
        ['id'],
        ondelete='CASCADE'
    )
    op.create_foreign_key(
        'estimate_line_items_estimate_id_fkey',
        'estimate_line_items',
        'estimates',
        ['estimate_id'],
        ['id'],
        ondelete='CASCADE'
    )
    op.create_foreign_key(
        'estimate_weekly_hours_estimate_line_item_id_fkey',
        'estimate_weekly_hours',
        'estimate_line_items',
        ['estimate_line_item_id'],
        ['id'],
        ondelete='CASCADE'
    )
    
    # Step 6: Update indexes (one at a time for asyncpg compatibility)
    index_renames = [
        ('ix_quotes_id', 'ix_estimates_id'),
        ('ix_quotes_release_id', 'ix_estimates_release_id'),
        ('ix_quotes_name', 'ix_estimates_name'),
        ('ix_quotes_created_by', 'ix_estimates_created_by'),
        ('ix_quotes_active_version', 'ix_estimates_active_version'),
        ('ix_quote_line_items_id', 'ix_estimate_line_items_id'),
        ('ix_quote_line_items_quote_id', 'ix_estimate_line_items_estimate_id'),
        ('ix_quote_line_items_role_rates_id', 'ix_estimate_line_items_role_rates_id'),
        ('ix_quote_line_items_employee_id', 'ix_estimate_line_items_employee_id'),
        ('ix_quote_weekly_hours_id', 'ix_estimate_weekly_hours_id'),
        ('ix_quote_weekly_hours_quote_line_item_id', 'ix_estimate_weekly_hours_estimate_line_item_id'),
        ('ix_quote_weekly_hours_week_start_date', 'ix_estimate_weekly_hours_week_start_date'),
    ]
    
    for old_name, new_name in index_renames:
        op.execute(sa.text(f"ALTER INDEX IF EXISTS {old_name} RENAME TO {new_name}"))
    
    # Step 7: Update unique constraint name
    op.execute(sa.text("ALTER TABLE estimate_weekly_hours RENAME CONSTRAINT uq_quote_line_item_week TO uq_estimate_line_item_week"))
    
    # Step 8: Update primary key constraint names
    op.execute(sa.text("ALTER TABLE estimates RENAME CONSTRAINT quotes_pkey TO estimates_pkey"))
    op.execute(sa.text("ALTER TABLE estimate_line_items RENAME CONSTRAINT quote_line_items_pkey TO estimate_line_items_pkey"))
    op.execute(sa.text("ALTER TABLE estimate_phases RENAME CONSTRAINT quote_phases_pkey TO estimate_phases_pkey"))
    op.execute(sa.text("ALTER TABLE estimate_weekly_hours RENAME CONSTRAINT quote_weekly_hours_pkey TO estimate_weekly_hours_pkey"))


def downgrade() -> None:
    # Reverse all changes
    # Revert primary key constraint names
    op.execute(sa.text("ALTER TABLE estimate_weekly_hours RENAME CONSTRAINT estimate_weekly_hours_pkey TO quote_weekly_hours_pkey"))
    op.execute(sa.text("ALTER TABLE estimate_phases RENAME CONSTRAINT estimate_phases_pkey TO quote_phases_pkey"))
    op.execute(sa.text("ALTER TABLE estimate_line_items RENAME CONSTRAINT estimate_line_items_pkey TO quote_line_items_pkey"))
    op.execute(sa.text("ALTER TABLE estimates RENAME CONSTRAINT estimates_pkey TO quotes_pkey"))
    
    op.execute(sa.text("ALTER TABLE estimate_weekly_hours RENAME CONSTRAINT uq_estimate_line_item_week TO uq_quote_line_item_week"))
    
    # Revert indexes (one at a time for asyncpg compatibility)
    index_renames_reverse = [
        ('ix_estimate_weekly_hours_week_start_date', 'ix_quote_weekly_hours_week_start_date'),
        ('ix_estimate_weekly_hours_estimate_line_item_id', 'ix_quote_weekly_hours_quote_line_item_id'),
        ('ix_estimate_weekly_hours_id', 'ix_quote_weekly_hours_id'),
        ('ix_estimate_line_items_employee_id', 'ix_quote_line_items_employee_id'),
        ('ix_estimate_line_items_role_rates_id', 'ix_quote_line_items_role_rates_id'),
        ('ix_estimate_line_items_estimate_id', 'ix_quote_line_items_quote_id'),
        ('ix_estimate_line_items_id', 'ix_quote_line_items_id'),
        ('ix_estimates_active_version', 'ix_quotes_active_version'),
        ('ix_estimates_created_by', 'ix_quotes_created_by'),
        ('ix_estimates_name', 'ix_quotes_name'),
        ('ix_estimates_release_id', 'ix_quotes_release_id'),
        ('ix_estimates_id', 'ix_quotes_id'),
    ]
    
    for old_name, new_name in index_renames_reverse:
        op.execute(sa.text(f"ALTER INDEX IF EXISTS {old_name} RENAME TO {new_name}"))
    
    # Drop new foreign keys
    op.drop_constraint('estimate_weekly_hours_estimate_line_item_id_fkey', 'estimate_weekly_hours', type_='foreignkey')
    op.drop_constraint('estimate_line_items_estimate_id_fkey', 'estimate_line_items', type_='foreignkey')
    op.drop_constraint('estimate_phases_estimate_id_fkey', 'estimate_phases', type_='foreignkey')
    
    # Recreate old foreign keys
    op.create_foreign_key(
        'quote_weekly_hours_quote_line_item_id_fkey',
        'estimate_weekly_hours',
        'estimate_line_items',
        ['estimate_line_item_id'],
        ['id'],
        ondelete='CASCADE'
    )
    op.create_foreign_key(
        'quote_line_items_quote_id_fkey',
        'estimate_line_items',
        'estimates',
        ['estimate_id'],
        ['id'],
        ondelete='CASCADE'
    )
    op.create_foreign_key(
        'quote_phases_quote_id_fkey',
        'estimate_phases',
        'estimates',
        ['estimate_id'],
        ['id'],
        ondelete='CASCADE'
    )
    
    # Rename columns back
    op.alter_column('estimate_weekly_hours', 'estimate_line_item_id', new_column_name='quote_line_item_id')
    op.alter_column('estimate_line_items', 'estimate_id', new_column_name='quote_id')
    op.alter_column('estimate_phases', 'estimate_id', new_column_name='quote_id')
    
    # Rename tables back
    op.rename_table('estimate_weekly_hours', 'quote_weekly_hours')
    op.rename_table('estimate_phases', 'quote_phases')
    op.rename_table('estimate_line_items', 'quote_line_items')
    op.rename_table('estimates', 'quotes')


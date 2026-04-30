"""remove_phase_fields

Revision ID: remove_phase_fields
Revises: add_quote_phases_table
Create Date: 2025-12-11 14:35:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'remove_phase_fields'
down_revision = 'add_quote_phases_table'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Remove phase_names column from quotes table
    op.drop_column('quotes', 'phase_names')
    
    # Remove phase_name column from quote_line_items table
    op.drop_column('quote_line_items', 'phase_name')


def downgrade() -> None:
    # Add back phase_names column
    op.add_column('quotes',
        sa.Column('phase_names', sa.JSON(), nullable=True)
    )
    
    # Add back phase_name column
    op.add_column('quote_line_items',
        sa.Column('phase_name', sa.String(length=100), nullable=True)
    )







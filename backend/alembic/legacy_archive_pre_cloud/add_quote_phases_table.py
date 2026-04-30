"""add_quote_phases_table

Revision ID: add_quote_phases_table
Revises: 1d3c5cb3726a
Create Date: 2025-12-11 14:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_quote_phases_table'
down_revision = '1d3c5cb3726a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if quote_phases table already exists (it might have been created by add_quotes_tables migration)
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = inspector.get_table_names()
    
    if 'quote_phases' not in tables:
        # Create quote_phases table
        op.create_table('quote_phases',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('quote_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('start_date', sa.Date(), nullable=False),
            sa.Column('end_date', sa.Date(), nullable=False),
            sa.Column('color', sa.String(length=7), nullable=False, server_default='#3B82F6'),
            sa.Column('row_order', sa.Integer(), nullable=False, server_default='0'),
            sa.ForeignKeyConstraint(['quote_id'], ['quotes.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_quote_phases_id'), 'quote_phases', ['id'], unique=False)
        op.create_index(op.f('ix_quote_phases_quote_id'), 'quote_phases', ['quote_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_quote_phases_quote_id'), table_name='quote_phases')
    op.drop_index(op.f('ix_quote_phases_id'), table_name='quote_phases')
    op.drop_table('quote_phases')







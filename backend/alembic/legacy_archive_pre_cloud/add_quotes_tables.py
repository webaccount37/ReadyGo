"""add_quotes_tables

Revision ID: add_quotes_tables
Revises: 1d3c5cb3726a
Create Date: 2025-01-21 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_quotes_tables'
down_revision = '1d3c5cb3726a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if QuoteStatus enum exists, create if not
    bind = op.get_bind()
    result = bind.execute(sa.text("""
        SELECT EXISTS (
            SELECT 1 FROM pg_type WHERE typname = 'quotestatus'
        )
    """))
    enum_exists = result.scalar()
    
    if not enum_exists:
        # Create the enum type
        bind.execute(sa.text("""
            CREATE TYPE quotestatus AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'INVALID')
        """))
    
    # Check if quotes table exists
    result = bind.execute(sa.text("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'quotes'
        )
    """))
    quotes_table_exists = result.scalar()
    
    # Create quotes table
    if not quotes_table_exists:
        op.create_table(
        'quotes',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('engagement_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('estimate_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('quote_number', sa.String(255), nullable=False, unique=True),
        sa.Column('version', sa.Integer(), nullable=False, default=1),
        sa.Column('status', postgresql.ENUM('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'INVALID', name='quotestatus', create_type=False), nullable=False, server_default='DRAFT'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('sent_date', sa.Date(), nullable=True),
        sa.Column('notes', sa.String(2000), nullable=True),
        sa.Column('snapshot_data', postgresql.JSON, nullable=True),
        sa.ForeignKeyConstraint(['engagement_id'], ['engagements.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['estimate_id'], ['estimates.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['created_by'], ['employees.id'], ondelete='SET NULL'),
    )
        # Create indexes only if they don't exist
        indexes_to_create = [
            ('ix_quotes_engagement_id', 'quotes', ['engagement_id'], False),
            ('ix_quotes_estimate_id', 'quotes', ['estimate_id'], False),
            ('ix_quotes_quote_number', 'quotes', ['quote_number'], True),
            ('ix_quotes_is_active', 'quotes', ['is_active'], False),
            ('ix_quotes_status', 'quotes', ['status'], False),
        ]
        
        for index_name, table_name, columns, is_unique in indexes_to_create:
            result = bind.execute(sa.text("""
                SELECT EXISTS (
                    SELECT 1 FROM pg_indexes
                    WHERE schemaname = 'public'
                    AND indexname = :index_name
                )
            """), {'index_name': index_name})
            if not result.scalar():
                if is_unique:
                    op.create_index(index_name, table_name, columns, unique=True)
                else:
                    op.create_index(index_name, table_name, columns)
    
    # Check if quote_line_items table exists
    result = bind.execute(sa.text("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'quote_line_items'
        )
    """))
    quote_line_items_table_exists = result.scalar()
    
    # Create quote_line_items table
    if not quote_line_items_table_exists:
        op.create_table(
        'quote_line_items',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('quote_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('role_rates_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('payable_center_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('rate', sa.Numeric(15, 2), nullable=False),
        sa.Column('cost', sa.Numeric(15, 2), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('row_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('billable', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('billable_expense_percentage', sa.Numeric(5, 2), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['quote_id'], ['quotes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['role_rates_id'], ['role_rates.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['payable_center_id'], ['delivery_centers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ondelete='SET NULL'),
    )
        # Create indexes only if they don't exist
        indexes_to_create = [
            ('ix_quote_line_items_quote_id', 'quote_line_items', ['quote_id']),
            ('ix_quote_line_items_role_rates_id', 'quote_line_items', ['role_rates_id']),
            ('ix_quote_line_items_employee_id', 'quote_line_items', ['employee_id']),
        ]
        
        for index_name, table_name, columns in indexes_to_create:
            result = bind.execute(sa.text("""
                SELECT EXISTS (
                    SELECT 1 FROM pg_indexes
                    WHERE schemaname = 'public'
                    AND indexname = :index_name
                )
            """), {'index_name': index_name})
            if not result.scalar():
                op.create_index(index_name, table_name, columns)
    
    # Check if quote_phases table exists
    result = bind.execute(sa.text("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'quote_phases'
        )
    """))
    quote_phases_table_exists = result.scalar()
    
    # Create quote_phases table
    if not quote_phases_table_exists:
        op.create_table(
        'quote_phases',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('quote_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('color', sa.String(7), nullable=False, server_default='#3B82F6'),
        sa.Column('row_order', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['quote_id'], ['quotes.id'], ondelete='CASCADE'),
    )
        # Create index only if it doesn't exist
        result = bind.execute(sa.text("""
            SELECT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE schemaname = 'public'
                AND indexname = 'ix_quote_phases_quote_id'
            )
        """))
        if not result.scalar():
            op.create_index('ix_quote_phases_quote_id', 'quote_phases', ['quote_id'])
    
    # Check if quote_weekly_hours table exists
    result = bind.execute(sa.text("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'quote_weekly_hours'
        )
    """))
    quote_weekly_hours_table_exists = result.scalar()
    
    # Create quote_weekly_hours table
    if not quote_weekly_hours_table_exists:
        op.create_table(
        'quote_weekly_hours',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('quote_line_item_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('week_start_date', sa.Date(), nullable=False),
        sa.Column('hours', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['quote_line_item_id'], ['quote_line_items.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('quote_line_item_id', 'week_start_date', name='uq_quote_line_item_week'),
    )
        # Create indexes only if they don't exist
        indexes_to_create = [
            ('ix_quote_weekly_hours_quote_line_item_id', 'quote_weekly_hours', ['quote_line_item_id']),
            ('ix_quote_weekly_hours_week_start_date', 'quote_weekly_hours', ['week_start_date']),
        ]
        
        for index_name, table_name, columns in indexes_to_create:
            result = bind.execute(sa.text("""
                SELECT EXISTS (
                    SELECT 1 FROM pg_indexes
                    WHERE schemaname = 'public'
                    AND indexname = :index_name
                )
            """), {'index_name': index_name})
            if not result.scalar():
                op.create_index(index_name, table_name, columns)


def downgrade() -> None:
    op.drop_table('quote_weekly_hours')
    op.drop_table('quote_phases')
    op.drop_table('quote_line_items')
    op.drop_table('quotes')
    
    # Drop enum only if it exists
    bind = op.get_bind()
    result = bind.execute(sa.text("""
        SELECT EXISTS (
            SELECT 1 FROM pg_type WHERE typname = 'quotestatus'
        )
    """))
    enum_exists = result.scalar()
    
    if enum_exists:
        bind.execute(sa.text("DROP TYPE quotestatus"))

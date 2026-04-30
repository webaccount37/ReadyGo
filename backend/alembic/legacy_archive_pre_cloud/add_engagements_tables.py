"""add_engagements_tables

Revision ID: add_engagements_tables
Revises: extend_quote_functionality
Create Date: 2025-01-23 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_engagements_tables'
down_revision = 'extend_quote_functionality'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    
    # Check if engagements table exists
    result = bind.execute(sa.text("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'engagements'
        )
    """))
    engagements_table_exists = result.scalar()
    
    # Create engagements table
    if not engagements_table_exists:
        op.create_table(
            'engagements',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('quote_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('opportunity_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('name', sa.String(255), nullable=False),
            sa.Column('description', sa.String(2000), nullable=True),
            sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('attributes', postgresql.JSON, nullable=True, server_default='{}'),
            sa.ForeignKeyConstraint(['quote_id'], ['quotes.id'], ondelete='RESTRICT'),
            sa.ForeignKeyConstraint(['opportunity_id'], ['opportunities.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['created_by'], ['employees.id'], ondelete='SET NULL'),
        )
        # Create indexes only if they don't exist
        indexes_to_create = [
            ('ix_engagements_quote_id', 'engagements', ['quote_id'], False),
            ('ix_engagements_opportunity_id', 'engagements', ['opportunity_id'], False),
            ('ix_engagements_name', 'engagements', ['name'], False),
            ('ix_engagements_created_by', 'engagements', ['created_by'], False),
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
    
    # Check if engagement_phases table exists
    result = bind.execute(sa.text("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'engagement_phases'
        )
    """))
    engagement_phases_table_exists = result.scalar()
    
    # Create engagement_phases table
    if not engagement_phases_table_exists:
        op.create_table(
            'engagement_phases',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('engagement_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('name', sa.String(100), nullable=False),
            sa.Column('start_date', sa.Date(), nullable=False),
            sa.Column('end_date', sa.Date(), nullable=False),
            sa.Column('color', sa.String(7), nullable=False, server_default='#3B82F6'),
            sa.Column('row_order', sa.Integer(), nullable=False, server_default='0'),
            sa.ForeignKeyConstraint(['engagement_id'], ['engagements.id'], ondelete='CASCADE'),
        )
        # Create index only if it doesn't exist
        result = bind.execute(sa.text("""
            SELECT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE schemaname = 'public'
                AND indexname = 'ix_engagement_phases_engagement_id'
            )
        """))
        if not result.scalar():
            op.create_index('ix_engagement_phases_engagement_id', 'engagement_phases', ['engagement_id'])
    
    # Check if engagement_line_items table exists
    result = bind.execute(sa.text("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'engagement_line_items'
        )
    """))
    engagement_line_items_table_exists = result.scalar()
    
    # Create engagement_line_items table
    if not engagement_line_items_table_exists:
        op.create_table(
            'engagement_line_items',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('engagement_id', postgresql.UUID(as_uuid=True), nullable=False),
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
            sa.ForeignKeyConstraint(['engagement_id'], ['engagements.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['role_rates_id'], ['role_rates.id'], ondelete='RESTRICT'),
            sa.ForeignKeyConstraint(['payable_center_id'], ['delivery_centers.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ondelete='SET NULL'),
        )
        # Create indexes only if they don't exist
        indexes_to_create = [
            ('ix_engagement_line_items_engagement_id', 'engagement_line_items', ['engagement_id']),
            ('ix_engagement_line_items_role_rates_id', 'engagement_line_items', ['role_rates_id']),
            ('ix_engagement_line_items_payable_center_id', 'engagement_line_items', ['payable_center_id']),
            ('ix_engagement_line_items_employee_id', 'engagement_line_items', ['employee_id']),
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
    
    # Check if engagement_weekly_hours table exists
    result = bind.execute(sa.text("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'engagement_weekly_hours'
        )
    """))
    engagement_weekly_hours_table_exists = result.scalar()
    
    # Create engagement_weekly_hours table
    if not engagement_weekly_hours_table_exists:
        op.create_table(
            'engagement_weekly_hours',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('engagement_line_item_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('week_start_date', sa.Date(), nullable=False),
            sa.Column('hours', sa.Numeric(10, 2), nullable=False, server_default='0'),
            sa.ForeignKeyConstraint(['engagement_line_item_id'], ['engagement_line_items.id'], ondelete='CASCADE'),
            sa.UniqueConstraint('engagement_line_item_id', 'week_start_date', name='uq_engagement_line_item_week'),
        )
        # Create indexes only if they don't exist
        indexes_to_create = [
            ('ix_engagement_weekly_hours_engagement_line_item_id', 'engagement_weekly_hours', ['engagement_line_item_id']),
            ('ix_engagement_weekly_hours_week_start_date', 'engagement_weekly_hours', ['week_start_date']),
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
    op.drop_table('engagement_weekly_hours')
    op.drop_table('engagement_line_items')
    op.drop_table('engagement_phases')
    op.drop_table('engagements')

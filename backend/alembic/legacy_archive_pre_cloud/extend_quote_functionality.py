"""extend_quote_functionality

Revision ID: extend_quote_functionality
Revises: add_quotes_tables
Create Date: 2025-01-22 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'extend_quote_functionality'
down_revision = 'cf1aa59cf7d2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    
    # Create new enum types
    enums_to_create = [
        ('quotetype', ['FIXED_BID', 'TIME_MATERIALS']),
        ('paymenttriggertype', ['TIME', 'MILESTONE']),
        ('timetype', ['IMMEDIATE', 'MONTHLY']),
        ('revenuetype', ['GROSS_REVENUE', 'GROSS_MARGIN']),
        ('ratebillingunit', ['HOURLY_ACTUALS', 'DAILY_ACTUALS', 'HOURLY_BLENDED', 'DAILY_BLENDED']),
        ('invoicedetail', ['ROLE', 'EMPLOYEE', 'EMPLOYEE_WITH_DESCRIPTIONS']),
        ('captype', ['NONE', 'CAPPED', 'FLOOR']),
    ]
    
    for enum_name, enum_values in enums_to_create:
        result = bind.execute(sa.text(f"""
            SELECT EXISTS (
                SELECT 1 FROM pg_type WHERE typname = '{enum_name}'
            )
        """))
        enum_exists = result.scalar()
        
        if not enum_exists:
            values_str = ', '.join([f"'{v}'" for v in enum_values])
            bind.execute(sa.text(f"""
                CREATE TYPE {enum_name} AS ENUM ({values_str})
            """))
    
    # Add new columns to quotes table
    op.add_column('quotes', sa.Column('quote_type', postgresql.ENUM('FIXED_BID', 'TIME_MATERIALS', name='quotetype', create_type=False), nullable=True))
    op.add_column('quotes', sa.Column('target_amount', sa.Numeric(15, 2), nullable=True))
    op.add_column('quotes', sa.Column('rate_billing_unit', postgresql.ENUM('HOURLY_ACTUALS', 'DAILY_ACTUALS', 'HOURLY_BLENDED', 'DAILY_BLENDED', name='ratebillingunit', create_type=False), nullable=True))
    op.add_column('quotes', sa.Column('blended_rate_amount', sa.Numeric(15, 2), nullable=True))
    op.add_column('quotes', sa.Column('invoice_detail', postgresql.ENUM('ROLE', 'EMPLOYEE', 'EMPLOYEE_WITH_DESCRIPTIONS', name='invoicedetail', create_type=False), nullable=True))
    op.add_column('quotes', sa.Column('cap_type', postgresql.ENUM('NONE', 'CAPPED', 'FLOOR', name='captype', create_type=False), nullable=True))
    op.add_column('quotes', sa.Column('cap_amount', sa.Numeric(15, 2), nullable=True))
    
    # Create index on quote_type
    op.create_index('ix_quotes_quote_type', 'quotes', ['quote_type'], unique=False)
    
    # Create quote_payment_triggers table
    op.create_table(
        'quote_payment_triggers',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('quote_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('trigger_type', postgresql.ENUM('TIME', 'MILESTONE', name='paymenttriggertype', create_type=False), nullable=False),
        sa.Column('time_type', postgresql.ENUM('IMMEDIATE', 'MONTHLY', name='timetype', create_type=False), nullable=True),
        sa.Column('amount', sa.Numeric(15, 2), nullable=False),
        sa.Column('num_installments', sa.Integer(), nullable=True),
        sa.Column('milestone_date', sa.Date(), nullable=True),
        sa.Column('row_order', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['quote_id'], ['quotes.id'], ondelete='CASCADE'),
        sa.Index('ix_quote_payment_triggers_quote_id', 'quote_id'),
    )
    
    # Create quote_variable_compensations table
    op.create_table(
        'quote_variable_compensations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('quote_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('revenue_type', postgresql.ENUM('GROSS_REVENUE', 'GROSS_MARGIN', name='revenuetype', create_type=False), nullable=False, server_default='GROSS_MARGIN'),
        sa.Column('percentage_amount', sa.Numeric(5, 2), nullable=False),
        sa.ForeignKeyConstraint(['quote_id'], ['quotes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ondelete='RESTRICT'),
        sa.Index('ix_quote_variable_compensations_quote_id', 'quote_id'),
        sa.Index('ix_quote_variable_compensations_employee_id', 'employee_id'),
    )


def downgrade() -> None:
    # Drop tables
    op.drop_table('quote_variable_compensations')
    op.drop_table('quote_payment_triggers')
    
    # Drop index
    op.drop_index('ix_quotes_quote_type', table_name='quotes')
    
    # Drop columns from quotes table
    op.drop_column('quotes', 'cap_amount')
    op.drop_column('quotes', 'cap_type')
    op.drop_column('quotes', 'invoice_detail')
    op.drop_column('quotes', 'blended_rate_amount')
    op.drop_column('quotes', 'rate_billing_unit')
    op.drop_column('quotes', 'target_amount')
    op.drop_column('quotes', 'quote_type')
    
    # Drop enum types (only if no other tables use them)
    bind = op.get_bind()
    enums_to_drop = [
        'captype',
        'invoicedetail',
        'ratebillingunit',
        'revenuetype',
        'timetype',
        'paymenttriggertype',
        'quotetype',
    ]
    
    for enum_name in enums_to_drop:
        # Check if enum is used by any other table
        result = bind.execute(sa.text(f"""
            SELECT COUNT(*) FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            WHERE t.typname = '{enum_name}'
        """))
        if result.scalar() > 0:
            bind.execute(sa.text(f"DROP TYPE IF EXISTS {enum_name} CASCADE"))

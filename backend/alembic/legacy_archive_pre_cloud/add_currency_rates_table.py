"""add_currency_rates_table

Revision ID: add_currency_rates
Revises: add_billable_expense_pct
Create Date: 2025-01-21 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_currency_rates'
down_revision = 'e170c8985fb'  # Revise from the rename_engagements_to_opportunities migration
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create currency_rates table
    op.create_table(
        'currency_rates',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('currency_code', sa.String(length=3), nullable=False),
        sa.Column('rate_to_usd', sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_currency_rates_id'), 'currency_rates', ['id'], unique=False)
    op.create_index(op.f('ix_currency_rates_currency_code'), 'currency_rates', ['currency_code'], unique=True)
    
    # Insert initial currency rates from the existing CURRENCY_RATES_TO_USD dictionary
    # Use text() for proper SQL execution
    from sqlalchemy import text
    op.execute(text("""
        INSERT INTO currency_rates (id, currency_code, rate_to_usd)
        VALUES
            (gen_random_uuid(), 'USD', 1.0),
            (gen_random_uuid(), 'PHP', 50.0),
            (gen_random_uuid(), 'VND', 24000.0),
            (gen_random_uuid(), 'THB', 35.0),
            (gen_random_uuid(), 'EUR', 0.85),
            (gen_random_uuid(), 'GBP', 0.75),
            (gen_random_uuid(), 'AUD', 1.35),
            (gen_random_uuid(), 'SGD', 1.35),
            (gen_random_uuid(), 'JPY', 110.0),
            (gen_random_uuid(), 'CNY', 6.5)
    """))


def downgrade() -> None:
    op.drop_index(op.f('ix_currency_rates_currency_code'), table_name='currency_rates')
    op.drop_index(op.f('ix_currency_rates_id'), table_name='currency_rates')
    op.drop_table('currency_rates')


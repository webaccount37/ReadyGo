"""redesign_calendars_table

Revision ID: redesign_cal
Revises: add_country_dc
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = 'redesign_cal'
down_revision = 'add_country_dc'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Drop availability_calendar_id from employees (removes FK to calendars)
    op.drop_constraint(
        'employees_availability_calendar_id_fkey',
        'employees',
        type_='foreignkey',
    )
    op.drop_column('employees', 'availability_calendar_id')

    # 2. Drop old calendars table
    op.drop_table('calendars')

    # 3. Create new calendars table
    op.create_table(
        'calendars',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('country_code', sa.String(2), nullable=False),
        sa.Column('hours', sa.Numeric(10, 2), nullable=False, server_default='8'),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('delivery_center_id', UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['delivery_center_id'], ['delivery_centers.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_calendars_date', 'calendars', ['date'])
    op.create_index('ix_calendars_year', 'calendars', ['year'])
    op.create_index('ix_calendars_delivery_center_id', 'calendars', ['delivery_center_id'])


def downgrade() -> None:
    # Drop new calendars table
    op.drop_index('ix_calendars_delivery_center_id', 'calendars')
    op.drop_index('ix_calendars_year', 'calendars')
    op.drop_index('ix_calendars_date', 'calendars')
    op.drop_table('calendars')

    # Recreate old calendars table
    op.create_table(
        'calendars',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        sa.Column('day', sa.Integer(), nullable=False),
        sa.Column('is_holiday', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('holiday_name', sa.String(255), nullable=True),
        sa.Column('financial_period', sa.String(50), nullable=True),
        sa.Column('working_hours', sa.Float(), nullable=False, server_default='8.0'),
        sa.Column('notes', sa.String(1000), nullable=True),
    )
    op.create_index('ix_calendars_year', 'calendars', ['year'])
    op.create_index('ix_calendars_month', 'calendars', ['month'])
    op.create_index('ix_calendars_day', 'calendars', ['day'])

    # Re-add availability_calendar_id to employees
    op.add_column(
        'employees',
        sa.Column('availability_calendar_id', UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'employees_availability_calendar_id_fkey',
        'employees',
        'calendars',
        ['availability_calendar_id'],
        ['id'],
    )

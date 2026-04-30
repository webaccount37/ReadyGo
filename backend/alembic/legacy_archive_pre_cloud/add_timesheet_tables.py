"""add_timesheet_tables

Revision ID: add_timesheet_tables
Revises: add_engagements_tables
Create Date: 2026-02-13

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_timesheet_tables'
down_revision = 'add_engagements_tables'
branch_labels = None
depends_on = None

# Use postgresql.ENUM with create_type=False to avoid duplicate creation
# (enums are created via op.execute with IF NOT EXISTS)
timesheet_status_enum = postgresql.ENUM(
    'NOT_SUBMITTED', 'SUBMITTED', 'APPROVED', 'REOPENED', 'INVOICED',
    name='timesheetstatus', create_type=False
)
timesheet_entry_type_enum = postgresql.ENUM(
    'ENGAGEMENT', 'SALES', name='timesheetentrytype', create_type=False
)


def upgrade() -> None:
    # Create timesheet_status enum
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'timesheetstatus') THEN
                CREATE TYPE timesheetstatus AS ENUM (
                    'NOT_SUBMITTED', 'SUBMITTED', 'APPROVED', 'REOPENED', 'INVOICED'
                );
            END IF;
        END $$;
    """)

    # Create timesheet_entry_type enum
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'timesheetentrytype') THEN
                CREATE TYPE timesheetentrytype AS ENUM ('ENGAGEMENT', 'SALES');
            END IF;
        END $$;
    """)

    # Create engagement_timesheet_approvers table
    op.create_table(
        'engagement_timesheet_approvers',
        sa.Column('engagement_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint('engagement_id', 'employee_id'),
        sa.ForeignKeyConstraint(['engagement_id'], ['engagements.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_engagement_timesheet_approvers_engagement_id', 'engagement_timesheet_approvers', ['engagement_id'])
    op.create_index('ix_engagement_timesheet_approvers_employee_id', 'engagement_timesheet_approvers', ['employee_id'])

    # Create timesheets table
    op.create_table(
        'timesheets',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('week_start_date', sa.Date(), nullable=False),
        sa.Column('status', timesheet_status_enum, nullable=False, server_default='NOT_SUBMITTED'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('employee_id', 'week_start_date', name='uq_timesheet_employee_week'),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_timesheets_id', 'timesheets', ['id'])
    op.create_index('ix_timesheets_employee_id', 'timesheets', ['employee_id'])
    op.create_index('ix_timesheets_week_start_date', 'timesheets', ['week_start_date'])
    op.create_index('ix_timesheets_status', 'timesheets', ['status'])

    # Create timesheet_entries table
    op.create_table(
        'timesheet_entries',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('timesheet_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('row_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('entry_type', timesheet_entry_type_enum, nullable=False, server_default='ENGAGEMENT'),
        sa.Column('account_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('engagement_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('opportunity_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('engagement_line_item_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('engagement_phase_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('billable', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('sun_hours', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('mon_hours', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('tue_hours', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('wed_hours', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('thu_hours', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('fri_hours', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('sat_hours', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['timesheet_id'], ['timesheets.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id']),
        sa.ForeignKeyConstraint(['engagement_id'], ['engagements.id']),
        sa.ForeignKeyConstraint(['opportunity_id'], ['opportunities.id']),
        sa.ForeignKeyConstraint(['engagement_line_item_id'], ['engagement_line_items.id']),
        sa.ForeignKeyConstraint(['engagement_phase_id'], ['engagement_phases.id']),
    )
    op.create_index('ix_timesheet_entries_id', 'timesheet_entries', ['id'])
    op.create_index('ix_timesheet_entries_timesheet_id', 'timesheet_entries', ['timesheet_id'])
    op.create_index('ix_timesheet_entries_account_id', 'timesheet_entries', ['account_id'])
    op.create_index('ix_timesheet_entries_engagement_id', 'timesheet_entries', ['engagement_id'])
    op.create_index('ix_timesheet_entries_opportunity_id', 'timesheet_entries', ['opportunity_id'])
    op.create_index('ix_timesheet_entries_engagement_line_item_id', 'timesheet_entries', ['engagement_line_item_id'])
    op.create_index('ix_timesheet_entries_engagement_phase_id', 'timesheet_entries', ['engagement_phase_id'])

    # Create timesheet_day_notes table
    op.create_table(
        'timesheet_day_notes',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('timesheet_entry_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('day_of_week', sa.Integer(), nullable=False),
        sa.Column('note', sa.String(2000), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('timesheet_entry_id', 'day_of_week', name='uq_timesheet_entry_day'),
        sa.ForeignKeyConstraint(['timesheet_entry_id'], ['timesheet_entries.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_timesheet_day_notes_id', 'timesheet_day_notes', ['id'])
    op.create_index('ix_timesheet_day_notes_timesheet_entry_id', 'timesheet_day_notes', ['timesheet_entry_id'])

    # Create timesheet_approved_snapshots table
    op.create_table(
        'timesheet_approved_snapshots',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('timesheet_entry_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('day_of_week', sa.Integer(), nullable=False),
        sa.Column('hours', sa.Numeric(10, 2), nullable=False),
        sa.Column('cost', sa.Numeric(15, 2), nullable=False),
        sa.Column('rate', sa.Numeric(15, 2), nullable=False),
        sa.Column('billable', sa.Boolean(), nullable=False),
        sa.Column('invoice_currency', sa.String(3), nullable=False),
        sa.Column('invoice_rate', sa.Numeric(15, 2), nullable=False),
        sa.Column('invoice_cost', sa.Numeric(15, 2), nullable=False),
        sa.Column('currency_rate_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('currency_rate_applied', sa.Numeric(15, 6), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('timesheet_entry_id', 'day_of_week', name='uq_snapshot_entry_day'),
        sa.ForeignKeyConstraint(['timesheet_entry_id'], ['timesheet_entries.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['currency_rate_id'], ['currency_rates.id']),
    )
    op.create_index('ix_timesheet_approved_snapshots_id', 'timesheet_approved_snapshots', ['id'])
    op.create_index('ix_timesheet_approved_snapshots_timesheet_entry_id', 'timesheet_approved_snapshots', ['timesheet_entry_id'])

    # Create timesheet_status_history table
    op.create_table(
        'timesheet_status_history',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('timesheet_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('from_status', timesheet_status_enum, nullable=True),
        sa.Column('to_status', timesheet_status_enum, nullable=False),
        sa.Column('changed_by_employee_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('changed_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['timesheet_id'], ['timesheets.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['changed_by_employee_id'], ['employees.id']),
    )
    op.create_index('ix_timesheet_status_history_id', 'timesheet_status_history', ['id'])
    op.create_index('ix_timesheet_status_history_timesheet_id', 'timesheet_status_history', ['timesheet_id'])

    # Create opportunity_permanent_locks table
    op.create_table(
        'opportunity_permanent_locks',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('opportunity_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('locked_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('locked_by_timesheet_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('opportunity_id', name='uq_opportunity_permanent_lock'),
        sa.ForeignKeyConstraint(['opportunity_id'], ['opportunities.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['locked_by_timesheet_id'], ['timesheets.id']),
    )
    op.create_index('ix_opportunity_permanent_locks_id', 'opportunity_permanent_locks', ['id'])
    op.create_index('ix_opportunity_permanent_locks_opportunity_id', 'opportunity_permanent_locks', ['opportunity_id'])


def downgrade() -> None:
    op.drop_table('opportunity_permanent_locks')
    op.drop_table('timesheet_status_history')
    op.drop_table('timesheet_approved_snapshots')
    op.drop_table('timesheet_day_notes')
    op.drop_table('timesheet_entries')
    op.drop_table('timesheets')
    op.drop_table('engagement_timesheet_approvers')
    op.execute("DROP TYPE IF EXISTS timesheetentrytype")
    op.execute("DROP TYPE IF EXISTS timesheetstatus")

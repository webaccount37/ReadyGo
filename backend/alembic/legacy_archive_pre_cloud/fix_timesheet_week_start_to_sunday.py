"""fix_timesheet_week_start_to_sunday

Revision ID: fix_ts_sunday
Revises: revert_ready_pto
Create Date: 2026-03-07

Fixes timesheets with week_start_date that is not Sunday. All timesheet weeks must
align to Sunday-Saturday. Converts non-Sunday dates to the Sunday of that week.
Handles duplicates by merging entries into the existing Sunday timesheet.
"""
from alembic import op
from sqlalchemy import text


revision = 'fix_ts_sunday'
down_revision = 'revert_ready_pto'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Find timesheets where week_start_date is not Sunday (PostgreSQL: DOW 0 = Sunday)
    # For each, compute the correct Sunday: week_start_date - DOW days (date - integer in PG)
    # 1. Update timesheets where no duplicate exists
    conn.execute(text("""
        UPDATE timesheets t
        SET week_start_date = t.week_start_date - EXTRACT(DOW FROM t.week_start_date)::integer
        WHERE EXTRACT(DOW FROM t.week_start_date) != 0
        AND NOT EXISTS (
            SELECT 1 FROM timesheets t2
            WHERE t2.employee_id = t.employee_id
            AND t2.id != t.id
            AND t2.week_start_date = t.week_start_date - EXTRACT(DOW FROM t.week_start_date)::integer
        )
    """))

    # 2. For timesheets that would create duplicates: merge entries into the Sunday timesheet, then delete
    result = conn.execute(text("""
        SELECT t.id AS bad_id, t.employee_id,
               (t.week_start_date - EXTRACT(DOW FROM t.week_start_date)::integer)::date AS sunday_date
        FROM timesheets t
        WHERE EXTRACT(DOW FROM t.week_start_date) != 0
        AND EXISTS (
            SELECT 1 FROM timesheets t2
            WHERE t2.employee_id = t.employee_id
            AND t2.id != t.id
            AND t2.week_start_date = t.week_start_date - EXTRACT(DOW FROM t.week_start_date)::integer
        )
    """))
    rows = result.fetchall()

    for row in rows:
        bad_id, employee_id, sunday_date = row[0], row[1], row[2]
        # Find the good timesheet (Sunday one)
        good = conn.execute(text("""
            SELECT id FROM timesheets
            WHERE employee_id = :emp_id AND week_start_date = :sun
        """), {"emp_id": str(employee_id), "sun": sunday_date})
        good_row = good.fetchone()
        if good_row:
            good_id = good_row[0]
            # Move entries from bad to good (update timesheet_id)
            conn.execute(text("""
                UPDATE timesheet_entries SET timesheet_id = :good_id WHERE timesheet_id = :bad_id
            """), {"good_id": str(good_id), "bad_id": str(bad_id)})
            # Move status history
            conn.execute(text("""
                UPDATE timesheet_status_history SET timesheet_id = :good_id WHERE timesheet_id = :bad_id
            """), {"good_id": str(good_id), "bad_id": str(bad_id)})
            # Delete the bad timesheet (cascade will handle entries/history if we didn't move them - but we did move them)
            conn.execute(text("DELETE FROM timesheets WHERE id = :bad_id"), {"bad_id": str(bad_id)})


def downgrade() -> None:
    # No downgrade - we cannot restore the original non-Sunday dates
    pass

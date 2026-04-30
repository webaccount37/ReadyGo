"""remove_duplicate_zero_hour_timesheet_entries

Revision ID: remove_dup_0hr
Revises: fix_ts_sunday
Create Date: 2026-03-07

Removes duplicate timesheet entries caused by merging invalid week timesheets.
Duplicates are identified by same Type, Account, Project, Phase within a timesheet.
Only entries with 0 total hours are removed (keeping the row with hours when both exist).
"""
from alembic import op
from sqlalchemy import text


revision = 'remove_dup_0hr'
down_revision = 'fix_ts_sunday'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Delete duplicate timesheet entries: same (timesheet_id, entry_type, account_id,
    # engagement_id, engagement_phase_id, account_display_name, engagement_display_name)
    # where the entry has 0 total hours. When multiple duplicates have 0 hours, keep one.
    conn.execute(text("""
        WITH dup_groups AS (
            SELECT id,
                   (COALESCE(sun_hours, 0) + COALESCE(mon_hours, 0) + COALESCE(tue_hours, 0)
                    + COALESCE(wed_hours, 0) + COALESCE(thu_hours, 0) + COALESCE(fri_hours, 0)
                    + COALESCE(sat_hours, 0)) AS total_hours,
                   ROW_NUMBER() OVER (
                       PARTITION BY timesheet_id, entry_type,
                           COALESCE(account_id::text, ''),
                           COALESCE(engagement_id::text, ''),
                           COALESCE(engagement_phase_id::text, ''),
                           COALESCE(account_display_name, ''),
                           COALESCE(engagement_display_name, '')
                       ORDER BY (COALESCE(sun_hours, 0) + COALESCE(mon_hours, 0) + COALESCE(tue_hours, 0)
                                 + COALESCE(wed_hours, 0) + COALESCE(thu_hours, 0) + COALESCE(fri_hours, 0)
                                 + COALESCE(sat_hours, 0)) DESC, id ASC
                   ) AS rn
            FROM timesheet_entries
        )
        DELETE FROM timesheet_entries
        WHERE id IN (SELECT id FROM dup_groups WHERE total_hours = 0 AND rn > 1)
    """))


def downgrade() -> None:
    # No downgrade - deleted duplicates cannot be restored
    pass

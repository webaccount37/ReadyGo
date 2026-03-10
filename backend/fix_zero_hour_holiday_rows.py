"""
Script to remove 0-hour holiday rows from existing timesheets.
These were incorrectly added when there were no holidays in the week.

Run inside Docker:
  docker exec readygo-backend python fix_zero_hour_holiday_rows.py
"""

import asyncio
from sqlalchemy import text
from app.db.session import init_db
from app.core.logging import get_logger

logger = get_logger(__name__)


async def fix_zero_hour_holiday_rows():
    """Delete timesheet entries that are holiday rows with 0 total hours."""
    from app.db.session import async_session_maker

    async with async_session_maker() as session:
        try:
            # Count first
            count_result = await session.execute(
                text("""
                    SELECT COUNT(*) FROM timesheet_entries
                    WHERE is_holiday_row = true
                    AND COALESCE(sun_hours, 0) + COALESCE(mon_hours, 0) + COALESCE(tue_hours, 0)
                        + COALESCE(wed_hours, 0) + COALESCE(thu_hours, 0) + COALESCE(fri_hours, 0)
                        + COALESCE(sat_hours, 0) = 0
                """)
            )
            count = count_result.scalar() or 0
            if count == 0:
                logger.info("No 0-hour holiday rows found. Nothing to fix.")
                return

            logger.info(f"Removing {count} 0-hour holiday rows...")

            # Delete in one query
            await session.execute(
                text("""
                    DELETE FROM timesheet_entries
                    WHERE is_holiday_row = true
                    AND COALESCE(sun_hours, 0) + COALESCE(mon_hours, 0) + COALESCE(tue_hours, 0)
                        + COALESCE(wed_hours, 0) + COALESCE(thu_hours, 0) + COALESCE(fri_hours, 0)
                        + COALESCE(sat_hours, 0) = 0
                """)
            )
            await session.commit()
            logger.info(f"Removed {count} 0-hour holiday rows")

        except Exception as e:
            await session.rollback()
            logger.error(f"Error during fix: {e}", exc_info=True)
            raise


async def main():
    await init_db()
    print("Removing 0-hour holiday rows from timesheets...")
    await fix_zero_hour_holiday_rows()  # imports async_session_maker after init_db
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())

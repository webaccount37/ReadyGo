"""
Script to fix old EstimateWeeklyHours records that have Monday dates instead of Sunday dates.
Converts Monday week_start_date to the previous Sunday and handles duplicates.
"""

import asyncio
from datetime import date, timedelta
from sqlalchemy import text, select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session_maker
from app.models.estimate import EstimateWeeklyHours
from app.core.logging import get_logger

logger = get_logger(__name__)


async def fix_monday_weekly_hours():
    """Fix Monday dates by converting them to Sunday and handling duplicates."""
    async with async_session_maker() as session:
        try:
            # Find all records where week_start_date is a Monday
            # In PostgreSQL, EXTRACT(DOW FROM date) returns 0=Sunday, 1=Monday, ..., 6=Saturday
            # So Monday = 1
            result = await session.execute(
                text("""
                    SELECT id, estimate_line_item_id, week_start_date, hours
                    FROM estimate_weekly_hours
                    WHERE EXTRACT(DOW FROM week_start_date) = 1
                    ORDER BY estimate_line_item_id, week_start_date
                """)
            )
            monday_records = result.fetchall()
            
            logger.info(f"Found {len(monday_records)} records with Monday dates")
            
            if not monday_records:
                logger.info("No Monday records found. Nothing to fix.")
                return
            
            updated_count = 0
            deleted_count = 0
            merged_count = 0
            
            for record in monday_records:
                record_id, line_item_id, monday_date, hours = record
                sunday_date = monday_date - timedelta(days=1)
                
                logger.info(f"Processing record {record_id}: {monday_date} (Monday) -> {sunday_date} (Sunday), hours={hours}")
                
                # Check if a Sunday record already exists for this week
                existing_sunday = await session.execute(
                    select(EstimateWeeklyHours).where(
                        and_(
                            EstimateWeeklyHours.estimate_line_item_id == line_item_id,
                            EstimateWeeklyHours.week_start_date == sunday_date
                        )
                    )
                )
                existing_sunday_record = existing_sunday.scalar_one_or_none()
                
                if existing_sunday_record:
                    # Merge: update Sunday record with the maximum hours (or sum, depending on preference)
                    # For now, we'll use the maximum to avoid double-counting
                    new_hours = max(float(existing_sunday_record.hours), float(hours))
                    existing_sunday_record.hours = str(new_hours)
                    logger.info(f"  Merged: Updated Sunday record {existing_sunday_record.id} with hours={new_hours} (was {existing_sunday_record.hours})")
                    
                    # Delete the Monday record
                    await session.execute(
                        text("DELETE FROM estimate_weekly_hours WHERE id = :id").bindparams(id=record_id)
                    )
                    deleted_count += 1
                    merged_count += 1
                else:
                    # No Sunday record exists, update Monday record to Sunday
                    await session.execute(
                        text("""
                            UPDATE estimate_weekly_hours
                            SET week_start_date = :sunday_date
                            WHERE id = :id
                        """).bindparams(sunday_date=sunday_date, id=record_id)
                    )
                    updated_count += 1
                    logger.info(f"  Updated: Changed {monday_date} to {sunday_date}")
            
            await session.commit()
            
            logger.info(f"Migration complete:")
            logger.info(f"  - Updated {updated_count} records (Monday -> Sunday)")
            logger.info(f"  - Deleted {deleted_count} duplicate Monday records")
            logger.info(f"  - Merged {merged_count} duplicate weeks")
            
        except Exception as e:
            await session.rollback()
            logger.error(f"Error during migration: {e}", exc_info=True)
            raise


async def verify_fix():
    """Verify that no Monday records remain."""
    async with async_session_maker() as session:
        result = await session.execute(
            text("""
                SELECT COUNT(*) as count
                FROM estimate_weekly_hours
                WHERE EXTRACT(DOW FROM week_start_date) = 1
            """)
        )
        count = result.scalar()
        
        if count == 0:
            logger.info("✓ Verification passed: No Monday records found")
        else:
            logger.warning(f"⚠ Verification failed: {count} Monday records still exist")
        
        # Also check for Sunday records
        result = await session.execute(
            text("""
                SELECT COUNT(*) as count
                FROM estimate_weekly_hours
                WHERE EXTRACT(DOW FROM week_start_date) = 0
            """)
        )
        sunday_count = result.scalar()
        logger.info(f"Found {sunday_count} Sunday records")


async def main():
    """Main entry point."""
    from app.db.session import init_db
    
    # Initialize database connection
    await init_db()
    
    print("Starting migration to fix Monday weekly hours records...")
    await fix_monday_weekly_hours()
    print("\nVerifying fix...")
    await verify_fix()
    print("\nMigration complete!")


if __name__ == "__main__":
    asyncio.run(main())


#!/usr/bin/env python3
"""
Data repair script for locking and permanent lock inconsistencies.

Fixes:
1. Spurious permanent locks: opportunity_permanent_locks exists but no SUBMITTED/APPROVED/INVOICED
   timesheet entries with hours exist for that opportunity's engagements.
2. Orphaned engagements: quote is_active=False but engagements still exist, with no blocking
   timesheets. Deletes timesheet entries and engagements.

Usage:
    cd backend && python -m scripts.repair_locking_state [--execute]

    Run with the project's Python environment (e.g. uv run, poetry run, or activated venv).
    --dry-run (default): Report what would be repaired without making changes
    --execute: Apply the repairs
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

# Add backend to path so we can import app
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import create_engine, create_sessionmaker
from app.models.opportunity_permanent_lock import OpportunityPermanentLock
from app.models.timesheet import TimesheetEntry, Timesheet, TimesheetStatus
from app.models.engagement import Engagement
from app.models.quote import Quote

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

BLOCKING_STATUSES = (TimesheetStatus.SUBMITTED, TimesheetStatus.APPROVED, TimesheetStatus.INVOICED)


async def find_spurious_permanent_locks(session: AsyncSession):
    """
    Find opportunities that have a permanent lock but no blocking timesheet entries.
    Returns list of (opportunity_id, lock_id) to remove.
    """
    # All permanent locks
    locks_result = await session.execute(select(OpportunityPermanentLock))
    locks = locks_result.scalars().all()
    to_remove = []

    for lock in locks:
        opp_id = lock.opportunity_id
        # Engagement IDs for this opportunity
        eng_ids_subq = select(Engagement.id).where(Engagement.opportunity_id == opp_id)
        # Count entries with hours > 0 in blocking status timesheets
        hours_expr = (
            func.coalesce(TimesheetEntry.sun_hours, 0) + func.coalesce(TimesheetEntry.mon_hours, 0)
            + func.coalesce(TimesheetEntry.tue_hours, 0) + func.coalesce(TimesheetEntry.wed_hours, 0)
            + func.coalesce(TimesheetEntry.thu_hours, 0) + func.coalesce(TimesheetEntry.fri_hours, 0)
            + func.coalesce(TimesheetEntry.sat_hours, 0)
        )
        count_result = await session.execute(
            select(func.count())
            .select_from(TimesheetEntry)
            .join(Timesheet, TimesheetEntry.timesheet_id == Timesheet.id)
            .where(TimesheetEntry.engagement_id.in_(eng_ids_subq))
            .where(Timesheet.status.in_(BLOCKING_STATUSES))
            .where(hours_expr > 0)
        )
        count = count_result.scalar_one() or 0
        if count == 0:
            to_remove.append((opp_id, lock.id))

    return to_remove


async def find_orphaned_engagements(session: AsyncSession):
    """
    Find quotes with is_active=False that still have engagements.
    For each, check if there are blocking timesheets. If not, we can clean up.
    Returns list of (quote_id, engagement_ids) to clean.
    """
    # Quotes with is_active=False
    inactive_quotes_result = await session.execute(
        select(Quote.id).where(Quote.is_active == False)
    )
    inactive_quote_ids = [r[0] for r in inactive_quotes_result.fetchall()]

    to_clean = []
    for quote_id in inactive_quote_ids:
        engs_result = await session.execute(
            select(Engagement.id).where(Engagement.quote_id == quote_id)
        )
        engagement_ids = [r[0] for r in engs_result.fetchall()]
        if not engagement_ids:
            continue

        # Check for blocking timesheets
        hours_expr = (
            func.coalesce(TimesheetEntry.sun_hours, 0) + func.coalesce(TimesheetEntry.mon_hours, 0)
            + func.coalesce(TimesheetEntry.tue_hours, 0) + func.coalesce(TimesheetEntry.wed_hours, 0)
            + func.coalesce(TimesheetEntry.thu_hours, 0) + func.coalesce(TimesheetEntry.fri_hours, 0)
            + func.coalesce(TimesheetEntry.sat_hours, 0)
        )
        count_result = await session.execute(
            select(func.count())
            .select_from(TimesheetEntry)
            .join(Timesheet, TimesheetEntry.timesheet_id == Timesheet.id)
            .where(TimesheetEntry.engagement_id.in_(engagement_ids))
            .where(Timesheet.status.in_(BLOCKING_STATUSES))
            .where(hours_expr > 0)
        )
        count = count_result.scalar_one() or 0
        if count == 0:
            to_clean.append((quote_id, engagement_ids))

    return to_clean


async def run_repair(execute: bool):
    create_engine()
    create_sessionmaker()
    from app.db.session import async_session_maker

    async with async_session_maker() as session:
        if execute:
            logger.info("EXECUTE mode - changes will be applied")
        else:
            logger.info("DRY RUN mode - no changes will be applied")

        # 1. Spurious permanent locks
        spurious = await find_spurious_permanent_locks(session)
        logger.info(f"Found {len(spurious)} spurious permanent lock(s)")
        for opp_id, lock_id in spurious:
            logger.info(f"  - Opportunity {opp_id}: would remove lock {lock_id}")
            if execute:
                await session.execute(
                    delete(OpportunityPermanentLock).where(OpportunityPermanentLock.id == lock_id)
                )
                logger.info(f"    Removed lock {lock_id}")

        # 2. Orphaned engagements
        orphaned = await find_orphaned_engagements(session)
        logger.info(f"Found {len(orphaned)} quote(s) with orphaned engagements")
        for quote_id, engagement_ids in orphaned:
            logger.info(f"  - Quote {quote_id}: {len(engagement_ids)} engagement(s) to clean")
            if execute:
                # Delete timesheet entries first
                entries_result = await session.execute(
                    delete(TimesheetEntry).where(TimesheetEntry.engagement_id.in_(engagement_ids))
                )
                entries_deleted = entries_result.rowcount or 0
                logger.info(f"    Deleted {entries_deleted} timesheet entries")
                # Delete engagements
                for eng_id in engagement_ids:
                    await session.execute(delete(Engagement).where(Engagement.id == eng_id))
                logger.info(f"    Deleted {len(engagement_ids)} engagement(s)")

        if execute and (spurious or orphaned):
            await session.commit()
            logger.info("Repairs committed")
        elif execute:
            logger.info("No repairs to apply")


def main():
    parser = argparse.ArgumentParser(description="Repair locking state inconsistencies")
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Apply repairs (default is dry-run)",
    )
    args = parser.parse_args()
    asyncio.run(run_repair(execute=args.execute))


if __name__ == "__main__":
    main()

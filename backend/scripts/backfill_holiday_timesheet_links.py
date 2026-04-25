#!/usr/bin/env python3
"""
Backfill account_id, opportunity_id, engagement_id, engagement_phase_id on HOLIDAY timesheet rows.

Uses the same rules as live code: INTERNAL_COMPANY_ACCOUNT_ID + Opportunity per employee
Delivery Center + Engagement + PTO phase for the timesheet week.

Run inside Docker (from repo root):

    docker compose -f config/docker-compose.yaml exec backend \\
      python -m scripts.backfill_holiday_timesheet_links --execute

Omit --execute to dry-run (counts only). Requires INTERNAL_COMPANY_ACCOUNT_ID in backend/.env.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import create_engine, create_sessionmaker
from app.models.timesheet import Timesheet, TimesheetEntry, TimesheetEntryType
from app.services.internal_holiday_timesheet_links import resolve_holiday_row_targets

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def run(*, execute: bool) -> None:
    create_engine()
    maker = create_sessionmaker()

    async with maker() as session:
        q = (
            select(TimesheetEntry)
            .options(selectinload(TimesheetEntry.timesheet).selectinload(Timesheet.employee))
            .where(TimesheetEntry.entry_type == TimesheetEntryType.HOLIDAY)
        )
        result = await session.execute(q)
        entries = list(result.scalars().unique().all())
        updated = 0
        skipped_no_ts = 0
        for entry in entries:
            ts = entry.timesheet
            if not ts:
                skipped_no_ts += 1
                continue
            emp = ts.employee
            dc_id = emp.delivery_center_id if emp else None
            link = await resolve_holiday_row_targets(session, dc_id, ts.week_start_date)
            if not execute:
                updated += 1
                continue
            entry.account_id = link["account_id"]
            entry.account_display_name = link["account_display_name"]
            entry.engagement_display_name = link["engagement_display_name"]
            entry.opportunity_id = link["opportunity_id"]
            entry.engagement_id = link["engagement_id"]
            entry.engagement_phase_id = link["engagement_phase_id"]
            updated += 1
        if execute:
            await session.commit()
            logger.info("Committed backfill for %d HOLIDAY rows", updated)
        else:
            logger.info(
                "Dry run: would update %d HOLIDAY rows (skipped_no_timesheet=%s). Re-run with --execute.",
                updated,
                skipped_no_ts,
            )


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--execute", action="store_true", help="Apply updates (default is dry run)")
    args = p.parse_args()
    asyncio.run(run(execute=args.execute))


if __name__ == "__main__":
    main()

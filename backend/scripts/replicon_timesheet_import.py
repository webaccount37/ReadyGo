#!/usr/bin/env python3
"""
Replicon / time-export → Cortex timesheet migration CLI.

Primary path: Excel export at ``uploads/time_export_04252026.xlsx`` (or set
``REPLICON_TIMESHEET_EXPORT_XLSX``). Replicon HTTP APIs are optional when that file exists.

Always required: DATABASE_URL. For a full import (not ``--dry-run``):
``REPLICON_IMPORT_APPROVER_EMPLOYEE_ID`` (UUID of a DC or engagement approver).

Replicon Analytics (only if no Excel export is used): REPLICON_SERVICES_BASE_URL and
REPLICON_ACCESS_TOKEN or REPLICON_LOGIN_NAME + REPLICON_PASSWORD.

See deploy/db-prep README (Replicon section).

After a run, the summary line includes: raw, mapped, weeks, skipped_invoiced, lines_created,
rows_skipped_no_line_item, and row_status_workbook (annotated Excel copy path, or ``-``).
Excel imports also add ``Import Status`` / ``Import Detail`` columns; see README
``Per-row status workbook``.

Run from backend directory:

  python -m scripts.replicon_timesheet_import --dry-run
  python -m scripts.replicon_timesheet_import --from-excel ..\\uploads\\time_export_04252026.xlsx
  python -m scripts.replicon_timesheet_import --from-cache ..\\uploads\\replicon_cache\\extract_xxx.csv
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.session import create_engine, create_sessionmaker
from app.integrations.replicon.import_service import (
    RepliconTimesheetImportService,
    prefetch_token_check,
)
from app.integrations.replicon.settings import RepliconImportSettings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def _run(args: argparse.Namespace) -> int:
    if "DATABASE_URL" not in os.environ:
        logger.error("DATABASE_URL is not set")
        return 1

    settings = RepliconImportSettings.from_env()
    if args.mapping_xlsx:
        os.environ["REPLICON_MAPPING_XLSX"] = str(Path(args.mapping_xlsx).resolve())
        settings = RepliconImportSettings.from_env()

    create_engine()
    maker = create_sessionmaker()

    skip_prefetch = (
        args.from_cache
        or args.from_excel
        or args.skip_token_check
        or settings.uses_excel_timesheet_export()
    )
    if not skip_prefetch:
        await prefetch_token_check(settings)

    async with maker() as session:
        svc = RepliconTimesheetImportService(session, settings)
        cache_path = Path(args.from_cache).resolve() if args.from_cache else None
        excel_path = Path(args.from_excel).resolve() if args.from_excel else None
        summary = await svc.run(
            dry_run=args.dry_run,
            from_cache_path=cache_path,
            timesheet_export_path=excel_path,
            allow_zero_rows_after_filter=args.allow_zero_rows_after_filter,
            cache_extract=not args.no_cache_extract,
            row_status_output=Path(args.row_status_output).resolve() if args.row_status_output else None,
        )
        await session.commit()
        logger.info(
            "Replicon import summary: raw=%s mapped=%s weeks=%s skipped_invoiced=%s lines_created=%s "
            "rows_skipped_no_line_item=%s row_status_workbook=%s",
            summary.raw_rows,
            summary.mapped_rows,
            summary.weeks_processed,
            summary.weeks_skipped_invoiced,
            summary.engagement_lines_created,
            summary.rows_skipped_no_line_item,
            summary.row_status_output_path or "-",
        )
        for e in summary.errors[:50]:
            logger.error("import error: %s", e)
        if len(summary.errors) > 50:
            logger.error("... %d more errors omitted", len(summary.errors) - 50)
        return 0 if not summary.errors else 2


def main() -> None:
    p = argparse.ArgumentParser(description="Replicon timesheet import")
    p.add_argument("--dry-run", action="store_true", help="Parse and map only; no DB writes")
    p.add_argument("--from-cache", metavar="CSV", help="Use cached CSV instead of Excel/API")
    p.add_argument(
        "--from-excel",
        metavar="XLSX",
        help="Use a Replicon time export workbook (overrides default uploads/time_export_04252026.xlsx)",
    )
    p.add_argument(
        "--allow-zero-rows-after-filter",
        action="store_true",
        help="Allow DB phase when extract/mapping yields zero rows (dangerous)",
    )
    p.add_argument("--no-cache-extract", action="store_true", help="Do not write new extract CSV to cache dir")
    p.add_argument("--mapping-xlsx", help="Override path to replicon_mapping.xlsx")
    p.add_argument("--skip-token-check", action="store_true", help="Skip preflight token call")
    p.add_argument(
        "--row-status-output",
        metavar="XLSX",
        help="Write annotated copy of the time export with Import Status / Import Detail columns "
        "(overrides REPLICON_IMPORT_ROW_STATUS_XLSX)",
    )
    args = p.parse_args()
    raise SystemExit(asyncio.run(_run(args)))


if __name__ == "__main__":
    main()

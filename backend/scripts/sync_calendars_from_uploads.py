#!/usr/bin/env python3
"""
Sync delivery-center calendars from Excel files (*_calendar.xlsx) with columns NAME, DATE, HOURS.

Each file is matched to a delivery center by filename (e.g. australia_calendar.xlsx -> code
australia, northamerica_calendar.xlsx -> north-america). Rows upsert by date; rows for years
present in the file but dates not in the file are removed. Open timesheets get system holiday
rows refreshed from the updated calendar (same logic as loading a timesheet).

Usage (from repo root, with Docker Compose):

    docker compose -f config/docker-compose.yaml exec backend \\
      python -m scripts.sync_calendars_from_uploads --uploads-dir /uploads

Without --execute: validates files and prints what would run. With --execute: applies changes.

Local (Poetry), DATABASE_URL must point at your DB:

    cd backend && poetry run python -m scripts.sync_calendars_from_uploads \\
      --uploads-dir ../uploads --execute
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import re
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import openpyxl
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import create_engine, create_sessionmaker
from app.models.delivery_center import DeliveryCenter
from app.services.calendar_service import CalendarService

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# Filename slug (before _calendar) -> delivery_centers.code
FILE_SLUG_TO_DC_CODE: dict[str, str] = {
    "australia": "australia",
    "northamerica": "north-america",
    "philippines": "philippines",
    "thailand": "thailand",
}


def _normalize_slug(raw: str) -> str:
    s = raw.lower().strip()
    s = re.sub(r"[\s_]+", "", s)
    return s


def _slug_from_filename(path: Path) -> str | None:
    stem = path.stem.lower()
    if not stem.endswith("_calendar"):
        return None
    return _normalize_slug(stem[: -len("_calendar")])


def _cell_to_date(val: object, row_num: int) -> date:
    if val is None:
        raise ValueError(f"Row {row_num}: DATE is empty")
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    if isinstance(val, str):
        s = val.strip()[:10]
        return date.fromisoformat(s)
    if isinstance(val, (int, float)):
        from openpyxl.utils.datetime import from_excel

        return from_excel(val).date()
    raise ValueError(f"Row {row_num}: unsupported DATE type {type(val)!r}")


def _cell_to_hours(val: object, row_num: int) -> Decimal:
    if val is None or val == "":
        return Decimal("8")
    try:
        h = Decimal(str(val))
    except Exception as e:
        raise ValueError(f"Row {row_num}: invalid HOURS {val!r}") from e
    if h < 0 or h > Decimal("24"):
        raise ValueError(f"Row {row_num}: HOURS must be 0–24, got {h}")
    return h.quantize(Decimal("0.01"))


def _cell_to_name(val: object, row_num: int) -> str:
    if val is None:
        raise ValueError(f"Row {row_num}: NAME is empty")
    name = str(val).strip()
    if not name:
        raise ValueError(f"Row {row_num}: NAME is empty")
    return name[:255]


def parse_calendar_xlsx(path: Path) -> list[tuple[str, date, Decimal]]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        ws = wb.active
        rows_iter = ws.iter_rows(min_row=1, values_only=True)
        header = next(rows_iter, None)
        if not header:
            raise ValueError(f"{path.name}: empty workbook")

        def col_idx(name: str) -> int:
            up = [str(c).strip().upper() if c is not None else "" for c in header]
            try:
                return up.index(name.upper())
            except ValueError:
                raise ValueError(
                    f"{path.name}: header must include NAME, DATE, HOURS (found {header!r})"
                ) from None

        i_name = col_idx("NAME")
        i_date = col_idx("DATE")
        i_hours = col_idx("HOURS")

        out: list[tuple[str, date, Decimal]] = []
        for rnum, row in enumerate(rows_iter, start=2):
            if row is None or all(c is None or str(c).strip() == "" for c in row):
                continue
            name_cell = row[i_name] if i_name < len(row) else None
            date_cell = row[i_date] if i_date < len(row) else None
            hours_cell = row[i_hours] if i_hours < len(row) else None
            if name_cell is None and date_cell is None and hours_cell is None:
                continue
            out.append(
                (
                    _cell_to_name(name_cell, rnum),
                    _cell_to_date(date_cell, rnum),
                    _cell_to_hours(hours_cell, rnum),
                )
            )
        return out
    finally:
        wb.close()


async def _resolve_delivery_center_id(session: AsyncSession, code: str):
    result = await session.execute(select(DeliveryCenter).where(DeliveryCenter.code == code))
    return result.scalar_one_or_none()


async def _run_main(uploads_dir: Path, execute: bool) -> int:
    files = sorted(uploads_dir.glob("*_calendar.xlsx"))
    if not files:
        logger.error("No *_calendar.xlsx files under %s", uploads_dir)
        return 1

    create_engine()
    maker = create_sessionmaker()

    async with maker() as session:
        plans: list[tuple[Path, str, list[tuple[str, date, Decimal]]]] = []
        for path in files:
            slug = _slug_from_filename(path)
            if not slug:
                logger.warning("Skip %s (expected name like australia_calendar.xlsx)", path.name)
                continue
            code = FILE_SLUG_TO_DC_CODE.get(slug)
            if not code:
                logger.error(
                    "Unknown region slug %r from %s. Add a mapping in FILE_SLUG_TO_DC_CODE.",
                    slug,
                    path.name,
                )
                return 1
            dc = await _resolve_delivery_center_id(session, code)
            if not dc:
                logger.error("No delivery center with code %r (file %s)", code, path.name)
                return 1
            rows = parse_calendar_xlsx(path)
            if not rows:
                logger.error("%s: no data rows after header", path.name)
                return 1
            years = sorted({d.year for _, d, _ in rows})
            logger.info(
                "Prepared %s -> %s (%s): %d rows, years %s",
                path.name,
                code,
                dc.name,
                len(rows),
                years,
            )
            plans.append((path, str(dc.id), rows))

        if not execute:
            logger.info("Dry run only (pass --execute to apply).")
            return 0

        for path, dc_id_str, rows in plans:
            svc = CalendarService(session)
            stats = await svc.sync_delivery_center_from_named_rows(UUID(dc_id_str), rows)
            logger.info("Synced %s: %s", path.name, stats)

    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--uploads-dir",
        type=Path,
        default=Path("/uploads"),
        help="Directory containing *_calendar.xlsx (default /uploads in Docker)",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Apply sync to the database (default is validate-only)",
    )
    args = parser.parse_args()
    uploads_dir = args.uploads_dir.resolve()
    if not uploads_dir.is_dir():
        logger.error("Not a directory: %s", uploads_dir)
        sys.exit(1)
    sys.exit(asyncio.run(_run_main(uploads_dir, args.execute)))


if __name__ == "__main__":
    main()

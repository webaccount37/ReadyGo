#!/usr/bin/env python3
"""
Prune billable EngagementLineItem rows that are not backed by the engagement's quote Estimate.

For engagements under opportunities tied (via replicon_mapping.xlsx) to specific Replicon projects,
compares billable engagement lines to billable estimate lines on ``quotes.estimate_id`` using
(role_rates_id, employee_id, payable_center_id). Keeps up to the multiset count from the estimate
per signature (lowest row_order, then id). Deletes extras and any signature absent from the estimate.

Non-billable engagement line items are never removed.

Also removes timesheet entries and dismissed-row keys for deleted line items, and nulls
expense_lines.engagement_line_item_id where needed.

Usage (Docker):

  docker compose -f config/docker-compose.yaml exec -T backend \\
    python -m scripts.prune_engagement_lines_not_on_estimate

  docker compose -f config/docker-compose.yaml exec -T backend \\
    python -m scripts.prune_engagement_lines_not_on_estimate --execute \\
    --mapping-xlsx /uploads/replicon_mapping.xlsx
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import re
import sys
from collections import Counter
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, select, update
from sqlalchemy.orm import selectinload

from app.db.session import create_engine, create_sessionmaker
from app.integrations.replicon.mapping_workbook import load_mapping_workbook
from app.models.engagement import Engagement, EngagementLineItem
from app.models.estimate import EstimateLineItem
from app.models.expense import ExpenseLine
from app.models.timesheet import TimesheetDismissedRow, TimesheetEntry

logger = logging.getLogger(__name__)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


# Replicon project names (normalized like mapping workbook keys: lower, collapsed whitespace).
TARGET_REPLICON_PROJECTS_NORM = frozenset(
    {
        _norm(p)
        for p in (
            "Coles Liquor - Apollo Programme Manager",
            "Coles Liquor - Project Management",
            "Home Steaders - Love Always",
            "Home Steaders - Love Always Phase 3",
            "Lovisa - Business Analysis",
            "Planning RFP Extension #1",
            "Wipro Stock Ledger",
        )
    }
)


def _line_sig(li: EngagementLineItem | EstimateLineItem) -> tuple[UUID, UUID | None, UUID | None]:
    return (li.role_rates_id, li.employee_id, li.payable_center_id)


async def _opportunity_ids_for_targets(session, mapping_path: Path) -> set[UUID]:
    mapping = await load_mapping_workbook(session, mapping_path)
    opp_ids: set[UUID] = set()
    for rule in mapping.values():
        if not rule.candidates:
            continue
        rp = _norm(rule.candidates[0].record.replicon_project)
        if rp not in TARGET_REPLICON_PROJECTS_NORM:
            continue
        for c in rule.candidates:
            rec = c.record
            if rec.cortex_type == "ENGAGEMENT":
                opp_ids.add(rec.opportunity_id)
    return opp_ids


def _line_ids_to_prune_for_engagement(
    billable_eng_lines: list[EngagementLineItem],
    billable_est_lines: list[EstimateLineItem],
) -> list[UUID]:
    """Return engagement line item ids to delete for one engagement."""
    est_counts: Counter[tuple[UUID, UUID | None, UUID | None]] = Counter()
    for li in billable_est_lines:
        if li.billable:
            est_counts[_line_sig(li)] += 1

    # Group billable engagement lines by signature, stable sort
    by_sig: dict[tuple[UUID, UUID | None, UUID | None], list[EngagementLineItem]] = {}
    for li in billable_eng_lines:
        if not li.billable:
            continue
        by_sig.setdefault(_line_sig(li), []).append(li)
    for sig in by_sig:
        by_sig[sig].sort(key=lambda x: (x.row_order, str(x.id)))

    to_delete: list[UUID] = []
    for sig, eng_rows in by_sig.items():
        allowed = est_counts.get(sig, 0)
        if allowed >= len(eng_rows):
            continue
        # Keep first ``allowed`` rows (aligned to estimate multiset); remove the rest
        extras = eng_rows[allowed:]
        to_delete.extend(li.id for li in extras)
    return to_delete


async def _run(mapping_xlsx: Path, *, execute: bool) -> int:
    create_engine()
    maker = create_sessionmaker()
    async with maker() as session:
        opp_ids = await _opportunity_ids_for_targets(session, mapping_xlsx)
        if not opp_ids:
            logger.warning("No opportunities found for target Replicon projects in %s", mapping_xlsx)
            return 0
        logger.info("Scoped opportunities: %d (%s)", len(opp_ids), ", ".join(sorted(str(x) for x in opp_ids)[:20]))

        r = await session.execute(
            select(Engagement)
            .where(Engagement.opportunity_id.in_(opp_ids))
            .options(
                selectinload(Engagement.line_items),
                selectinload(Engagement.quote),
            )
        )
        engagements = list(r.scalars().unique().all())
        if not engagements:
            logger.warning("No engagements for scoped opportunities")
            return 0

        est_ids: set[UUID] = set()
        for eng in engagements:
            if eng.quote:
                est_ids.add(eng.quote.estimate_id)
        if not est_ids:
            logger.warning("No estimate ids from engagements' quotes")
            return 0

        r2 = await session.execute(
            select(EstimateLineItem).where(
                EstimateLineItem.estimate_id.in_(est_ids),
                EstimateLineItem.billable.is_(True),
            )
        )
        est_lines = list(r2.scalars().all())
        est_by_estimate: dict[UUID, list[EstimateLineItem]] = {}
        for li in est_lines:
            est_by_estimate.setdefault(li.estimate_id, []).append(li)

        all_delete_ids: list[UUID] = []
        for eng in engagements:
            if not eng.quote:
                logger.warning("Engagement %s has no quote; skipping", eng.id)
                continue
            eid = eng.quote.estimate_id
            est_for_eng = est_by_estimate.get(eid, [])
            billable_eng = [li for li in (eng.line_items or []) if li.billable]
            if not billable_eng:
                continue
            ids = _line_ids_to_prune_for_engagement(billable_eng, est_for_eng)
            if ids:
                logger.info(
                    "Engagement %s (%s): prune %d billable line item(s) not on estimate %s",
                    eng.id,
                    eng.name,
                    len(ids),
                    eid,
                )
                all_delete_ids.extend(ids)

        if not all_delete_ids:
            logger.info("Nothing to prune")
            return 0

        uniq = list(dict.fromkeys(all_delete_ids))
        logger.info("Total line items to delete: %d (unique %d)", len(all_delete_ids), len(uniq))

        if not execute:
            logger.info("Dry-run only; pass --execute to apply")
            return 0

        # Timesheet entries (FK has no CASCADE to line item in ORM)
        te = await session.execute(delete(TimesheetEntry).where(TimesheetEntry.engagement_line_item_id.in_(uniq)))
        logger.info("Deleted %s timesheet_entries", te.rowcount or 0)

        td = await session.execute(
            delete(TimesheetDismissedRow).where(TimesheetDismissedRow.engagement_line_item_id.in_(uniq))
        )
        logger.info("Deleted %s timesheet_dismissed_rows", td.rowcount or 0)

        ex = await session.execute(
            update(ExpenseLine)
            .where(ExpenseLine.engagement_line_item_id.in_(uniq))
            .values(engagement_line_item_id=None)
        )
        logger.info("Nulled engagement_line_item_id on %s expense_lines", ex.rowcount or 0)

        eli = await session.execute(delete(EngagementLineItem).where(EngagementLineItem.id.in_(uniq)))
        logger.info("Deleted %s engagement_line_items", eli.rowcount or 0)

        await session.commit()
        logger.info("Committed")
        return len(uniq)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    p = argparse.ArgumentParser(description="Prune engagement RP lines not on quote estimate")
    p.add_argument(
        "--mapping-xlsx",
        type=Path,
        default=None,
        help="Path to replicon_mapping.xlsx (default: REPLICON_MAPPING_XLSX or uploads/replicon_mapping.xlsx)",
    )
    p.add_argument("--execute", action="store_true", help="Apply changes (default is dry-run listing only)")
    args = p.parse_args()
    import os

    mp = args.mapping_xlsx
    if mp is None:
        raw = (os.environ.get("REPLICON_MAPPING_XLSX") or "").strip()
        if raw:
            mp = Path(raw)
        else:
            docker_uploads = Path("/uploads/replicon_mapping.xlsx")
            if docker_uploads.is_file():
                mp = docker_uploads
            else:
                mp = Path(__file__).resolve().parent.parent.parent / "uploads" / "replicon_mapping.xlsx"
    if not mp.is_file():
        logger.error("Mapping workbook not found: %s", mp)
        raise SystemExit(1)

    execute = bool(args.execute)

    rc = asyncio.run(_run(mp, execute=execute))
    raise SystemExit(0 if rc >= 0 else 1)


if __name__ == "__main__":
    main()

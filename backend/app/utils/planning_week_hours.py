"""
Count weekly planning hours the same way the estimate spreadsheet and staffing grids do.

A week is Sunday–Saturday (week_start_date is Sunday). Hours count only when that week
overlaps the line item's start/end dates, and (for estimate-style totals) the opportunity
date window with the same fallbacks as the frontend estimate page.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Iterable, Optional, Tuple, Union


def _as_date(d: Union[date, datetime]) -> date:
    if isinstance(d, datetime):
        return d.date()
    return d


def week_interval_overlaps_range(week_start: date, range_start: date, range_end: date) -> bool:
    """True if [week_start, week_start+6] intersects [range_start, range_end] (inclusive)."""
    week_end = week_start + timedelta(days=6)
    return week_start <= range_end and week_end >= range_start


def _add_calendar_months(d: date, months: int) -> date:
    """Add calendar months (matches JS Date.setMonth semantics for typical business dates)."""
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    day = min(d.day, last_day)
    return date(year, month, day)


def _subtract_one_calendar_year(d: date) -> date:
    """Match JS: opportunityStart.setFullYear(opportunityEnd.getFullYear() - 1)."""
    try:
        return d.replace(year=d.year - 1)
    except ValueError:
        return date(d.year - 1, d.month, 28)


def resolve_opportunity_scope_for_estimate(
    opportunity_start: Optional[date],
    opportunity_end: Optional[date],
    today: Optional[date] = None,
) -> Tuple[date, date]:
    """
    Resolve (start, end) for filtering weekly rows, aligned with estimate-spreadsheet.tsx:
    - neither: today - 1 month through +12 months from that start
    - start only: start through start + 12 months
    - end only: end - 1 calendar year through end
    - both: as given
    """
    anchor = today or date.today()
    if opportunity_start is None and opportunity_end is None:
        start = _add_calendar_months(anchor, -1)
        end = _add_calendar_months(start, 12)
        return start, end
    if opportunity_start is not None and opportunity_end is None:
        try:
            return opportunity_start, opportunity_start.replace(year=opportunity_start.year + 1)
        except ValueError:
            return opportunity_start, date(opportunity_start.year + 1, opportunity_start.month, 28)
    if opportunity_start is None and opportunity_end is not None:
        return _subtract_one_calendar_year(opportunity_end), opportunity_end
    assert opportunity_start is not None and opportunity_end is not None
    return opportunity_start, opportunity_end


def weekly_row_counts_toward_totals(
    week_start: date,
    line_start: date,
    line_end: date,
    opportunity_scope: Optional[Tuple[date, date]],
) -> bool:
    """Whether a weekly_hours row should contribute to scoped totals."""
    if not week_interval_overlaps_range(week_start, line_start, line_end):
        return False
    if opportunity_scope is None:
        return True
    scope_start, scope_end = opportunity_scope
    return week_interval_overlaps_range(week_start, scope_start, scope_end)


def sum_counted_weekly_hours_for_line(
    line_start: Union[date, datetime],
    line_end: Union[date, datetime],
    weekly_rows: Iterable[Any],
    opportunity_scope: Optional[Tuple[date, date]] = None,
) -> Decimal:
    """Sum hours for weekly rows that overlap the line window and optional opportunity scope."""
    line_start_d = _as_date(line_start)
    line_end_d = _as_date(line_end)
    total = Decimal("0")
    for row in weekly_rows or ():
        ws_raw = getattr(row, "week_start_date", None)
        if ws_raw is None:
            continue
        if isinstance(ws_raw, datetime):
            ws = ws_raw.date()
        elif isinstance(ws_raw, date):
            ws = ws_raw
        else:
            continue
        if not weekly_row_counts_toward_totals(ws, line_start_d, line_end_d, opportunity_scope):
            continue
        total += Decimal(str(getattr(row, "hours", 0) or 0))
    return total


def sum_billable_counted_hours_for_estimate(
    line_items: Iterable[Any],
    opportunity_scope: Optional[Tuple[date, date]],
) -> Decimal:
    """Billable line items only; same hour filter as sum_counted_weekly_hours_for_line."""
    total = Decimal("0")
    for line_item in line_items or ():
        if not getattr(line_item, "billable", True):
            continue
        ls = getattr(line_item, "start_date", None)
        le = getattr(line_item, "end_date", None)
        if ls is None or le is None:
            continue
        ls_d = _as_date(ls)
        le_d = _as_date(le)
        total += sum_counted_weekly_hours_for_line(
            ls_d, le_d, getattr(line_item, "weekly_hours", None) or (), opportunity_scope
        )
    return total

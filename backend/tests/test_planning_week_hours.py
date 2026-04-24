"""Tests for planning_week_hours (scoped weekly hour totals)."""

from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.utils.planning_week_hours import (
    resolve_opportunity_scope_for_estimate,
    sum_billable_counted_hours_for_estimate,
    sum_counted_weekly_hours_for_line,
    week_does_not_overlap_line_range,
    week_interval_overlaps_range,
    weekly_row_counts_toward_totals,
)


def test_week_interval_overlaps_range_fully_inside():
    week_start = date(2024, 3, 3)  # Sunday
    assert week_interval_overlaps_range(week_start, date(2024, 3, 1), date(2024, 3, 31))


def test_week_interval_overlaps_range_partial_before():
    # Week Mar 3–9 overlaps range starting Mar 5
    week_start = date(2024, 3, 3)
    assert week_interval_overlaps_range(week_start, date(2024, 3, 5), date(2024, 3, 20))


def test_week_interval_overlaps_range_partial_after():
    week_start = date(2024, 3, 10)
    assert week_interval_overlaps_range(week_start, date(2024, 3, 1), date(2024, 3, 12))


def test_week_interval_overlaps_range_no_overlap():
    week_start = date(2024, 3, 3)
    assert not week_interval_overlaps_range(week_start, date(2024, 4, 1), date(2024, 4, 30))


def test_week_does_not_overlap_line_range_matches_inversion_of_overlap():
    week = date(2024, 3, 3)
    ls, le = date(2024, 2, 1), date(2024, 5, 31)
    assert week_does_not_overlap_line_range(week, ls, le) == (not week_interval_overlaps_range(week, ls, le))
    before = date(2024, 1, 7)
    assert week_does_not_overlap_line_range(before, date(2024, 2, 1), date(2024, 3, 1))
    assert not week_does_not_overlap_line_range(before, date(2024, 1, 1), date(2024, 1, 31))


def test_weekly_row_counts_line_only_excludes_orphan_week():
    line_start = date(2024, 2, 19)
    line_end = date(2024, 5, 31)
    orphan_week = date(2024, 1, 7)  # Sunday before line
    assert not weekly_row_counts_toward_totals(orphan_week, line_start, line_end, None)
    inside_week = date(2024, 3, 3)
    assert weekly_row_counts_toward_totals(inside_week, line_start, line_end, None)


def test_weekly_row_counts_with_opportunity_scope():
    line_start = date(2024, 2, 19)
    line_end = date(2024, 5, 31)
    opp_start = date(2024, 2, 18)
    opp_end = date(2024, 5, 20)
    week_inside_both = date(2024, 3, 3)
    assert weekly_row_counts_toward_totals(
        week_inside_both, line_start, line_end, (opp_start, opp_end)
    )
    # Week overlaps extended line but not opportunity window
    week_after_opp = date(2024, 5, 26)  # Sun May 26 – Sat Jun 1
    assert not weekly_row_counts_toward_totals(
        week_after_opp, line_start, line_end, (opp_start, opp_end)
    )


def test_sum_counted_weekly_hours_excludes_outside_line():
    rows = [
        SimpleNamespace(week_start_date=date(2024, 1, 7), hours="40"),  # before line
        SimpleNamespace(week_start_date=date(2024, 3, 3), hours="40"),
    ]
    total = sum_counted_weekly_hours_for_line(
        date(2024, 2, 19),
        date(2024, 5, 31),
        rows,
        opportunity_scope=None,
    )
    assert total == Decimal("40")


def test_sum_billable_counted_hours_respects_scope():
    line_items = [
        SimpleNamespace(
            billable=True,
            start_date=date(2024, 2, 19),
            end_date=date(2024, 5, 31),
            weekly_hours=[
                SimpleNamespace(week_start_date=date(2024, 1, 7), hours="40"),
                SimpleNamespace(week_start_date=date(2024, 3, 3), hours="40"),
            ],
        )
    ]
    scope = (date(2024, 2, 18), date(2024, 5, 30))
    total = sum_billable_counted_hours_for_estimate(line_items, scope)
    assert total == Decimal("40")


def test_resolve_opportunity_scope_both_set():
    s, e = resolve_opportunity_scope_for_estimate(date(2024, 1, 1), date(2024, 6, 1))
    assert s == date(2024, 1, 1) and e == date(2024, 6, 1)


def test_resolve_opportunity_scope_neither_uses_anchor():
    anchor = date(2024, 6, 15)
    s, e = resolve_opportunity_scope_for_estimate(None, None, today=anchor)
    assert s < anchor
    assert e > s


def test_resolve_opportunity_scope_start_only_extends_end():
    s, e = resolve_opportunity_scope_for_estimate(date(2024, 2, 1), None, today=date(2024, 6, 1))
    assert s == date(2024, 2, 1)
    assert e > s


def test_resolve_opportunity_scope_end_only_extends_start():
    s, e = resolve_opportunity_scope_for_estimate(None, date(2024, 12, 1), today=date(2024, 6, 1))
    assert e == date(2024, 12, 1)
    assert s < e

"""Unit tests for financial forecast week/month split helpers."""

from datetime import date, timedelta
from decimal import Decimal

from app.db.repositories.financial_forecast_repository import _split_week_amount_by_month


def test_split_week_amount_spans_two_months():
    # Sunday 2026-03-29 week spans March and April
    week_start = date(2026, 3, 29)
    range_start = date(2026, 3, 1)
    range_end = date(2026, 4, 30)
    parts = _split_week_amount_by_month(week_start, Decimal("700"), range_start, range_end)
    assert "2026-03" in parts and "2026-04" in parts
    assert sum(parts.values()) == Decimal("700")


def test_split_week_respects_range():
    week_start = date(2026, 1, 4)
    range_start = date(2026, 1, 5)
    range_end = date(2026, 1, 10)
    parts = _split_week_amount_by_month(week_start, Decimal("100"), range_start, range_end)
    # Only Wed–Sat in range = 4 days of 7
    assert sum(parts.values()) == Decimal("100")

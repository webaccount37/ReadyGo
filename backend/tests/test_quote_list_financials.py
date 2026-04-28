"""Tests for quote list financial summary (aligned with scoped weekly hours)."""

from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.models.quote import QuoteType, RateBillingUnit
from app.utils.quote_list_financials import compute_quote_list_financial_summary


def _line(
    *,
    start: date,
    end: date,
    rate: str,
    cost: str,
    billable: bool = True,
    weekly_hours: tuple = (),
):
    return SimpleNamespace(
        start_date=start,
        end_date=end,
        rate=rate,
        cost=cost,
        billable=billable,
        weekly_hours=weekly_hours,
    )


def test_compute_summary_time_materials_revenue_and_margin():
    opp_start = date(2024, 2, 1)
    opp_end = date(2024, 5, 31)
    lines = (
        _line(
            start=date(2024, 2, 19),
            end=date(2024, 5, 31),
            rate="100",
            cost="50",
            weekly_hours=(SimpleNamespace(week_start_date=date(2024, 3, 3), hours="10"),),
        ),
    )
    out = compute_quote_list_financial_summary(
        lines,
        opp_start,
        opp_end,
        quote_type=QuoteType.TIME_MATERIALS,
        target_amount=None,
        rate_billing_unit=RateBillingUnit.HOURLY_ACTUALS,
        blended_rate_amount=None,
        default_currency="USD",
    )
    assert out["total_billable_hours"] == Decimal("10")
    assert out["total_cost"] == Decimal("500")
    assert out["total_revenue"] == Decimal("1000")
    assert out["margin_amount"] == Decimal("500")
    assert out["quote_amount"] == Decimal("1000")


def test_compute_summary_fixed_bid_quote_amount():
    opp_start = date(2024, 2, 1)
    opp_end = date(2024, 5, 31)
    lines = ()
    out = compute_quote_list_financial_summary(
        lines,
        opp_start,
        opp_end,
        quote_type=QuoteType.FIXED_BID,
        target_amount=Decimal("50000"),
        rate_billing_unit=None,
        blended_rate_amount=None,
        default_currency="EUR",
    )
    assert out["quote_amount"] == Decimal("50000")
    assert out["currency"] == "EUR"


def test_compute_summary_blended_rate():
    opp_start = date(2024, 2, 1)
    opp_end = date(2024, 5, 31)
    lines = (
        _line(
            start=date(2024, 2, 19),
            end=date(2024, 5, 31),
            rate="200",
            cost="80",
            weekly_hours=(SimpleNamespace(week_start_date=date(2024, 3, 3), hours="8"),),
        ),
    )
    out = compute_quote_list_financial_summary(
        lines,
        opp_start,
        opp_end,
        quote_type=QuoteType.TIME_MATERIALS,
        target_amount=None,
        rate_billing_unit=RateBillingUnit.HOURLY_BLENDED,
        blended_rate_amount=Decimal("150"),
        default_currency="USD",
    )
    assert out["total_billable_hours"] == Decimal("8")
    assert out["quote_amount"] == Decimal("8") * Decimal("150")


def test_non_billable_hours_excluded_from_billable_total():
    opp_start = date(2024, 2, 1)
    opp_end = date(2024, 5, 31)
    lines = (
        _line(
            start=date(2024, 2, 19),
            end=date(2024, 5, 31),
            rate="100",
            cost="40",
            billable=False,
            weekly_hours=(SimpleNamespace(week_start_date=date(2024, 3, 3), hours="40"),),
        ),
    )
    out = compute_quote_list_financial_summary(
        lines,
        opp_start,
        opp_end,
        quote_type=QuoteType.TIME_MATERIALS,
        target_amount=None,
        rate_billing_unit=RateBillingUnit.HOURLY_BLENDED,
        blended_rate_amount=Decimal("100"),
        default_currency="USD",
    )
    assert out["total_billable_hours"] == Decimal("0")
    assert out["total_revenue"] == Decimal("0")
    assert out["quote_amount"] == Decimal("0")

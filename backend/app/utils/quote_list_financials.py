"""
Financial totals for the quotes list, aligned with estimate-scoped weekly hour rules.
Uses quote snapshot line items (not live estimates), matching the former client-side summary.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Iterable, Optional

from app.models.quote import QuoteLineItem, QuoteType, RateBillingUnit
from app.utils.planning_week_hours import (
    resolve_opportunity_scope_for_estimate,
    sum_counted_weekly_hours_for_line,
)


def compute_quote_list_financial_summary(
    line_items: Iterable[QuoteLineItem],
    opportunity_start,
    opportunity_end,
    *,
    quote_type: Optional[QuoteType],
    target_amount: Optional[Decimal],
    rate_billing_unit: Optional[RateBillingUnit],
    blended_rate_amount: Optional[Decimal],
    default_currency: str,
) -> dict:
    """
    Returns dict with keys: total_cost, total_revenue, total_billable_hours,
    margin_amount, margin_percentage, quote_amount, currency.
    """
    scope = resolve_opportunity_scope_for_estimate(opportunity_start, opportunity_end)

    total_cost = Decimal("0")
    total_revenue = Decimal("0")
    total_billable_hours = Decimal("0")

    for line_item in line_items or ():
        item_hours = sum_counted_weekly_hours_for_line(
            line_item.start_date,
            line_item.end_date,
            line_item.weekly_hours or (),
            opportunity_scope=scope,
        )
        item_cost = item_hours * Decimal(str(line_item.cost))
        item_revenue = (
            item_hours * Decimal(str(line_item.rate)) if line_item.billable else Decimal("0")
        )
        total_cost += item_cost
        total_revenue += item_revenue
        if line_item.billable:
            total_billable_hours += item_hours

    margin_amount = total_revenue - total_cost
    margin_percentage = (
        (margin_amount / total_revenue * Decimal("100")) if total_revenue > 0 else Decimal("0")
    )

    quote_amount = Decimal("0")
    if quote_type == QuoteType.FIXED_BID:
        quote_amount = Decimal(str(target_amount or 0))
    elif quote_type == QuoteType.TIME_MATERIALS:
        if rate_billing_unit in (RateBillingUnit.HOURLY_BLENDED, RateBillingUnit.DAILY_BLENDED):
            blended = Decimal(str(blended_rate_amount or 0))
            quote_amount = total_billable_hours * blended
        else:
            quote_amount = total_revenue

    return {
        "total_cost": total_cost,
        "total_revenue": total_revenue,
        "total_billable_hours": total_billable_hours,
        "margin_amount": margin_amount,
        "margin_percentage": margin_percentage,
        "quote_amount": quote_amount,
        "currency": default_currency or "USD",
    }

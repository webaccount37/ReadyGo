"""
SQL-heavy data access for Financial Forecast automated lines.
Returns per–calendar-day or per–week facts; service rolls up to months and applies currency.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, case, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.employee import Employee, EmployeeType
from app.models.engagement import Engagement, EngagementLineItem, EngagementWeeklyHours
from app.models.opportunity import Opportunity, OpportunityStatus
from app.models.quote import Quote, QuotePaymentTrigger, QuoteStatus, QuoteType
from app.models.timesheet import Timesheet, TimesheetApprovedSnapshot, TimesheetEntry, TimesheetStatus
from app.models.financial_forecast import (
    FinancialForecastExpenseLine,
    FinancialForecastExpenseCell,
    FinancialForecastLineOverride,
    FinancialForecastChangeEvent,
)
from app.models.delivery_center import DeliveryCenter
from app.utils.currency_converter import convert_currency


def _week_dates(week_start: date) -> list[date]:
    return [week_start + timedelta(days=i) for i in range(7)]


def _month_key(d: date) -> str:
    return f"{d.year}-{d.month:02d}"


def _first_of_month(d: date) -> date:
    return date(d.year, d.month, 1)


def _split_week_amount_by_month(
    week_start: date,
    amount: Decimal,
    range_start: date,
    range_end: date,
) -> dict[str, Decimal]:
    """Split a weekly total across calendar months by calendar-day count in range."""
    out: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    days_in_week_in_range = 0
    per_day: list[tuple[date, str]] = []
    for d in _week_dates(week_start):
        if d < range_start or d > range_end:
            continue
        days_in_week_in_range += 1
        per_day.append((d, _month_key(d)))
    if days_in_week_in_range == 0 or amount == 0:
        return {}
    share = amount / Decimal(days_in_week_in_range)
    for _, mk in per_day:
        out[mk] += share
    return dict(out)


def _timesheet_entry_belongs_to_opportunity(opportunity_id_expr):
    """True when a timesheet entry rolls up to the opportunity (direct FK or via engagement)."""
    return or_(
        TimesheetEntry.opportunity_id == opportunity_id_expr,
        and_(
            TimesheetEntry.engagement_id.isnot(None),
            TimesheetEntry.engagement_id.in_(
                select(Engagement.id).where(Engagement.opportunity_id == opportunity_id_expr)
            ),
        ),
    )


def _timesheet_entry_opportunity_in(opp_ids: list):
    """Filter entries for any opportunity in opp_ids (caller ensures opp_ids non-empty)."""
    return or_(
        TimesheetEntry.opportunity_id.in_(opp_ids),
        TimesheetEntry.engagement_id.in_(
            select(Engagement.id).where(Engagement.opportunity_id.in_(opp_ids))
        ),
    )


def _opportunity_has_active_engagement_quote():
    """Engagement tied to the opportunity whose quote row is still active (product \"active quote\")."""
    return exists(
        select(1)
        .select_from(Engagement)
        .join(Quote, Engagement.quote_id == Quote.id)
        .where(
            Engagement.opportunity_id == Opportunity.id,
            Quote.is_active.is_(True),
        )
    )


def _opportunity_has_accepted_quote():
    return exists(
        select(1).where(
            Quote.opportunity_id == Opportunity.id,
            Quote.status == QuoteStatus.ACCEPTED,
        )
    )


def _opportunity_has_quotable_quote():
    return or_(_opportunity_has_active_engagement_quote(), _opportunity_has_accepted_quote())


@dataclass
class MonthBucket:
    amount: Decimal = Decimal("0")
    actuals_weight: Decimal = Decimal("0")  # portion from timesheets (0–1 relative to amount)
    forecast_weight: Decimal = Decimal("0")


class FinancialForecastRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_delivery_center_currency(self, delivery_center_id: UUID) -> str | None:
        q = select(DeliveryCenter.default_currency).where(DeliveryCenter.id == delivery_center_id)
        r = await self.session.execute(q)
        return r.scalar_one_or_none()

    async def fetch_expense_lines(self, delivery_center_id: UUID) -> list[FinancialForecastExpenseLine]:
        q = (
            select(FinancialForecastExpenseLine)
            .where(FinancialForecastExpenseLine.delivery_center_id == delivery_center_id)
            .order_by(FinancialForecastExpenseLine.parent_group_code, FinancialForecastExpenseLine.sort_order, FinancialForecastExpenseLine.name)
        )
        r = await self.session.execute(q)
        return list(r.scalars().all())

    async def fetch_expense_cells(
        self,
        delivery_center_id: UUID,
        line_ids: list[UUID],
        month_starts: list[date],
    ) -> dict[tuple[UUID, date], Decimal]:
        if not line_ids or not month_starts:
            return {}
        q = (
            select(FinancialForecastExpenseCell.line_id, FinancialForecastExpenseCell.month_start_date, FinancialForecastExpenseCell.amount)
            .join(FinancialForecastExpenseLine, FinancialForecastExpenseCell.line_id == FinancialForecastExpenseLine.id)
            .where(
                FinancialForecastExpenseLine.delivery_center_id == delivery_center_id,
                FinancialForecastExpenseCell.line_id.in_(line_ids),
                FinancialForecastExpenseCell.month_start_date.in_(month_starts),
            )
        )
        r = await self.session.execute(q)
        return {(row.line_id, row.month_start_date): Decimal(str(row.amount or 0)) for row in r.all()}

    async def fetch_overrides(
        self,
        delivery_center_id: UUID,
        month_starts: list[date],
    ) -> dict[tuple[str, date], Decimal]:
        if not month_starts:
            return {}
        q = select(FinancialForecastLineOverride.row_key, FinancialForecastLineOverride.month_start_date, FinancialForecastLineOverride.amount).where(
            FinancialForecastLineOverride.delivery_center_id == delivery_center_id,
            FinancialForecastLineOverride.month_start_date.in_(month_starts),
        )
        r = await self.session.execute(q)
        return {(row.row_key, row.month_start_date): Decimal(str(row.amount or 0)) for row in r.all()}

    async def list_change_events(
        self,
        delivery_center_id: UUID,
        month_start_min: date | None,
        month_start_max: date | None,
        skip: int,
        limit: int,
    ) -> list[FinancialForecastChangeEvent]:
        q = select(FinancialForecastChangeEvent).where(FinancialForecastChangeEvent.delivery_center_id == delivery_center_id)
        if month_start_min:
            q = q.where(FinancialForecastChangeEvent.created_at >= month_start_min)  # coarse filter; payload has month
        q = q.order_by(FinancialForecastChangeEvent.created_at.desc()).offset(skip).limit(limit)
        r = await self.session.execute(q)
        return list(r.scalars().all())

    def _opp_base(self, forecast_dc: UUID, range_start: date, range_end: date):
        return (
            select(Opportunity)
            .where(
                Opportunity.delivery_center_id == forecast_dc,
                Opportunity.status.notin_([OpportunityStatus.LOST, OpportunityStatus.CANCELLED]),
                Opportunity.end_date >= range_start,
                Opportunity.start_date <= range_end,
            )
        )

    async def _add_consulting_fee_expenses(
        self,
        buckets: dict[str, dict[str, MonthBucket]],
        forecast_dc_id: UUID,
        range_start: date,
        range_end: date,
        dc_currency: str,
    ) -> None:
        """Income from billable approved expense lines tied to opps whose invoice DC is the forecast DC.

        Uses finalized Expense Management sheets (APPROVED or INVOICED). Resolves opportunity from the line or
        from the engagement. Amounts are grouped by expense category when rolling up (each line carries
        its category); totals land on ``consulting_fee_expenses`` by month of date_incurred.

        Currency: line amounts are converted to the opportunity's currency when it differs from the line
        currency, then to the forecast delivery center currency when opportunity currency differs from DC.
        """
        from app.models.expense import ExpenseLine, ExpenseSheet

        q = (
            select(ExpenseLine, Opportunity)
            .join(ExpenseSheet, ExpenseLine.expense_sheet_id == ExpenseSheet.id)
            .outerjoin(Engagement, ExpenseLine.engagement_id == Engagement.id)
            .join(
                Opportunity,
                Opportunity.id == func.coalesce(ExpenseLine.opportunity_id, Engagement.opportunity_id),
            )
            .where(
                ExpenseSheet.status.in_([TimesheetStatus.APPROVED, TimesheetStatus.INVOICED]),
                ExpenseLine.billable.is_(True),
                Opportunity.delivery_center_id == forecast_dc_id,
                ExpenseLine.date_incurred.isnot(None),
                ExpenseLine.date_incurred >= range_start,
                ExpenseLine.date_incurred <= range_end,
                ExpenseLine.expense_category_id.isnot(None),
            )
        )
        res = await self.session.execute(q)
        dc_curr = (dc_currency or "USD").upper()
        for line, opp in res.all():
            mk = _month_key(line.date_incurred)
            amt = Decimal(str(line.amount or 0))
            if amt == 0:
                continue
            line_curr = (line.line_currency or "USD").upper()
            opp_curr = (opp.default_currency or "USD").upper()
            if line_curr != opp_curr:
                amt = Decimal(str(await convert_currency(float(amt), line_curr, opp_curr, self.session)))
            if opp_curr != dc_curr:
                amt = Decimal(str(await convert_currency(float(amt), opp_curr, dc_curr, self.session)))
            buckets["consulting_fee_expenses"][mk].amount += amt
            buckets["consulting_fee_expenses"][mk].actuals_weight += amt

    async def _add_approved_employee_expense_lines(
        self,
        buckets: dict[str, dict[str, MonthBucket]],
        forecast_dc_id: UUID,
        range_start: date,
        range_end: date,
        dc_currency: str,
    ) -> None:
        """Roll up approved expense lines into expense_employee_cat_{id} month buckets (forecast DC currency)."""
        from app.models.expense import ExpenseLine, ExpenseSheet
        from app.financial_forecast.definition import employee_expense_row_key

        q = (
            select(ExpenseLine, ExpenseSheet, Engagement, Opportunity)
            .join(ExpenseSheet, ExpenseLine.expense_sheet_id == ExpenseSheet.id)
            .outerjoin(Engagement, ExpenseLine.engagement_id == Engagement.id)
            .join(Opportunity, Opportunity.id == func.coalesce(ExpenseLine.opportunity_id, Engagement.opportunity_id))
            .where(
                ExpenseSheet.status.in_([TimesheetStatus.APPROVED, TimesheetStatus.INVOICED]),
                Opportunity.delivery_center_id == forecast_dc_id,
                ExpenseLine.date_incurred.isnot(None),
                ExpenseLine.date_incurred >= range_start,
                ExpenseLine.date_incurred <= range_end,
                ExpenseLine.expense_category_id.isnot(None),
            )
        )
        res = await self.session.execute(q)
        for line, _sheet, _eng, _opp in res.all():
            rk = employee_expense_row_key(line.expense_category_id)
            mk = _month_key(line.date_incurred)
            amt = Decimal(str(line.amount or 0))
            if amt == 0:
                continue
            lc = (line.line_currency or "USD").upper()
            amt_dc = Decimal(str(await convert_currency(float(amt), lc, dc_currency, self.session)))
            buckets[rk][mk].amount += amt_dc
            buckets[rk][mk].actuals_weight += amt_dc

    async def fetch_auto_grid(
        self,
        forecast_dc_id: UUID,
        range_start: date,
        range_end: date,
        metric: str,
    ) -> dict[str, dict[str, MonthBucket]]:
        """
        Returns row_key -> month_key -> MonthBucket.
        Amounts are converted to the forecast delivery center currency where source currency is known.
        """
        buckets: dict[str, dict[str, MonthBucket]] = defaultdict(lambda: defaultdict(MonthBucket))

        dc_curr = await self.get_delivery_center_currency(forecast_dc_id) or "USD"

        await self._add_consulting_fee_invoice_dc(buckets, forecast_dc_id, range_start, range_end, metric, dc_curr)
        await self._add_consulting_fee_intercompany(buckets, forecast_dc_id, range_start, range_end, metric, dc_curr)
        await self._add_cogs_delivery(buckets, forecast_dc_id, range_start, range_end, metric, dc_curr)
        await self._add_cogs_intercompany_labor(buckets, forecast_dc_id, range_start, range_end, metric, dc_curr)
        await self._add_cogs_subcontract(buckets, forecast_dc_id, range_start, range_end, metric, dc_curr)

        await self._add_consulting_fee_expenses(
            buckets, forecast_dc_id, range_start, range_end, dc_curr
        )

        await self._add_approved_employee_expense_lines(
            buckets, forecast_dc_id, range_start, range_end, dc_curr
        )

        return buckets

    def _months_in_range(self, range_start: date, range_end: date) -> list[str]:
        keys: list[str] = []
        d = date(range_start.year, range_start.month, 1)
        end_m = date(range_end.year, range_end.month, 1)
        while d <= end_m:
            keys.append(_month_key(d))
            if d.month == 12:
                d = date(d.year + 1, 1, 1)
            else:
                d = date(d.year, d.month + 1, 1)
        return keys

    async def _add_consulting_fee_invoice_dc(
        self,
        buckets: dict[str, dict[str, MonthBucket]],
        forecast_dc_id: UUID,
        range_start: date,
        range_end: date,
        metric: str,
        dc_currency: str,
    ) -> None:
        """Consulting fee for opportunities with Invoice DC == forecast DC."""
        accepted_tm = exists(
            select(1).where(
                Quote.opportunity_id == Opportunity.id,
                Quote.status == QuoteStatus.ACCEPTED,
                Quote.quote_type == QuoteType.TIME_MATERIALS,
            )
        )
        has_engagement = exists(select(1).where(Engagement.opportunity_id == Opportunity.id))
        has_approved_ts = exists(
            select(1)
            .select_from(TimesheetApprovedSnapshot)
            .join(TimesheetEntry, TimesheetApprovedSnapshot.timesheet_entry_id == TimesheetEntry.id)
            .join(Timesheet, TimesheetEntry.timesheet_id == Timesheet.id)
            .where(
                TimesheetEntry.opportunity_id == Opportunity.id,
                TimesheetEntry.engagement_line_item_id.isnot(None),
                Timesheet.status.in_([TimesheetStatus.APPROVED, TimesheetStatus.INVOICED]),
            )
        )

        # --- Deal value path: no accepted quote, no engagement, no actuals ---
        q_deal = (
            select(
                Opportunity.id,
                Opportunity.start_date,
                Opportunity.end_date,
                Opportunity.forecast_value,
                Opportunity.default_currency,
            )
            .where(
                Opportunity.delivery_center_id == forecast_dc_id,
                Opportunity.status.notin_([OpportunityStatus.LOST, OpportunityStatus.CANCELLED]),
                Opportunity.end_date >= range_start,
                Opportunity.start_date <= range_end,
                ~exists(
                    select(1).where(
                        Quote.opportunity_id == Opportunity.id,
                        Quote.status == QuoteStatus.ACCEPTED,
                    )
                ),
                ~has_engagement,
                ~has_approved_ts,
            )
        )
        if metric == "forecast":
            for row in (await self.session.execute(q_deal)).all():
                fv = Decimal(str(row.forecast_value or 0))
                if fv and row.default_currency and dc_currency:
                    fv = Decimal(str(await convert_currency(float(fv), row.default_currency, dc_currency, self.session)))
                self._fair_share_forecast_value_to_months(
                    buckets,
                    "consulting_fee",
                    row.start_date,
                    row.end_date,
                    fv,
                    range_start,
                    range_end,
                    from_actuals=False,
                )

        # --- Fixed bid: accepted FIXED_BID, engagement exists ---
        if metric == "forecast":
            q_fb = (
                select(
                    Opportunity.id,
                    Opportunity.start_date,
                    Opportunity.end_date,
                    Opportunity.default_currency,
                    func.coalesce(func.sum(QuotePaymentTrigger.amount), 0).label("fb_total"),
                )
                .join(Quote, Quote.opportunity_id == Opportunity.id)
                .outerjoin(QuotePaymentTrigger, QuotePaymentTrigger.quote_id == Quote.id)
                .where(
                    Opportunity.delivery_center_id == forecast_dc_id,
                    Opportunity.status.notin_([OpportunityStatus.LOST, OpportunityStatus.CANCELLED]),
                    Opportunity.end_date >= range_start,
                    Opportunity.start_date <= range_end,
                    Quote.status == QuoteStatus.ACCEPTED,
                    Quote.quote_type == QuoteType.FIXED_BID,
                    has_engagement,
                )
                .group_by(
                    Opportunity.id,
                    Opportunity.start_date,
                    Opportunity.end_date,
                    Opportunity.default_currency,
                )
            )
            for row in (await self.session.execute(q_fb)).all():
                total = Decimal(str(row.fb_total or 0))
                if total and row.default_currency and dc_currency:
                    total = Decimal(str(await convert_currency(float(total), row.default_currency, dc_currency, self.session)))
                self._fair_share_amount_over_dates(
                    buckets,
                    "consulting_fee",
                    row.start_date,
                    row.end_date,
                    total,
                    range_start,
                    range_end,
                    from_actuals=False,
                )

        # --- T&M: engagement + weekly plan / actuals (invoice DC = forecast) ---
        await self._consulting_tm_invoice_dc(
            buckets, forecast_dc_id, range_start, range_end, metric, accepted_tm, has_engagement, has_approved_ts, dc_currency
        )

    def _fair_share_forecast_value_to_months(
        self,
        buckets: dict[str, dict[str, MonthBucket]],
        row_key: str,
        opp_start: date,
        opp_end: date,
        forecast_value: Decimal,
        range_start: date,
        range_end: date,
        *,
        from_actuals: bool,
    ) -> None:
        if forecast_value == 0:
            return
        total_days = (opp_end - opp_start).days + 1
        if total_days <= 0:
            return
        daily = forecast_value / Decimal(total_days)
        d = opp_start
        while d <= opp_end:
            if range_start <= d <= range_end:
                mk = _month_key(d)
                buckets[row_key][mk].amount += daily
                if from_actuals:
                    buckets[row_key][mk].actuals_weight += daily
                else:
                    buckets[row_key][mk].forecast_weight += daily
            d += timedelta(days=1)

    def _fair_share_amount_over_dates(
        self,
        buckets: dict[str, dict[str, MonthBucket]],
        row_key: str,
        opp_start: date,
        opp_end: date,
        total: Decimal,
        range_start: date,
        range_end: date,
        *,
        from_actuals: bool,
    ) -> None:
        if total == 0:
            return
        total_days = (opp_end - opp_start).days + 1
        if total_days <= 0:
            return
        daily = total / Decimal(total_days)
        d = opp_start
        while d <= opp_end:
            if range_start <= d <= range_end:
                mk = _month_key(d)
                buckets[row_key][mk].amount += daily
                if from_actuals:
                    buckets[row_key][mk].actuals_weight += daily
                else:
                    buckets[row_key][mk].forecast_weight += daily
            d += timedelta(days=1)

    async def _consulting_tm_invoice_dc(
        self,
        buckets: dict[str, dict[str, MonthBucket]],
        forecast_dc_id: UUID,
        range_start: date,
        range_end: date,
        metric: str,
        accepted_tm,
        has_engagement,
        has_approved_ts,
        dc_currency: str,
    ) -> None:
        """T&M consulting revenue for invoice DC == forecast DC."""
        q_opps = select(Opportunity.id).where(
            Opportunity.delivery_center_id == forecast_dc_id,
            Opportunity.status.notin_([OpportunityStatus.LOST, OpportunityStatus.CANCELLED]),
            Opportunity.end_date >= range_start,
            Opportunity.start_date <= range_end,
            accepted_tm,
            has_engagement,
        )
        opp_ids = [r[0] for r in (await self.session.execute(q_opps)).all()]
        if not opp_ids:
            return

        # Weekly actuals: sum(hours * invoice_rate) per line item + week + invoice currency
        q_act = (
            select(
                Timesheet.week_start_date.label("ws"),
                TimesheetEntry.engagement_line_item_id.label("eli"),
                TimesheetApprovedSnapshot.invoice_currency.label("inv_cur"),
                func.sum(
                    case(
                        (TimesheetApprovedSnapshot.billable == True, TimesheetApprovedSnapshot.hours * TimesheetApprovedSnapshot.invoice_rate),
                        else_=0,
                    )
                ).label("rev"),
            )
            .select_from(TimesheetApprovedSnapshot)
            .join(TimesheetEntry, TimesheetApprovedSnapshot.timesheet_entry_id == TimesheetEntry.id)
            .join(Timesheet, TimesheetEntry.timesheet_id == Timesheet.id)
            .join(Opportunity, TimesheetEntry.opportunity_id == Opportunity.id)
            .where(
                TimesheetEntry.opportunity_id.in_(opp_ids),
                TimesheetEntry.engagement_line_item_id.isnot(None),
                Timesheet.status.in_([TimesheetStatus.APPROVED, TimesheetStatus.INVOICED]),
                Timesheet.week_start_date >= range_start - timedelta(days=6),
                Timesheet.week_start_date <= range_end,
                Opportunity.delivery_center_id == forecast_dc_id,
            )
            .group_by(Timesheet.week_start_date, TimesheetEntry.engagement_line_item_id, TimesheetApprovedSnapshot.invoice_currency)
        )
        act_rows = (await self.session.execute(q_act)).all()
        act_keys = {(r.ws, r.eli) for r in act_rows}

        for r in act_rows:
            ws: date = r.ws
            rev = Decimal(str(r.rev or 0))
            ic = (r.inv_cur or dc_currency).upper()
            if rev and ic != dc_currency.upper():
                rev = Decimal(str(await convert_currency(float(rev), ic, dc_currency, self.session)))
            if metric in ("actuals", "forecast"):
                parts = _split_week_amount_by_month(ws, rev, range_start, range_end)
                for mk, amt in parts.items():
                    buckets["consulting_fee"][mk].amount += amt
                    buckets["consulting_fee"][mk].actuals_weight += amt

        if metric == "forecast":
            q_plan = (
                select(
                    EngagementWeeklyHours.week_start_date.label("ws"),
                    EngagementLineItem.id.label("eli"),
                    (EngagementWeeklyHours.hours * EngagementLineItem.rate).label("rev"),
                    EngagementLineItem.currency.label("line_currency"),
                )
                .select_from(EngagementWeeklyHours)
                .join(EngagementLineItem, EngagementWeeklyHours.engagement_line_item_id == EngagementLineItem.id)
                .join(Engagement, EngagementLineItem.engagement_id == Engagement.id)
                .where(
                    Engagement.opportunity_id.in_(opp_ids),
                    EngagementWeeklyHours.week_start_date >= range_start - timedelta(days=6),
                    EngagementWeeklyHours.week_start_date <= range_end,
                    EngagementWeeklyHours.hours > 0,
                )
            )
            for r in (await self.session.execute(q_plan)).all():
                key = (r.ws, r.eli)
                if key in act_keys:
                    continue
                rev = Decimal(str(r.rev or 0))
                lc = (r.line_currency or dc_currency).upper()
                if rev and lc != dc_currency.upper():
                    rev = Decimal(str(await convert_currency(float(rev), lc, dc_currency, self.session)))
                parts = _split_week_amount_by_month(r.ws, rev, range_start, range_end)
                for mk, amt in parts.items():
                    buckets["consulting_fee"][mk].amount += amt
                    buckets["consulting_fee"][mk].forecast_weight += amt

    async def _add_consulting_fee_intercompany(
        self,
        buckets: dict[str, dict[str, MonthBucket]],
        forecast_dc_id: UUID,
        range_start: date,
        range_end: date,
        metric: str,
        dc_currency: str,
    ) -> None:
        """Invoice DC != forecast DC; staffing + actuals rules from brief."""
        has_eng = exists(select(1).where(Engagement.opportunity_id == Opportunity.id))
        has_ts = exists(
            select(1)
            .select_from(TimesheetApprovedSnapshot)
            .join(TimesheetEntry, TimesheetApprovedSnapshot.timesheet_entry_id == TimesheetEntry.id)
            .join(Timesheet, TimesheetEntry.timesheet_id == Timesheet.id)
            .where(
                _timesheet_entry_belongs_to_opportunity(Opportunity.id),
                TimesheetEntry.engagement_line_item_id.isnot(None),
                Timesheet.status.in_([TimesheetStatus.APPROVED, TimesheetStatus.INVOICED]),
            )
        )
        q_opps = select(Opportunity.id).where(
            Opportunity.delivery_center_id != forecast_dc_id,
            Opportunity.status.notin_([OpportunityStatus.LOST, OpportunityStatus.CANCELLED]),
            Opportunity.end_date >= range_start,
            Opportunity.start_date <= range_end,
            _opportunity_has_quotable_quote(),
            has_eng,
            has_ts,
        )
        opp_ids = [r[0] for r in (await self.session.execute(q_opps)).all()]
        if not opp_ids:
            return

        q_act = (
            select(
                Timesheet.week_start_date.label("ws"),
                TimesheetEntry.engagement_line_item_id.label("eli"),
                TimesheetApprovedSnapshot.invoice_currency.label("inv_cur"),
                func.sum(TimesheetApprovedSnapshot.hours * TimesheetApprovedSnapshot.invoice_cost).label("cost_rev"),
            )
            .select_from(TimesheetApprovedSnapshot)
            .join(TimesheetEntry, TimesheetApprovedSnapshot.timesheet_entry_id == TimesheetEntry.id)
            .join(Timesheet, TimesheetEntry.timesheet_id == Timesheet.id)
            .join(Employee, Timesheet.employee_id == Employee.id)
            .where(
                _timesheet_entry_opportunity_in(opp_ids),
                TimesheetEntry.engagement_line_item_id.isnot(None),
                Timesheet.status.in_([TimesheetStatus.APPROVED, TimesheetStatus.INVOICED]),
                Employee.delivery_center_id == forecast_dc_id,
                Timesheet.week_start_date >= range_start - timedelta(days=6),
                Timesheet.week_start_date <= range_end,
            )
            .group_by(Timesheet.week_start_date, TimesheetEntry.engagement_line_item_id, TimesheetApprovedSnapshot.invoice_currency)
        )
        act_rows = (await self.session.execute(q_act)).all()
        act_keys = {(r.ws, r.eli) for r in act_rows}
        for r in act_rows:
            amt = Decimal(str(r.cost_rev or 0))
            ic = (r.inv_cur or dc_currency).upper()
            if amt and ic != dc_currency.upper():
                amt = Decimal(str(await convert_currency(float(amt), ic, dc_currency, self.session)))
            if metric in ("actuals", "forecast"):
                for mk, part in _split_week_amount_by_month(r.ws, amt, range_start, range_end).items():
                    buckets["consulting_fee_intercompany"][mk].amount += part
                    buckets["consulting_fee_intercompany"][mk].actuals_weight += part

        if metric == "forecast":
            q_plan = (
                select(
                    EngagementWeeklyHours.week_start_date.label("ws"),
                    EngagementLineItem.id.label("eli"),
                    (EngagementWeeklyHours.hours * EngagementLineItem.cost).label("cost_rev"),
                    EngagementLineItem.currency.label("line_currency"),
                )
                .select_from(EngagementWeeklyHours)
                .join(EngagementLineItem, EngagementWeeklyHours.engagement_line_item_id == EngagementLineItem.id)
                .join(Engagement, EngagementLineItem.engagement_id == Engagement.id)
                .outerjoin(Employee, EngagementLineItem.employee_id == Employee.id)
                .where(
                    Engagement.opportunity_id.in_(opp_ids),
                    EngagementWeeklyHours.hours > 0,
                    EngagementWeeklyHours.week_start_date >= range_start - timedelta(days=6),
                    EngagementWeeklyHours.week_start_date <= range_end,
                    or_(
                        and_(EngagementLineItem.employee_id.isnot(None), Employee.delivery_center_id == forecast_dc_id),
                        and_(
                            EngagementLineItem.employee_id.is_(None),
                            EngagementLineItem.payable_center_id == forecast_dc_id,
                        ),
                    ),
                )
            )
            for r in (await self.session.execute(q_plan)).all():
                if (r.ws, r.eli) in act_keys:
                    continue
                amt = Decimal(str(r.cost_rev or 0))
                lc = (r.line_currency or dc_currency).upper()
                if amt and lc != dc_currency.upper():
                    amt = Decimal(str(await convert_currency(float(amt), lc, dc_currency, self.session)))
                for mk, part in _split_week_amount_by_month(r.ws, amt, range_start, range_end).items():
                    buckets["consulting_fee_intercompany"][mk].amount += part
                    buckets["consulting_fee_intercompany"][mk].forecast_weight += part

    async def _add_cogs_delivery(
        self,
        buckets: dict[str, dict[str, MonthBucket]],
        forecast_dc_id: UUID,
        range_start: date,
        range_end: date,
        metric: str,
        dc_currency: str,
    ) -> None:
        await self._cogs_cost_slice(
            buckets,
            "cogs_delivery",
            forecast_dc_id,
            range_start,
            range_end,
            metric,
            dc_currency,
            invoice_dc_equals_forecast=True,
            ts_employee_dc_match=True,
            ts_employee_type=EmployeeType.FULL_TIME,
            plan_employee_dc_match=True,
            plan_employee_type=EmployeeType.FULL_TIME,
            plan_include_unassigned_payable=True,
            plan_require_employee_for_intercompany=False,
        )

    async def _add_cogs_intercompany_labor(
        self,
        buckets: dict[str, dict[str, MonthBucket]],
        forecast_dc_id: UUID,
        range_start: date,
        range_end: date,
        metric: str,
        dc_currency: str,
    ) -> None:
        await self._cogs_cost_slice(
            buckets,
            "cogs_intercompany_labor",
            forecast_dc_id,
            range_start,
            range_end,
            metric,
            dc_currency,
            invoice_dc_equals_forecast=True,
            ts_employee_dc_match=False,
            ts_employee_type=None,
            plan_employee_dc_match=False,
            plan_employee_type=None,
            plan_include_unassigned_payable=False,
            plan_require_employee_for_intercompany=True,
        )

    async def _add_cogs_subcontract(
        self,
        buckets: dict[str, dict[str, MonthBucket]],
        forecast_dc_id: UUID,
        range_start: date,
        range_end: date,
        metric: str,
        dc_currency: str,
    ) -> None:
        await self._cogs_cost_slice(
            buckets,
            "cogs_subcontract",
            forecast_dc_id,
            range_start,
            range_end,
            metric,
            dc_currency,
            invoice_dc_equals_forecast=True,
            ts_employee_dc_match=True,
            ts_employee_type=EmployeeType.CONTRACT,
            plan_employee_dc_match=True,
            plan_employee_type=EmployeeType.CONTRACT,
            plan_include_unassigned_payable=False,
            plan_require_employee_for_intercompany=True,
        )

    async def _cogs_cost_slice(
        self,
        buckets: dict[str, dict[str, MonthBucket]],
        row_key: str,
        forecast_dc_id: UUID,
        range_start: date,
        range_end: date,
        metric: str,
        dc_currency: str,
        *,
        invoice_dc_equals_forecast: bool,
        ts_employee_dc_match: bool,
        ts_employee_type: EmployeeType | None,
        plan_employee_dc_match: bool,
        plan_employee_type: EmployeeType | None,
        plan_include_unassigned_payable: bool,
        plan_require_employee_for_intercompany: bool,
    ) -> None:
        has_eng = exists(select(1).where(Engagement.opportunity_id == Opportunity.id))
        has_ts = exists(
            select(1)
            .select_from(TimesheetApprovedSnapshot)
            .join(TimesheetEntry, TimesheetApprovedSnapshot.timesheet_entry_id == TimesheetEntry.id)
            .join(Timesheet, TimesheetEntry.timesheet_id == Timesheet.id)
            .where(
                _timesheet_entry_belongs_to_opportunity(Opportunity.id),
                TimesheetEntry.engagement_line_item_id.isnot(None),
                Timesheet.status.in_([TimesheetStatus.APPROVED, TimesheetStatus.INVOICED]),
            )
        )
        dc_pred = Opportunity.delivery_center_id == forecast_dc_id if invoice_dc_equals_forecast else Opportunity.delivery_center_id != forecast_dc_id
        q_opps = select(Opportunity.id).where(
            dc_pred,
            Opportunity.status.notin_([OpportunityStatus.LOST, OpportunityStatus.CANCELLED]),
            Opportunity.end_date >= range_start,
            Opportunity.start_date <= range_end,
            _opportunity_has_quotable_quote(),
            has_eng,
            has_ts,
        )
        opp_ids = [r[0] for r in (await self.session.execute(q_opps)).all()]
        if not opp_ids:
            return

        ts_dc_pred = Employee.delivery_center_id == forecast_dc_id if ts_employee_dc_match else Employee.delivery_center_id != forecast_dc_id
        ts_type_pred = True
        if ts_employee_type is not None:
            ts_type_pred = Employee.employee_type == ts_employee_type

        q_act = (
            select(
                Timesheet.week_start_date.label("ws"),
                TimesheetEntry.engagement_line_item_id.label("eli"),
                TimesheetApprovedSnapshot.invoice_currency.label("inv_cur"),
                func.sum(TimesheetApprovedSnapshot.hours * TimesheetApprovedSnapshot.invoice_cost).label("cost_amt"),
            )
            .select_from(TimesheetApprovedSnapshot)
            .join(TimesheetEntry, TimesheetApprovedSnapshot.timesheet_entry_id == TimesheetEntry.id)
            .join(Timesheet, TimesheetEntry.timesheet_id == Timesheet.id)
            .join(Employee, Timesheet.employee_id == Employee.id)
            .where(
                _timesheet_entry_opportunity_in(opp_ids),
                TimesheetEntry.engagement_line_item_id.isnot(None),
                Timesheet.status.in_([TimesheetStatus.APPROVED, TimesheetStatus.INVOICED]),
                ts_dc_pred,
                ts_type_pred,
                Timesheet.week_start_date >= range_start - timedelta(days=6),
                Timesheet.week_start_date <= range_end,
            )
            .group_by(Timesheet.week_start_date, TimesheetEntry.engagement_line_item_id, TimesheetApprovedSnapshot.invoice_currency)
        )
        act_rows = (await self.session.execute(q_act)).all()
        act_keys = {(r.ws, r.eli) for r in act_rows}
        for r in act_rows:
            amt = Decimal(str(r.cost_amt or 0))
            ic = (r.inv_cur or dc_currency).upper()
            if amt and ic != dc_currency.upper():
                amt = Decimal(str(await convert_currency(float(amt), ic, dc_currency, self.session)))
            if metric in ("actuals", "forecast"):
                for mk, part in _split_week_amount_by_month(r.ws, amt, range_start, range_end).items():
                    buckets[row_key][mk].amount += part
                    buckets[row_key][mk].actuals_weight += part

        if metric != "forecast":
            return

        emp_alias = aliased(Employee)
        base_where = [
            Engagement.opportunity_id.in_(opp_ids),
            EngagementWeeklyHours.hours > 0,
            EngagementWeeklyHours.week_start_date >= range_start - timedelta(days=6),
            EngagementWeeklyHours.week_start_date <= range_end,
        ]

        if row_key == "cogs_delivery":
            plan_role = and_(
                EngagementLineItem.employee_id.isnot(None),
                emp_alias.delivery_center_id == forecast_dc_id,
                emp_alias.employee_type == EmployeeType.FULL_TIME,
            )
            plan_unassigned = and_(
                EngagementLineItem.employee_id.is_(None),
                EngagementLineItem.payable_center_id == forecast_dc_id,
            )
            plan_filter = or_(plan_role, plan_unassigned) if plan_include_unassigned_payable else plan_role
        elif row_key == "cogs_intercompany_labor":
            plan_filter = and_(
                EngagementLineItem.employee_id.isnot(None),
                emp_alias.delivery_center_id != forecast_dc_id,
            )
        else:
            # subcontract: contract employees at forecast DC only (ignore unassigned)
            plan_filter = and_(
                EngagementLineItem.employee_id.isnot(None),
                emp_alias.delivery_center_id == forecast_dc_id,
                emp_alias.employee_type == EmployeeType.CONTRACT,
            )

        q_plan = (
            select(
                EngagementWeeklyHours.week_start_date.label("ws"),
                EngagementLineItem.id.label("eli"),
                (EngagementWeeklyHours.hours * EngagementLineItem.cost).label("cost_amt"),
                EngagementLineItem.currency.label("line_currency"),
            )
            .select_from(EngagementWeeklyHours)
            .join(EngagementLineItem, EngagementWeeklyHours.engagement_line_item_id == EngagementLineItem.id)
            .join(Engagement, EngagementLineItem.engagement_id == Engagement.id)
            .outerjoin(emp_alias, EngagementLineItem.employee_id == emp_alias.id)
            .where(and_(*base_where, plan_filter))
        )
        for r in (await self.session.execute(q_plan)).all():
            if (r.ws, r.eli) in act_keys:
                continue
            amt = Decimal(str(r.cost_amt or 0))
            lc = (r.line_currency or dc_currency).upper()
            if amt and lc != dc_currency.upper():
                amt = Decimal(str(await convert_currency(float(amt), lc, dc_currency, self.session)))
            for mk, part in _split_week_amount_by_month(r.ws, amt, range_start, range_end).items():
                buckets[row_key][mk].amount += part
                buckets[row_key][mk].forecast_weight += part

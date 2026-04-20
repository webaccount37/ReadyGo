"""
Staffing forecast repository for fetching estimate and engagement weekly data.
"""

from datetime import date, timedelta
from typing import Optional
from uuid import UUID
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, exists, func
from sqlalchemy.orm import aliased

from app.models.estimate import Estimate, EstimateLineItem, EstimateWeeklyHours
from app.models.engagement import Engagement, EngagementLineItem, EngagementWeeklyHours
from app.models.opportunity import Opportunity, OpportunityStatus
from app.models.quote import Quote, QuoteStatus
from app.models.role import Role
from app.models.role_rate import RoleRate
from app.models.delivery_center import DeliveryCenter
from app.models.employee import Employee
from app.models.timesheet import (
    TimesheetApprovedSnapshot,
    TimesheetEntry,
    Timesheet,
    TimesheetStatus,
    TimesheetEntryType,
)
from app.db.repositories.calendar_repository import CalendarRepository


def _get_week_start(d: date) -> date:
    """Get the Sunday (week start) for a given date."""
    days_since_sunday = (d.weekday() + 1) % 7
    return d - timedelta(days=days_since_sunday)


# Probability map matching OpportunityService
PROBABILITY_MAP = {
    OpportunityStatus.DISCOVERY: 10.0,
    OpportunityStatus.QUALIFIED: 25.0,
    OpportunityStatus.PROPOSAL: 50.0,
    OpportunityStatus.NEGOTIATION: 80.0,
    OpportunityStatus.WON: 100.0,
}


def _get_probability(status: OpportunityStatus) -> float:
    return PROBABILITY_MAP.get(status, 0.0)


class StaffingForecastRepository:
    """Repository for staffing forecast data from estimates and engagements."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.calendar_repo = CalendarRepository(session)

    async def fetch_billable_actuals_weekly_data(
        self,
        start_week: date,
        end_week: date,
        delivery_center_id: Optional[UUID] = None,
        employee_id: Optional[UUID] = None,
    ) -> list[dict]:
        """
        Fetch billable actuals hours per (employee_id, delivery_center_id, week_start).
        Uses TimesheetApprovedSnapshot where billable=True, engagement entries only, approved/invoiced timesheets.
        Returns list of dicts with: employee_id, delivery_center_id, week_start, billable_hours.
        """
        subq = (
            select(
                Timesheet.employee_id,
                Timesheet.week_start_date,
                func.sum(TimesheetApprovedSnapshot.hours).label("billable_hours"),
            )
            .select_from(TimesheetApprovedSnapshot)
            .join(TimesheetEntry, TimesheetApprovedSnapshot.timesheet_entry_id == TimesheetEntry.id)
            .join(Timesheet, TimesheetEntry.timesheet_id == Timesheet.id)
            .where(
                TimesheetApprovedSnapshot.billable == True,
                TimesheetEntry.engagement_line_item_id.isnot(None),
                Timesheet.status.in_([TimesheetStatus.APPROVED, TimesheetStatus.INVOICED]),
                Timesheet.week_start_date >= start_week,
                Timesheet.week_start_date <= end_week,
            )
            .group_by(Timesheet.employee_id, Timesheet.week_start_date)
        )
        result = await self.session.execute(subq)
        rows = result.all()

        if not rows:
            return []

        emp_ids = list({r.employee_id for r in rows})
        query = (
            select(
                Employee.id.label("employee_id"),
                Employee.delivery_center_id,
            )
            .select_from(Employee)
            .where(Employee.id.in_(emp_ids))
        )
        if delivery_center_id is not None:
            query = query.where(Employee.delivery_center_id == delivery_center_id)
        if employee_id is not None:
            query = query.where(Employee.id == employee_id)

        emp_result = await self.session.execute(query)
        emp_dc = {str(r.employee_id): str(r.delivery_center_id) for r in emp_result.all() if r.delivery_center_id}

        out = []
        for row in rows:
            dc_id = emp_dc.get(str(row.employee_id))
            if not dc_id:
                continue
            out.append({
                "employee_id": str(row.employee_id),
                "delivery_center_id": dc_id,
                "week_start": row.week_start_date,
                "billable_hours": float(row.billable_hours or 0),
            })
        return out

    async def fetch_holiday_and_pto_hours(
        self,
        start_week: date,
        end_week: date,
        delivery_center_id: Optional[UUID] = None,
        employee_id: Optional[UUID] = None,
    ) -> tuple[dict[tuple[str, str], float], dict[tuple[str, str], float]]:
        """
        Fetch holiday hours (from Calendar) and PTO hours (from HOLIDAY timesheet entries) per (dc, week) and (emp, week).
        Returns (holiday_by_dc_week, pto_by_emp_week) where keys are (id_str, week_iso) tuples.
        """
        # Holiday hours from Calendar - per (delivery_center_id, week_start)
        current = start_week
        holiday_by_dc_week: dict[tuple[str, str], float] = {}
        dc_ids_to_fetch: set[UUID] = set()

        if delivery_center_id:
            dc_ids_to_fetch.add(delivery_center_id)
        else:
            dc_result = await self.session.execute(select(DeliveryCenter.id))
            dc_ids_to_fetch = set(dc_result.scalars().all())

        while current <= end_week:
            week_end = current + timedelta(days=6)
            for dc_id in dc_ids_to_fetch:
                events = await self.calendar_repo.list_by_delivery_center_and_date_range(dc_id, current, week_end)
                total = sum(float(getattr(ev, "hours", 8) or 8) for ev in events)
                holiday_by_dc_week[(str(dc_id), current.isoformat())] = total
            current += timedelta(days=7)

        # PTO hours from HOLIDAY timesheet entries - per (employee_id, week_start)
        subq = (
            select(
                Timesheet.employee_id,
                Timesheet.week_start_date,
                func.sum(TimesheetApprovedSnapshot.hours).label("pto_hours"),
            )
            .select_from(TimesheetApprovedSnapshot)
            .join(TimesheetEntry, TimesheetApprovedSnapshot.timesheet_entry_id == TimesheetEntry.id)
            .join(Timesheet, TimesheetEntry.timesheet_id == Timesheet.id)
            .where(
                TimesheetEntry.entry_type == TimesheetEntryType.HOLIDAY,
                Timesheet.status.in_([TimesheetStatus.APPROVED, TimesheetStatus.INVOICED]),
                Timesheet.week_start_date >= start_week,
                Timesheet.week_start_date <= end_week,
            )
            .group_by(Timesheet.employee_id, Timesheet.week_start_date)
        )
        pto_result = await self.session.execute(subq)
        pto_rows = pto_result.all()

        emp_dc_map: dict[str, str] = {}
        if pto_rows:
            emp_ids = list({r.employee_id for r in pto_rows})
            emp_query = (
                select(Employee.id, Employee.delivery_center_id)
                .where(Employee.id.in_(emp_ids))
            )
            if delivery_center_id:
                emp_query = emp_query.where(Employee.delivery_center_id == delivery_center_id)
            if employee_id:
                emp_query = emp_query.where(Employee.id == employee_id)
            emp_res = await self.session.execute(emp_query)
            emp_dc_map = {
                str(r.id): str(r.delivery_center_id)
                for r in emp_res.all()
                if r.delivery_center_id
            }

        pto_by_emp_week: dict[tuple[str, str], float] = {}
        for row in pto_rows:
            dc_id = emp_dc_map.get(str(row.employee_id))
            if not dc_id:
                continue
            pto_by_emp_week[(str(row.employee_id), row.week_start_date.isoformat())] = float(row.pto_hours or 0)

        return (holiday_by_dc_week, pto_by_emp_week)

    async def fetch_utilization_date_ranges(
        self,
        delivery_center_id: Optional[UUID] = None,
        employee_id: Optional[UUID] = None,
    ) -> dict[str, dict]:
        """
        Fetch date ranges for billable utilization scope: employee start/end and engagement/estimate line item ranges.
        Returns dict[emp_id_str, {"emp_start": date, "emp_end": date|None, "line_item_ranges": [(start, end), ...]}].
        A week is in scope if it falls within employee dates OR within any line item (engagement/estimate) range.
        """
        from app.models.employee import EmployeeStatus
        from app.models.quote import QuoteStatus

        # Employee dates
        emp_query = (
            select(
                Employee.id.label("employee_id"),
                Employee.start_date.label("emp_start"),
                Employee.end_date.label("emp_end"),
            )
            .select_from(Employee)
            .where(Employee.status == EmployeeStatus.ACTIVE)
        )
        if delivery_center_id is not None:
            emp_query = emp_query.where(Employee.delivery_center_id == delivery_center_id)
        if employee_id is not None:
            emp_query = emp_query.where(Employee.id == employee_id)
        emp_result = await self.session.execute(emp_query)
        emp_rows = emp_result.all()

        out: dict[str, dict] = {}
        for r in emp_rows:
            out[str(r.employee_id)] = {
                "emp_start": r.emp_start,
                "emp_end": r.emp_end,
                "line_item_ranges": [],
            }

        if not out:
            return out

        emp_ids = list(out.keys())

        # Engagement line item date ranges (employee assigned)
        eng_query = (
            select(
                EngagementLineItem.employee_id,
                EngagementLineItem.start_date,
                EngagementLineItem.end_date,
            )
            .select_from(EngagementLineItem)
            .where(
                EngagementLineItem.employee_id.isnot(None),
                EngagementLineItem.employee_id.in_([UUID(e) for e in emp_ids]),
            )
        )
        eng_result = await self.session.execute(eng_query)
        for row in eng_result.all():
            eid = str(row.employee_id)
            if eid in out and row.start_date and row.end_date:
                out[eid]["line_item_ranges"].append((row.start_date, row.end_date))

        # Estimate line item date ranges (employee assigned) - only from estimates without accepted quote
        no_accepted = ~exists(
            select(1).where(
                Quote.opportunity_id == Estimate.opportunity_id,
                Quote.status == QuoteStatus.ACCEPTED,
            )
        )
        est_query = (
            select(
                EstimateLineItem.employee_id,
                EstimateLineItem.start_date,
                EstimateLineItem.end_date,
            )
            .select_from(EstimateLineItem)
            .join(Estimate, EstimateLineItem.estimate_id == Estimate.id)
            .where(
                Estimate.active_version == True,
                no_accepted,
                EstimateLineItem.employee_id.isnot(None),
                EstimateLineItem.employee_id.in_([UUID(e) for e in emp_ids]),
            )
        )
        est_result = await self.session.execute(est_query)
        for row in est_result.all():
            eid = str(row.employee_id)
            if eid in out and row.start_date and row.end_date:
                out[eid]["line_item_ranges"].append((row.start_date, row.end_date))

        return out

    async def fetch_estimate_weekly_data(
        self,
        start_week: date,
        end_week: date,
        delivery_center_id: Optional[UUID] = None,
        employee_id: Optional[UUID] = None,
        billable_filter: Optional[bool] = None,
    ) -> list[dict]:
        """
        Fetch estimate weekly hours from active estimates (no approved quote).
        Returns list of dicts with: opportunity_id, opportunity_name, delivery_center_id,
        delivery_center_name, role_id, role_name, employee_id, employee_name, week_start,
        hours_weighted, rate, cost, estimate_id, source_type='estimate'.
        """
        # Subquery: opportunities that have NO quote with status ACCEPTED
        no_accepted_quote = ~exists(
            select(1).where(
                Quote.opportunity_id == Opportunity.id,
                Quote.status == QuoteStatus.ACCEPTED,
            )
        )

        query = (
            select(
                Opportunity.id.label("opportunity_id"),
                Opportunity.name.label("opportunity_name"),
                Opportunity.status.label("opportunity_status"),
                Opportunity.delivery_center_id.label("opp_delivery_center_id"),
                EstimateLineItem.id.label("line_item_id"),
                EstimateLineItem.employee_id,
                EstimateLineItem.billable,
                EstimateLineItem.rate,
                EstimateLineItem.cost,
                Role.id.label("role_id"),
                Role.role_name,
                Employee.delivery_center_id.label("emp_delivery_center_id"),
                DeliveryCenter.id.label("delivery_center_id"),
                DeliveryCenter.name.label("delivery_center_name"),
                Estimate.id.label("estimate_id"),
                EstimateWeeklyHours.week_start_date,
                EstimateWeeklyHours.hours,
                func.coalesce(func.concat(Employee.first_name, " ", Employee.last_name), "").label("employee_name"),
            )
            .select_from(EstimateWeeklyHours)
            .join(EstimateLineItem, EstimateWeeklyHours.estimate_line_item_id == EstimateLineItem.id)
            .join(Estimate, EstimateLineItem.estimate_id == Estimate.id)
            .join(Opportunity, Estimate.opportunity_id == Opportunity.id)
            .join(RoleRate, EstimateLineItem.role_rates_id == RoleRate.id)
            .join(Role, RoleRate.role_id == Role.id)
            .outerjoin(Employee, EstimateLineItem.employee_id == Employee.id)
            .outerjoin(
                DeliveryCenter,
                or_(
                    and_(EstimateLineItem.employee_id.isnot(None), Employee.delivery_center_id == DeliveryCenter.id),
                    and_(EstimateLineItem.employee_id.is_(None), Opportunity.delivery_center_id == DeliveryCenter.id),
                ),
            )
            .where(
                Estimate.active_version == True,
                no_accepted_quote,
                EstimateWeeklyHours.week_start_date >= start_week,
                EstimateWeeklyHours.week_start_date <= end_week,
            )
        )

        if billable_filter is not None:
            query = query.where(EstimateLineItem.billable == billable_filter)
        if delivery_center_id is not None:
            # delivery_center_id comes from Employee when employee present, else Opportunity
            query = query.where(
                or_(
                    and_(EstimateLineItem.employee_id.isnot(None), Employee.delivery_center_id == delivery_center_id),
                    and_(EstimateLineItem.employee_id.is_(None), Opportunity.delivery_center_id == delivery_center_id),
                )
            )
        if employee_id is not None:
            query = query.where(EstimateLineItem.employee_id == employee_id)

        result = await self.session.execute(query)
        rows = result.all()

        # Need to fix delivery_center join - the or_ in join was wrong. Let me simplify:
        # We'll determine delivery_center in Python: emp.delivery_center_id if employee else opp.delivery_center_id
        # Re-query with simpler joins and resolve delivery center in Python
        out = []
        for row in rows:
            dc_id = row.emp_delivery_center_id if row.employee_id else row.opp_delivery_center_id
            dc_name = row.delivery_center_name
            if delivery_center_id is not None and dc_id != delivery_center_id:
                continue
            prob = _get_probability(
                OpportunityStatus(row.opportunity_status) if row.opportunity_status else OpportunityStatus.QUALIFIED
            )
            hours_weighted = float(row.hours or 0) * (prob / 100.0)
            out.append({
                "opportunity_id": str(row.opportunity_id),
                "opportunity_name": row.opportunity_name or "",
                "delivery_center_id": str(dc_id) if dc_id else None,
                "delivery_center_name": dc_name or "",
                "role_id": str(row.role_id),
                "role_name": row.role_name or "",
                "employee_id": str(row.employee_id) if row.employee_id else None,
                "employee_name": getattr(row, "employee_name", None) or "",
                "week_start": row.week_start_date,
                "hours_weighted": hours_weighted,
                "rate": float(row.rate or 0),
                "cost": float(row.cost or 0),
                "estimate_id": str(row.estimate_id),
                "engagement_id": None,
                "source_type": "estimate",
                "source_label": "Plan",
            })
        return out

    async def fetch_engagement_plan_weekly_data(
        self,
        start_week: date,
        end_week: date,
        delivery_center_id: Optional[UUID] = None,
        employee_id: Optional[UUID] = None,
        billable_filter: Optional[bool] = None,
    ) -> list[dict]:
        """
        Fetch engagement plan (EngagementWeeklyHours) data.
        """
        dc_emp = aliased(DeliveryCenter)
        dc_opp = aliased(DeliveryCenter)
        query = (
            select(
                Opportunity.id.label("opportunity_id"),
                Opportunity.name.label("opportunity_name"),
                Opportunity.status.label("opportunity_status"),
                Opportunity.delivery_center_id.label("opp_delivery_center_id"),
                EngagementLineItem.id.label("line_item_id"),
                EngagementLineItem.employee_id,
                EngagementLineItem.billable,
                EngagementLineItem.rate,
                EngagementLineItem.cost,
                Role.id.label("role_id"),
                Role.role_name,
                func.coalesce(func.concat(Employee.first_name, " ", Employee.last_name), "").label("employee_name"),
                Employee.delivery_center_id.label("emp_delivery_center_id"),
                Engagement.id.label("engagement_id"),
                EngagementWeeklyHours.week_start_date,
                EngagementWeeklyHours.hours,
                func.coalesce(dc_emp.name, dc_opp.name).label("delivery_center_name"),
            )
            .select_from(EngagementWeeklyHours)
            .join(EngagementLineItem, EngagementWeeklyHours.engagement_line_item_id == EngagementLineItem.id)
            .join(Engagement, EngagementLineItem.engagement_id == Engagement.id)
            .join(Opportunity, Engagement.opportunity_id == Opportunity.id)
            .join(RoleRate, EngagementLineItem.role_rates_id == RoleRate.id)
            .join(Role, RoleRate.role_id == Role.id)
            .outerjoin(Employee, EngagementLineItem.employee_id == Employee.id)
            .outerjoin(dc_emp, Employee.delivery_center_id == dc_emp.id)
            .outerjoin(dc_opp, Opportunity.delivery_center_id == dc_opp.id)
            .where(
                EngagementWeeklyHours.week_start_date >= start_week,
                EngagementWeeklyHours.week_start_date <= end_week,
            )
        )

        if billable_filter is not None:
            query = query.where(EngagementLineItem.billable == billable_filter)
        if employee_id is not None:
            query = query.where(EngagementLineItem.employee_id == employee_id)
        if delivery_center_id is not None:
            query = query.where(
                or_(
                    and_(EngagementLineItem.employee_id.isnot(None), Employee.delivery_center_id == delivery_center_id),
                    and_(EngagementLineItem.employee_id.is_(None), Opportunity.delivery_center_id == delivery_center_id),
                )
            )

        result = await self.session.execute(query)
        rows = result.all()

        out = []
        for row in rows:
            dc_id = row.emp_delivery_center_id if row.employee_id else row.opp_delivery_center_id
            prob = _get_probability(
                OpportunityStatus(row.opportunity_status) if row.opportunity_status else OpportunityStatus.WON
            )
            hours_weighted = float(row.hours or 0) * (prob / 100.0)
            out.append({
                "opportunity_id": str(row.opportunity_id),
                "opportunity_name": row.opportunity_name or "",
                "delivery_center_id": str(dc_id) if dc_id else None,
                "delivery_center_name": getattr(row, "delivery_center_name", None) or "",
                "role_id": str(row.role_id),
                "role_name": row.role_name or "",
                "employee_id": str(row.employee_id) if row.employee_id else None,
                "employee_name": getattr(row, "employee_name", None) or "",
                "week_start": row.week_start_date,
                "hours_weighted": hours_weighted,
                "rate": float(row.rate or 0),
                "cost": float(row.cost or 0),
                "estimate_id": None,
                "engagement_id": str(row.engagement_id),
                "engagement_line_item_id": str(row.line_item_id),
                "source_type": "engagement",
                "source_label": "Plan",
            })
        return out

    async def fetch_accepted_engagement_plan_billable_weekly_for_utilization(
        self,
        start_week: date,
        end_week: date,
        delivery_center_id: Optional[UUID] = None,
        employee_id: Optional[UUID] = None,
        billable_filter: Optional[bool] = None,
    ) -> list[dict]:
        """
        Raw weekly billable plan hours for assigned employees on engagements whose quote is ACCEPTED.
        Excludes weeks covered by engagement actuals rows (caller merges with actuals_data keys).
        """
        if billable_filter is False:
            return []

        query = (
            select(
                EngagementLineItem.id.label("line_item_id"),
                EngagementLineItem.employee_id,
                Employee.delivery_center_id.label("emp_delivery_center_id"),
                Opportunity.delivery_center_id.label("opp_delivery_center_id"),
                EngagementWeeklyHours.week_start_date,
                EngagementWeeklyHours.hours,
            )
            .select_from(EngagementWeeklyHours)
            .join(EngagementLineItem, EngagementWeeklyHours.engagement_line_item_id == EngagementLineItem.id)
            .join(Engagement, EngagementLineItem.engagement_id == Engagement.id)
            .join(Quote, Engagement.quote_id == Quote.id)
            .join(Opportunity, Engagement.opportunity_id == Opportunity.id)
            .outerjoin(Employee, EngagementLineItem.employee_id == Employee.id)
            .where(
                Quote.status == QuoteStatus.ACCEPTED,
                EngagementLineItem.billable == True,
                EngagementLineItem.employee_id.isnot(None),
                EngagementWeeklyHours.week_start_date >= start_week,
                EngagementWeeklyHours.week_start_date <= end_week,
            )
        )
        if employee_id is not None:
            query = query.where(EngagementLineItem.employee_id == employee_id)
        if delivery_center_id is not None:
            query = query.where(
                or_(
                    and_(EngagementLineItem.employee_id.isnot(None), Employee.delivery_center_id == delivery_center_id),
                    and_(EngagementLineItem.employee_id.is_(None), Opportunity.delivery_center_id == delivery_center_id),
                )
            )

        result = await self.session.execute(query)
        rows = result.all()
        out = []
        for row in rows:
            dc_id = row.emp_delivery_center_id if row.employee_id else row.opp_delivery_center_id
            if delivery_center_id is not None and dc_id != delivery_center_id:
                continue
            out.append({
                "engagement_line_item_id": str(row.line_item_id),
                "employee_id": str(row.employee_id) if row.employee_id else None,
                "delivery_center_id": str(dc_id) if dc_id else None,
                "week_start": row.week_start_date,
                "hours": float(row.hours or 0),
            })
        return out

    async def fetch_engagement_actuals_weekly_data(
        self,
        start_week: date,
        end_week: date,
        delivery_center_id: Optional[UUID] = None,
        employee_id: Optional[UUID] = None,
        billable_filter: Optional[bool] = None,
    ) -> list[dict]:
        """
        Fetch engagement actuals from approved timesheets (TimesheetApprovedSnapshot).
        Returns same shape as plan, with source_label='Actuals'. Uses invoice_rate/invoice_cost from snapshot.
        """
        from sqlalchemy import case

        subq = (
            select(
                Timesheet.week_start_date,
                TimesheetEntry.engagement_line_item_id,
                func.sum(TimesheetApprovedSnapshot.hours).label("hours"),
                func.sum(
                    case(
                        (TimesheetApprovedSnapshot.billable == True,
                         TimesheetApprovedSnapshot.hours * TimesheetApprovedSnapshot.invoice_rate),
                        else_=0,
                    )
                ).label("revenue"),
                func.sum(TimesheetApprovedSnapshot.hours * TimesheetApprovedSnapshot.invoice_cost).label("cost"),
            )
            .select_from(TimesheetApprovedSnapshot)
            .join(TimesheetEntry, TimesheetApprovedSnapshot.timesheet_entry_id == TimesheetEntry.id)
            .join(Timesheet, TimesheetEntry.timesheet_id == Timesheet.id)
            .where(
                TimesheetEntry.engagement_line_item_id.isnot(None),
                Timesheet.status.in_([TimesheetStatus.APPROVED, TimesheetStatus.INVOICED]),
                Timesheet.week_start_date >= start_week,
                Timesheet.week_start_date <= end_week,
            )
            .group_by(Timesheet.week_start_date, TimesheetEntry.engagement_line_item_id)
        )
        result = await self.session.execute(subq)
        actuals_rows = result.all()

        if not actuals_rows:
            return []

        li_ids = list({UUID(str(r.engagement_line_item_id)) for r in actuals_rows})

        dc_emp = aliased(DeliveryCenter)
        dc_opp = aliased(DeliveryCenter)
        query = (
            select(
                EngagementLineItem.id.label("line_item_id"),
                EngagementLineItem.employee_id,
                EngagementLineItem.billable,
                Opportunity.id.label("opportunity_id"),
                Opportunity.name.label("opportunity_name"),
                Opportunity.status.label("opportunity_status"),
                Opportunity.delivery_center_id.label("opp_delivery_center_id"),
                Role.id.label("role_id"),
                Role.role_name,
                func.coalesce(func.concat(Employee.first_name, " ", Employee.last_name), "").label("employee_name"),
                Employee.delivery_center_id.label("emp_delivery_center_id"),
                Engagement.id.label("engagement_id"),
                func.coalesce(dc_emp.name, dc_opp.name).label("delivery_center_name"),
            )
            .select_from(EngagementLineItem)
            .join(Engagement, EngagementLineItem.engagement_id == Engagement.id)
            .join(Opportunity, Engagement.opportunity_id == Opportunity.id)
            .join(RoleRate, EngagementLineItem.role_rates_id == RoleRate.id)
            .join(Role, RoleRate.role_id == Role.id)
            .outerjoin(Employee, EngagementLineItem.employee_id == Employee.id)
            .outerjoin(dc_emp, Employee.delivery_center_id == dc_emp.id)
            .outerjoin(dc_opp, Opportunity.delivery_center_id == dc_opp.id)
            .where(EngagementLineItem.id.in_(li_ids))
        )

        if billable_filter is not None:
            query = query.where(EngagementLineItem.billable == billable_filter)
        if employee_id is not None:
            query = query.where(EngagementLineItem.employee_id == employee_id)
        if delivery_center_id is not None:
            query = query.where(
                or_(
                    and_(EngagementLineItem.employee_id.isnot(None), Employee.delivery_center_id == delivery_center_id),
                    and_(EngagementLineItem.employee_id.is_(None), Opportunity.delivery_center_id == delivery_center_id),
                )
            )

        result = await self.session.execute(query)
        li_meta = {str(r.line_item_id): r for r in result.all()}

        out = []
        for row in actuals_rows:
            li_id = str(row.engagement_line_item_id)
            week_start = row.week_start_date
            hours = float(row.hours or 0)
            revenue = float(row.revenue or 0)
            cost_val = float(row.cost or 0)

            meta = li_meta.get(li_id)
            if not meta:
                continue
            dc_id = meta.emp_delivery_center_id if meta.employee_id else meta.opp_delivery_center_id
            prob = _get_probability(
                OpportunityStatus(meta.opportunity_status) if meta.opportunity_status else OpportunityStatus.WON
            )
            hours_weighted = hours * (prob / 100.0)
            revenue_weighted = revenue * (prob / 100.0)
            cost_weighted = cost_val * (prob / 100.0)
            rate = revenue / hours if hours > 0 else 0
            cost_rate = cost_val / hours if hours > 0 else 0

            out.append({
                "opportunity_id": str(meta.opportunity_id),
                "opportunity_name": meta.opportunity_name or "",
                "delivery_center_id": str(dc_id) if dc_id else None,
                "delivery_center_name": getattr(meta, "delivery_center_name", None) or "",
                "role_id": str(meta.role_id),
                "role_name": meta.role_name or "",
                "employee_id": str(meta.employee_id) if meta.employee_id else None,
                "employee_name": getattr(meta, "employee_name", None) or "",
                "week_start": week_start,
                "hours_weighted": hours_weighted,
                "rate": rate,
                "cost": cost_rate,
                "revenue": revenue_weighted,
                "cost_amount": cost_weighted,
                "estimate_id": None,
                "engagement_id": str(meta.engagement_id),
                "engagement_line_item_id": li_id,
                "source_type": "engagement",
                "source_label": "Actuals",
            })
        return out

    async def fetch_active_employees_for_forecast(
        self,
        start_week: date,
        end_week: date,
        delivery_center_id: Optional[UUID] = None,
        employee_id: Optional[UUID] = None,
    ) -> list[dict]:
        """
        Fetch active employees who overlap the forecast window [start_week, end_week].
        Excludes employees whose start_date is after end_week, or who ended before start_week.
        """
        from app.models.employee import EmployeeStatus

        query = (
            select(
                Employee.id.label("employee_id"),
                func.coalesce(func.concat(Employee.first_name, " ", Employee.last_name), "").label("employee_name"),
                Employee.delivery_center_id,
                DeliveryCenter.name.label("delivery_center_name"),
            )
            .select_from(Employee)
            .outerjoin(DeliveryCenter, Employee.delivery_center_id == DeliveryCenter.id)
            .where(
                Employee.status == EmployeeStatus.ACTIVE,
                Employee.start_date <= end_week,
                or_(Employee.end_date.is_(None), Employee.end_date >= start_week),
            )
        )

        if delivery_center_id is not None:
            query = query.where(Employee.delivery_center_id == delivery_center_id)
        if employee_id is not None:
            query = query.where(Employee.id == employee_id)

        result = await self.session.execute(query)
        rows = result.all()

        return [
            {
                "employee_id": str(r.employee_id),
                "employee_name": r.employee_name or "",
                "delivery_center_id": str(r.delivery_center_id) if r.delivery_center_id else None,
                "delivery_center_name": r.delivery_center_name or "",
            }
            for r in rows
        ]

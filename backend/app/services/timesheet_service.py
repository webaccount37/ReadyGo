"""
Timesheet service with business logic.
"""

import logging
from datetime import date, timedelta, datetime
from decimal import Decimal
import uuid
from typing import Dict, List, Optional, Tuple
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.services.base_service import BaseService
from app.db.repositories.timesheet_repository import TimesheetRepository
from app.db.repositories.timesheet_entry_repository import TimesheetEntryRepository
from app.db.repositories.timesheet_status_history_repository import TimesheetStatusHistoryRepository
from app.db.repositories.timesheet_dismissed_row_repository import TimesheetDismissedRowRepository
from app.db.repositories.opportunity_permanent_lock_repository import OpportunityPermanentLockRepository
from app.db.repositories.engagement_line_item_repository import EngagementLineItemRepository
from app.db.repositories.engagement_weekly_hours_repository import EngagementWeeklyHoursRepository
from app.db.repositories.engagement_repository import EngagementRepository
from app.db.repositories.quote_repository import QuoteRepository
from app.db.repositories.calendar_repository import CalendarRepository
from app.models.timesheet import (
    Timesheet,
    TimesheetEntry,
    TimesheetDayNote,
    TimesheetStatus,
    TimesheetEntryType,
    HOLIDAY_DISMISSED_SENTINEL,
)
from app.models.engagement import Engagement, EngagementLineItem, EngagementPhase, EngagementWeeklyHours
from app.models.employee import Employee, EmployeeStatus
from app.models.quote import InvoiceDetail
from app.utils.currency_converter import convert_currency
from app.schemas.timesheet import (
    TimesheetResponse,
    TimesheetEntryResponse,
    TimesheetEntryUpsert,
    TimesheetDayNoteResponse,
    TimesheetStatusHistoryResponse,
)

logger = logging.getLogger(__name__)

MIN_HOURS_TO_SUBMIT = Decimal("40")


def _get_week_start(d: date) -> date:
    """Get Sunday of the week for a given date."""
    days_since_sunday = (d.weekday() + 1) % 7
    return d - timedelta(days=days_since_sunday)


def _distribute_weekly_to_weekdays(weekly_total: Decimal) -> Tuple[Decimal, ...]:
    """Distribute weekly hours across Mon-Fri (8/8/8/8/8 for 40)."""
    # 5 workdays
    base = (weekly_total / 5).quantize(Decimal("0.01"))
    remainder = weekly_total - (base * 5)
    # Put remainder on Friday (index 4)
    mon, tue, wed, thu = base, base, base, base
    fri = base + remainder
    return (Decimal("0"), mon, tue, wed, thu, fri, Decimal("0"))  # Sun, Mon..Sat


class TimesheetService(BaseService):
    """Service for timesheet operations."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.timesheet_repo = TimesheetRepository(session)
        self.entry_repo = TimesheetEntryRepository(session)
        self.status_history_repo = TimesheetStatusHistoryRepository(session)
        self.dismissed_repo = TimesheetDismissedRowRepository(session)
        self.lock_repo = OpportunityPermanentLockRepository(session)
        self.line_item_repo = EngagementLineItemRepository(session)
        self.weekly_hours_repo = EngagementWeeklyHoursRepository(session)
        self.engagement_repo = EngagementRepository(session)
        self.quote_repo = QuoteRepository(session)
        self.calendar_repo = CalendarRepository(session)

    async def _engagement_for_line_item(
        self,
        line_item: EngagementLineItem,
        cache: Dict[UUID, Engagement],
    ) -> Optional[Engagement]:
        """Load engagement (phases + opportunity) with per-request cache; uses get, not get_with_line_items."""
        eid = line_item.engagement_id
        if eid in cache:
            return cache[eid]
        eng = await self.engagement_repo.get(eid)
        if eng:
            cache[eid] = eng
        return eng

    async def get_or_create_timesheet(
        self,
        employee_id: UUID,
        week_start_date: date,
    ) -> TimesheetResponse:
        """Get or create timesheet for employee and week. Populate from resource plan if new/empty."""
        timesheet = await self.timesheet_repo.get_by_employee_and_week(employee_id, week_start_date)
        if not timesheet:
            timesheet = await self.timesheet_repo.create(
                employee_id=employee_id,
                week_start_date=week_start_date,
                status=TimesheetStatus.NOT_SUBMITTED,
            )
            await self._default_entries_from_resource_plan(timesheet)
            await self._add_holiday_entries(timesheet)
        else:
            # Only add engagements/holidays to NOT_SUBMITTED or REOPENED timesheets
            if timesheet.status in (TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED):
                existing_entries = await self.entry_repo.list_by_timesheet(timesheet.id)
                if not existing_entries:
                    await self._default_entries_from_resource_plan(timesheet)
                else:
                    # Add any new engagement entries (e.g. from newly approved engagements)
                    await self._add_missing_engagement_entries(timesheet)
                await self._add_holiday_entries(timesheet)
                await self._refresh_entry_hours_from_plan(timesheet)
        await self.session.commit()
        timesheet = await self.timesheet_repo.get_by_employee_and_week(employee_id, week_start_date)
        if timesheet:
            fresh_entries = await self.entry_repo.list_by_timesheet(timesheet.id)
            return await self._to_response(timesheet, entries_override=fresh_entries)
        return await self._to_response(timesheet)

    async def ensure_timesheets_for_engagement_employees(
        self, engagement_ids: List[UUID], max_weeks_back: int = 12
    ) -> None:
        """Create missing timesheets for employees on these engagements so approvers can see them."""
        if not engagement_ids:
            return
        result = await self.session.execute(
            select(
                EngagementLineItem.employee_id,
                EngagementLineItem.start_date,
                EngagementLineItem.end_date,
            )
            .where(
                EngagementLineItem.engagement_id.in_(engagement_ids),
                EngagementLineItem.employee_id.isnot(None),
            )
            .distinct()
        )
        rows = result.fetchall()
        today = date.today()
        end_of_current_week = _get_week_start(today) + timedelta(days=6)
        oldest_week = today - timedelta(days=7 * max_weeks_back)
        oldest_week_start = _get_week_start(oldest_week)

        seen: set[tuple[UUID, date]] = set()
        for employee_id, start_date, end_date in rows:
            if not employee_id:
                continue
            week_start = _get_week_start(start_date)
            if week_start < oldest_week_start:
                week_start = oldest_week_start
            week_end = week_start + timedelta(days=6)
            range_end = end_date if end_date else end_of_current_week
            if range_end > end_of_current_week:
                range_end = end_of_current_week
            while week_start <= range_end:
                if week_end >= start_date and (not end_date or week_start <= end_date):
                    key = (employee_id, week_start)
                    if key not in seen:
                        seen.add(key)
                        existing = await self.timesheet_repo.get_by_employee_and_week(
                            employee_id, week_start
                        )
                        if not existing:
                            ts = await self.timesheet_repo.create(
                                employee_id=employee_id,
                                week_start_date=week_start,
                                status=TimesheetStatus.NOT_SUBMITTED,
                            )
                            await self._default_entries_from_resource_plan(ts)
                            await self._add_holiday_entries(ts)
                week_start += timedelta(days=7)
                week_end = week_start + timedelta(days=6)
        if seen:
            await self.session.commit()

    async def ensure_timesheets_for_dc_employees(
        self, delivery_center_ids: List[UUID], max_weeks_back: int = 12
    ) -> None:
        """Create missing timesheets for ALL employees in these delivery centers.
        Timesheets are required every week from employee start_date through current week.
        Employees need to submit timesheets even without engagements.
        Does not create timesheets for weeks before employee start_date.
        """
        if not delivery_center_ids:
            return
        result = await self.session.execute(
            select(Employee.id, Employee.start_date).where(
                Employee.delivery_center_id.in_(delivery_center_ids),
                Employee.status.in_([EmployeeStatus.ACTIVE, EmployeeStatus.ON_LEAVE]),
            )
        )
        rows = result.fetchall()
        today = date.today()
        end_of_current_week = _get_week_start(today) + timedelta(days=6)
        oldest_week = today - timedelta(days=7 * max_weeks_back)
        oldest_week_start = _get_week_start(oldest_week)

        seen: set[tuple[UUID, date]] = set()
        for employee_id, emp_start_date in rows:
            if not employee_id or not emp_start_date:
                continue
            # First week = week containing employee start_date (timesheets not required before)
            week_start = _get_week_start(emp_start_date)
            if week_start < oldest_week_start:
                week_start = oldest_week_start
            week_end = week_start + timedelta(days=6)
            # Skip if week ends before employee started
            if week_end < emp_start_date:
                week_start += timedelta(days=7)
                week_end = week_start + timedelta(days=6)
            while week_start <= end_of_current_week:
                if week_end >= emp_start_date:
                    key = (employee_id, week_start)
                    if key not in seen:
                        seen.add(key)
                        existing = await self.timesheet_repo.get_by_employee_and_week(
                            employee_id, week_start
                        )
                        if not existing:
                            ts = await self.timesheet_repo.create(
                                employee_id=employee_id,
                                week_start_date=week_start,
                                status=TimesheetStatus.NOT_SUBMITTED,
                            )
                            await self._default_entries_from_resource_plan(ts)
                            await self._add_holiday_entries(ts)
                week_start += timedelta(days=7)
                week_end = week_start + timedelta(days=6)
        if seen:
            await self.session.commit()

    async def sync_engagement_to_timesheets(
        self,
        engagement_id: UUID,
        future_weeks: int = 52,
    ) -> None:
        """Sync an engagement to all relevant timesheets (NOT_SUBMITTED/REOPENED only).

        When an engagement is created or changes, adds timesheet entries for employees
        on that engagement for overlapping weeks. Skips APPROVED and INVOICED timesheets.
        """
        line_items = await self.line_item_repo.list_by_engagement(engagement_id)
        if not line_items:
            return
        engagement = await self.engagement_repo.get(engagement_id)
        if not engagement or not engagement.opportunity:
            return
        li_ids = [li.id for li in line_items]
        all_ewh = await self.weekly_hours_repo.list_by_engagement_line_item_ids(li_ids)
        plan_index: Dict[Tuple[UUID, date], Decimal] = {}
        for ewh in all_ewh:
            plan_index[(ewh.engagement_line_item_id, ewh.week_start_date)] = Decimal(str(ewh.hours))
        engagement_cache: Dict[UUID, Engagement] = {engagement_id: engagement}

        today = date.today()
        end_of_current_week = _get_week_start(today) + timedelta(days=6)
        future_cutoff = today + timedelta(days=7 * future_weeks)

        seen: set[tuple[UUID, date]] = set()
        for line_item in line_items:
            if not line_item.employee_id:
                continue
            start_date = line_item.start_date
            end_date = line_item.end_date or end_of_current_week
            if end_date > future_cutoff:
                end_date = future_cutoff
            week_start = _get_week_start(start_date)
            week_end = week_start + timedelta(days=6)
            while week_start <= end_date:
                if week_end >= start_date:
                    seen.add((line_item.employee_id, week_start))
                week_start += timedelta(days=7)
                week_end = week_start + timedelta(days=6)
        if not seen:
            return
        keys = list(seen)
        existing_ts = await self.timesheet_repo.list_by_employee_week_keys(keys)
        timesheet_by_key = {(t.employee_id, t.week_start_date): t for t in existing_ts}
        for emp_id, week_start in keys:
            timesheet = timesheet_by_key.get((emp_id, week_start))
            if not timesheet:
                timesheet = await self.timesheet_repo.create(
                    employee_id=emp_id,
                    week_start_date=week_start,
                    status=TimesheetStatus.NOT_SUBMITTED,
                )
                await self._default_entries_from_resource_plan(
                    timesheet,
                    plan_hours_by_line_and_week=plan_index,
                    engagement_cache=engagement_cache,
                )
                await self._add_holiday_entries(timesheet)
            elif timesheet.status in (TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED):
                await self._add_missing_engagement_entries(
                    timesheet,
                    plan_hours_by_line_and_week=plan_index,
                    engagement_cache=engagement_cache,
                )
        await self.session.commit()
        logger.info("Synced engagement %s to %d timesheet(s)", engagement_id, len(seen))

    async def _add_missing_engagement_entries(
        self,
        timesheet: Timesheet,
        *,
        plan_hours_by_line_and_week: Optional[Dict[Tuple[UUID, date], Decimal]] = None,
        engagement_cache: Optional[Dict[UUID, Engagement]] = None,
    ) -> None:
        """Add timesheet entries for engagement line items that don't already have an entry.
        Only affects NOT_SUBMITTED/REOPENED timesheets. Uses resource plan hours.
        Skips line items that the user has permanently dismissed."""
        week_start = timesheet.week_start_date
        line_items = await self.line_item_repo.list_by_employee_and_week(
            timesheet.employee_id, week_start
        )
        if not line_items:
            return
        cache: Dict[UUID, Engagement] = engagement_cache if engagement_cache is not None else {}
        dismissed = await self.dismissed_repo.list_dismissed_keys(timesheet.id)
        existing_entries = await self.entry_repo.list_by_timesheet(timesheet.id)
        existing_line_item_ids = {
            e.engagement_line_item_id for e in existing_entries if e.engagement_line_item_id
        }
        max_row = max((e.row_order for e in existing_entries), default=-1)

        rows_with_hours: List[Tuple[EngagementLineItem, Decimal]] = []
        for li in line_items:
            if li.id in dismissed or li.id in existing_line_item_ids:
                continue
            if plan_hours_by_line_and_week is not None:
                h = plan_hours_by_line_and_week.get((li.id, week_start), Decimal("0"))
            else:
                plan_hours = await self.weekly_hours_repo.get_by_line_item_and_week(li.id, week_start)
                h = Decimal(str(plan_hours.hours)) if plan_hours else Decimal("0")
            if h > 0:
                rows_with_hours.append((li, h))

        new_entries: List[TimesheetEntry] = []
        for line_item, plan_weekly_hours in rows_with_hours:
            eng = await self._engagement_for_line_item(line_item, cache)
            if not eng or not eng.opportunity:
                continue
            account_id = eng.opportunity.account_id
            week_end = week_start + timedelta(days=6)
            overlapping_phases = [
                p
                for p in (eng.phases or [])
                if p.start_date <= week_end and p.end_date >= week_start
            ]
            phase = min(overlapping_phases, key=lambda p: p.start_date) if overlapping_phases else None
            sun, mon, tue, wed, thu, fri, sat = _distribute_weekly_to_weekdays(plan_weekly_hours)
            max_row += 1
            new_entries.append(
                TimesheetEntry(
                    id=uuid.uuid4(),
                    timesheet_id=timesheet.id,
                    row_order=max_row,
                    entry_type=TimesheetEntryType.ENGAGEMENT,
                    account_id=account_id,
                    engagement_id=line_item.engagement_id,
                    opportunity_id=eng.opportunity_id,
                    engagement_line_item_id=line_item.id,
                    engagement_phase_id=phase.id if phase else None,
                    billable=line_item.billable,
                    sun_hours=sun,
                    mon_hours=mon,
                    tue_hours=tue,
                    wed_hours=wed,
                    thu_hours=thu,
                    fri_hours=fri,
                    sat_hours=sat,
                )
            )
        await self.entry_repo.add_all_with_flush(new_entries)

    async def _refresh_entry_hours_from_plan(self, timesheet: Timesheet) -> None:
        """Sync timesheet entry hours from resource plan. Updates entries to match plan.
        When plan has 0 hours, removes the entry (user must add manually via Add Row)."""
        week_start = timesheet.week_start_date
        existing_entries = await self.entry_repo.list_by_timesheet(timesheet.id)
        for entry in existing_entries:
            if not entry.engagement_line_item_id or getattr(entry, "is_holiday_row", False):
                continue
            plan_hours = await self.weekly_hours_repo.get_by_line_item_and_week(
                entry.engagement_line_item_id, week_start
            )
            plan_weekly = Decimal(str(plan_hours.hours)) if plan_hours else Decimal("0")
            if plan_weekly <= 0:
                await self.dismissed_repo.add_dismissed(timesheet.id, entry.engagement_line_item_id)
                await self.entry_repo.delete(entry.id)
                continue
            sun, mon, tue, wed, thu, fri, sat = _distribute_weekly_to_weekdays(plan_weekly)
            await self.entry_repo.update(
                entry.id,
                sun_hours=sun,
                mon_hours=mon,
                tue_hours=tue,
                wed_hours=wed,
                thu_hours=thu,
                fri_hours=fri,
                sat_hours=sat,
            )
        await self.session.flush()

    async def _default_entries_from_resource_plan(
        self,
        timesheet: Timesheet,
        *,
        plan_hours_by_line_and_week: Optional[Dict[Tuple[UUID, date], Decimal]] = None,
        engagement_cache: Optional[Dict[UUID, Engagement]] = None,
    ) -> None:
        """Populate timesheet entries from engagement resource plan."""
        week_start = timesheet.week_start_date
        line_items = await self.line_item_repo.list_by_employee_and_week(
            timesheet.employee_id, week_start
        )
        if not line_items:
            return
        cache: Dict[UUID, Engagement] = engagement_cache if engagement_cache is not None else {}

        rows_with_hours: List[Tuple[EngagementLineItem, Decimal]] = []
        for li in line_items:
            if plan_hours_by_line_and_week is not None:
                h = plan_hours_by_line_and_week.get((li.id, week_start), Decimal("0"))
            else:
                plan_hours = await self.weekly_hours_repo.get_by_line_item_and_week(li.id, week_start)
                h = Decimal(str(plan_hours.hours)) if plan_hours else Decimal("0")
            if h > 0:
                rows_with_hours.append((li, h))

        new_entries: List[TimesheetEntry] = []
        for row_order, (line_item, plan_weekly_hours) in enumerate(rows_with_hours):
            engagement = await self._engagement_for_line_item(line_item, cache)
            if not engagement or not engagement.opportunity:
                continue
            account_id = engagement.opportunity.account_id
            week_end = week_start + timedelta(days=6)
            overlapping_phases = [
                p
                for p in (engagement.phases or [])
                if p.start_date <= week_end and p.end_date >= week_start
            ]
            phase = None
            if overlapping_phases:
                phase = min(overlapping_phases, key=lambda p: p.start_date)
            sun, mon, tue, wed, thu, fri, sat = _distribute_weekly_to_weekdays(plan_weekly_hours)
            new_entries.append(
                TimesheetEntry(
                    id=uuid.uuid4(),
                    timesheet_id=timesheet.id,
                    row_order=row_order,
                    entry_type=TimesheetEntryType.ENGAGEMENT,
                    account_id=account_id,
                    engagement_id=line_item.engagement_id,
                    opportunity_id=engagement.opportunity_id,
                    engagement_line_item_id=line_item.id,
                    engagement_phase_id=phase.id if phase else None,
                    billable=line_item.billable,
                    sun_hours=sun,
                    mon_hours=mon,
                    tue_hours=tue,
                    wed_hours=wed,
                    thu_hours=thu,
                    fri_hours=fri,
                    sat_hours=sat,
                )
            )
        await self.entry_repo.add_all_with_flush(new_entries)

    async def _add_holiday_entries(
        self, timesheet: Timesheet, ignore_dismissed: bool = False
    ) -> None:
        """Add holiday row from Calendar for employee's delivery center if events exist and no holiday row yet.
        Uses display-only fields (account_display_name, engagement_display_name) to show Ready/PTO on the
        timesheet without creating actual Account/Project records.
        Skips if user has permanently dismissed the holiday row (unless ignore_dismissed=True, e.g. from Load Defaults)."""
        if not ignore_dismissed:
            dismissed = await self.dismissed_repo.list_dismissed_keys(timesheet.id)
            if HOLIDAY_DISMISSED_SENTINEL in dismissed:
                logger.info(
                    "Timesheet holiday skip: timesheet %s has dismissed holiday row",
                    timesheet.id,
                )
                return
        emp_result = await self.session.execute(
            select(Employee.delivery_center_id).where(Employee.id == timesheet.employee_id)
        )
        row = emp_result.fetchone()
        dc_id = row[0] if row else None
        if not dc_id:
            logger.info(
                "Timesheet holiday skip: employee %s has no delivery_center_id",
                timesheet.employee_id,
            )
            return
        # Use explicit query to avoid lazy-loading timesheet.entries (causes MissingGreenlet in async)
        existing_entries = await self.entry_repo.list_by_timesheet(timesheet.id)
        has_holiday = any(getattr(e, "is_holiday_row", False) for e in existing_entries)
        if has_holiday:
            logger.info(
                "Timesheet holiday skip: timesheet %s already has holiday row",
                timesheet.id,
            )
            return
        week_start = timesheet.week_start_date
        week_end = week_start + timedelta(days=6)
        events = await self.calendar_repo.list_by_delivery_center_and_date_range(
            dc_id, week_start, week_end
        )
        if not events:
            return
        hours_by_dow = [Decimal("0")] * 7
        for ev in events:
            dow = (ev.date.weekday() + 1) % 7
            hours_by_dow[dow] += Decimal(str(ev.hours or 8))
        if sum(hours_by_dow) == 0:
            # Do not add a holiday row when total hours would be 0 (no holidays or all 0-hour events).
            return
        logger.info(
            "Timesheet holiday: adding row for timesheet %s (dc=%s, week %s–%s, %d events)",
            timesheet.id,
            dc_id,
            week_start,
            week_end,
            len(events),
        )
        max_row = max((e.row_order for e in existing_entries), default=-1)
        await self.entry_repo.create(
            timesheet_id=timesheet.id,
            row_order=max_row + 1,
            entry_type=TimesheetEntryType.HOLIDAY,
            account_id=None,
            account_display_name="Ready",
            engagement_display_name="PTO",
            engagement_id=None,
            opportunity_id=None,
            engagement_phase_id=None,
            billable=False,
            is_holiday_row=True,
            sun_hours=hours_by_dow[0],
            mon_hours=hours_by_dow[1],
            tue_hours=hours_by_dow[2],
            wed_hours=hours_by_dow[3],
            thu_hours=hours_by_dow[4],
            fri_hours=hours_by_dow[5],
            sat_hours=hours_by_dow[6],
        )
        await self.session.flush()
        logger.info(
            "Timesheet holiday added: timesheet=%s dc=%s week=%s–%s events=%d",
            timesheet.id,
            dc_id,
            week_start,
            week_end,
            len(events),
        )

    async def _ensure_resource_plan_zero_entries(self, timesheet: Timesheet) -> None:
        """Ensure billable engagements the employee is assigned to (via Resource Plan) have a timesheet entry, even if 0 hours.
        Non-billable rows (Sales, non-billable Engagement) stay deleted when user removes them.
        Skips line items that the user has permanently dismissed."""
        dismissed = await self.dismissed_repo.list_dismissed_keys(timesheet.id)
        week_start = timesheet.week_start_date
        line_items = await self.line_item_repo.list_by_employee_and_week(
            timesheet.employee_id, week_start
        )
        # Use explicit query to avoid lazy-loading timesheet.entries (causes MissingGreenlet in async)
        existing_entries = await self.entry_repo.list_by_timesheet(timesheet.id)
        existing_line_item_ids = {
            e.engagement_line_item_id
            for e in existing_entries
            if e.engagement_line_item_id
        }
        max_row = max((e.row_order for e in existing_entries), default=-1)
        for line_item in line_items:
            if not line_item.billable:
                continue  # only add back billable Resource Plan engagements; non-billable stay deleted
            if line_item.id in dismissed or line_item.id in existing_line_item_ids:
                continue
            plan_hours = await self.weekly_hours_repo.get_by_line_item_and_week(line_item.id, week_start)
            if not plan_hours or Decimal(str(plan_hours.hours)) <= 0:
                continue  # skip 0-hour engagements - user must add manually
            plan_weekly = Decimal(str(plan_hours.hours))
            sun, mon, tue, wed, thu, fri, sat = _distribute_weekly_to_weekdays(plan_weekly)
            engagement = await self.engagement_repo.get(line_item.engagement_id)
            if not engagement or not engagement.opportunity:
                continue
            account_id = engagement.opportunity.account_id
            week_end = week_start + timedelta(days=6)
            overlapping_phases = [
                p
                for p in (engagement.phases or [])
                if p.start_date <= week_end and p.end_date >= week_start
            ]
            phase = min(overlapping_phases, key=lambda p: p.start_date) if overlapping_phases else None
            max_row += 1
            await self.entry_repo.create(
                timesheet_id=timesheet.id,
                row_order=max_row,
                entry_type=TimesheetEntryType.ENGAGEMENT,
                account_id=account_id,
                engagement_id=line_item.engagement_id,
                opportunity_id=engagement.opportunity_id,
                engagement_line_item_id=line_item.id,
                engagement_phase_id=phase.id if phase else None,
                billable=line_item.billable,
                sun_hours=sun,
                mon_hours=mon,
                tue_hours=tue,
                wed_hours=wed,
                thu_hours=thu,
                fri_hours=fri,
                sat_hours=sat,
            )

    async def get_timesheet(
        self,
        timesheet_id: UUID,
        current_employee_id: UUID,
    ) -> Optional[TimesheetResponse]:
        """Get timesheet by ID. Employee can only get own; approvers can get others'."""
        timesheet = await self.timesheet_repo.get(timesheet_id)
        if not timesheet:
            return None
        if timesheet.employee_id != current_employee_id:
            # Check if current user is approver - simplified: allow for now
            pass
        if timesheet.status in (TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED):
            await self._add_missing_engagement_entries(timesheet)
            await self._add_holiday_entries(timesheet)
            await self._refresh_entry_hours_from_plan(timesheet)
        await self.session.commit()
        fresh_entries = await self.entry_repo.list_by_timesheet(timesheet.id)
        return await self._to_response(timesheet, entries_override=fresh_entries)

    async def get_timesheet_for_week(
        self,
        employee_id: UUID,
        week_start_date: date,
        current_employee_id: UUID,
    ) -> Optional[TimesheetResponse]:
        """Get timesheet for employee and week. Owner or approver can access."""
        if employee_id != current_employee_id:
            timesheet = await self.timesheet_repo.get_by_employee_and_week(employee_id, week_start_date)
            if not timesheet:
                timesheet = await self.timesheet_repo.get_or_create(employee_id, week_start_date)
                await self._default_entries_from_resource_plan(timesheet)
            elif timesheet.status in (TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED):
                await self._add_missing_engagement_entries(timesheet)
            if timesheet and timesheet.status in (TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED):
                await self._add_holiday_entries(timesheet)
                await self._refresh_entry_hours_from_plan(timesheet)
            await self.session.commit()
            from app.services.timesheet_approval_service import TimesheetApprovalService
            approval_svc = TimesheetApprovalService(self.session)
            if not await approval_svc._can_approve_async(current_employee_id, timesheet):
                return None
        else:
            timesheet = await self.timesheet_repo.get_by_employee_and_week(employee_id, week_start_date)
            if not timesheet:
                timesheet = await self.timesheet_repo.get_or_create(employee_id, week_start_date)
                await self._default_entries_from_resource_plan(timesheet)
            elif timesheet.status in (TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED):
                await self._add_missing_engagement_entries(timesheet)
            if timesheet and timesheet.status in (TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED):
                await self._add_holiday_entries(timesheet)
                await self._refresh_entry_hours_from_plan(timesheet)
            await self.session.commit()
        timesheet = await self.timesheet_repo.get_by_employee_and_week(employee_id, week_start_date)
        if not timesheet:
            return None
        fresh_entries = await self.entry_repo.list_by_timesheet(timesheet.id)
        return await self._to_response(timesheet, entries_override=fresh_entries)

    async def save_entries(
        self,
        timesheet_id: UUID,
        entries: List[TimesheetEntryUpsert],
        current_employee_id: UUID,
    ) -> TimesheetResponse:
        """Save timesheet entries (draft/REOPENED). Owner or approver can edit (approver = proxy edit)."""
        timesheet = await self.timesheet_repo.get(timesheet_id)
        if not timesheet:
            raise ValueError("Timesheet not found")
        if timesheet.status not in (TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED):
            raise ValueError("Cannot edit timesheet in current status")
        if timesheet.employee_id != current_employee_id:
            from app.services.timesheet_approval_service import TimesheetApprovalService
            approval_svc = TimesheetApprovalService(self.session)
            if not await approval_svc._can_approve_async(current_employee_id, timesheet):
                raise ValueError("Only the timesheet owner or an approver can edit this timesheet")

        # Use explicit query to avoid lazy-loading timesheet.entries (MissingGreenlet in async)
        existing_entries = await self.entry_repo.list_by_timesheet(timesheet_id)
        ids_in_payload = {e.id for e in entries if e.id}
        for existing in existing_entries:
            if existing.id not in ids_in_payload:
                # Record in dismissed before deleting so row won't come back on refresh
                if getattr(existing, "is_holiday_row", False):
                    await self.dismissed_repo.add_dismissed(timesheet_id, HOLIDAY_DISMISSED_SENTINEL)
                elif existing.engagement_line_item_id:
                    await self.dismissed_repo.add_dismissed(timesheet_id, existing.engagement_line_item_id)
                await self.entry_repo.delete(existing.id)
        await self.session.flush()

        for i, entry_data in enumerate(entries):
            data = entry_data.model_dump(exclude_unset=True)
            day_notes = data.pop("day_notes", None)
            entry_id = data.pop("id", None)

            if entry_id:
                entry = await self.entry_repo.get(entry_id)
                if entry:
                    if getattr(entry, "is_holiday_row", False):
                        update_data = {"row_order": i}
                        await self.entry_repo.update(entry_id, **update_data)
                    else:
                        update_data = {k: v for k, v in data.items() if k in (
                            "entry_type", "account_id", "engagement_id", "opportunity_id",
                            "engagement_line_item_id", "engagement_phase_id", "billable",
                            "sun_hours", "mon_hours", "tue_hours", "wed_hours",
                            "thu_hours", "fri_hours", "sat_hours",
                        )}
                        update_data["row_order"] = i
                        await self.entry_repo.update(entry_id, **update_data)
                        if day_notes is not None:
                            await self._save_day_notes(entry_id, day_notes)
                    continue

            is_holiday_create = (
                data.get("entry_type") == TimesheetEntryType.HOLIDAY
                or (isinstance(data.get("entry_type"), str) and data.get("entry_type") == "HOLIDAY")
            )
            if is_holiday_create:
                # User-added Holiday row: create with 0 hours (no calendar events).
                # Do NOT call _add_holiday_entries - that is for auto-populating from Calendar on load.
                create_data = {
                    "timesheet_id": timesheet_id,
                    "row_order": i,
                    "entry_type": TimesheetEntryType.HOLIDAY,
                    "account_id": None,
                    "account_display_name": "Ready",
                    "engagement_display_name": "PTO",
                    "engagement_id": None,
                    "opportunity_id": None,
                    "engagement_phase_id": None,
                    "billable": False,
                    "is_holiday_row": False,
                    "sun_hours": data.get("sun_hours", 0) or 0,
                    "mon_hours": data.get("mon_hours", 0) or 0,
                    "tue_hours": data.get("tue_hours", 0) or 0,
                    "wed_hours": data.get("wed_hours", 0) or 0,
                    "thu_hours": data.get("thu_hours", 0) or 0,
                    "fri_hours": data.get("fri_hours", 0) or 0,
                    "sat_hours": data.get("sat_hours", 0) or 0,
                }
                await self.entry_repo.create(**create_data)
                continue
            create_data = {
                k: v for k, v in data.items()
                if k in (
                    "entry_type", "account_id", "engagement_id", "opportunity_id",
                    "engagement_line_item_id", "engagement_phase_id", "billable",
                    "sun_hours", "mon_hours", "tue_hours", "wed_hours",
                    "thu_hours", "fri_hours", "sat_hours",
                ) and v is not None
            }
            create_data.setdefault("entry_type", TimesheetEntryType.ENGAGEMENT)
            create_data.setdefault("billable", True)
            create_data.setdefault("sun_hours", 0)
            create_data.setdefault("mon_hours", 0)
            create_data.setdefault("tue_hours", 0)
            create_data.setdefault("wed_hours", 0)
            create_data.setdefault("thu_hours", 0)
            create_data.setdefault("fri_hours", 0)
            create_data.setdefault("sat_hours", 0)
            entry = await self.entry_repo.create(
                timesheet_id=timesheet_id,
                row_order=i,
                **create_data,
            )
            if day_notes:
                await self._save_day_notes(entry.id, day_notes)

        # Record "Entries saved" in status history
        await self.status_history_repo.create(
            timesheet_id=timesheet_id,
            from_status=timesheet.status,
            to_status=timesheet.status,
            changed_by_employee_id=current_employee_id,
            note="Entries saved",
        )

        await self.session.commit()
        timesheet = await self.timesheet_repo.get(timesheet_id)
        if timesheet:
            fresh_entries = await self.entry_repo.list_by_timesheet(timesheet.id)
            return await self._to_response(timesheet, entries_override=fresh_entries)
        raise ValueError("Timesheet not found")

    async def load_defaults_to_timesheet(
        self,
        timesheet_id: UUID,
        current_employee_id: UUID,
    ) -> TimesheetResponse:
        """Reset timesheet to default state: clear dismissed rows, delete all entries, repopulate from resource plan and holidays."""
        timesheet = await self.timesheet_repo.get(timesheet_id)
        if not timesheet:
            raise ValueError("Timesheet not found")
        if timesheet.status not in (TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED):
            raise ValueError("Cannot reset timesheet in current status")
        if timesheet.employee_id != current_employee_id:
            from app.services.timesheet_approval_service import TimesheetApprovalService
            approval_svc = TimesheetApprovalService(self.session)
            if not await approval_svc._can_approve_async(current_employee_id, timesheet):
                raise ValueError("Only the timesheet owner or an approver can reset this timesheet")

        await self.dismissed_repo.clear_for_timesheet(timesheet_id)
        existing_entries = await self.entry_repo.list_by_timesheet(timesheet_id)
        for entry in existing_entries:
            await self.entry_repo.delete(entry.id)
        await self.session.flush()

        await self._default_entries_from_resource_plan(timesheet)
        await self._add_holiday_entries(timesheet, ignore_dismissed=True)
        await self.session.commit()

        timesheet = await self.timesheet_repo.get(timesheet_id)
        if timesheet:
            fresh_entries = await self.entry_repo.list_by_timesheet(timesheet.id)
            return await self._to_response(timesheet, entries_override=fresh_entries)
        raise ValueError("Timesheet not found")

    async def _save_day_notes(self, entry_id: UUID, day_notes: list) -> None:
        """Save day notes for an entry."""
        from app.models.timesheet import TimesheetDayNote

        # Delete existing
        result = await self.session.execute(
            select(TimesheetDayNote).where(TimesheetDayNote.timesheet_entry_id == entry_id)
        )
        for note in result.scalars().all():
            await self.session.delete(note)
        await self.session.flush()

        for dn in day_notes:
            note_data = dn if isinstance(dn, dict) else dn.model_dump()
            await self.session.add(
                TimesheetDayNote(
                    timesheet_entry_id=entry_id,
                    day_of_week=note_data["day_of_week"],
                    note=note_data.get("note"),
                )
            )

    async def _ensure_permanent_lock(self, engagement_id: UUID, timesheet_id: UUID) -> None:
        """Ensure opportunity is permanently locked."""
        engagement = await self.engagement_repo.get(engagement_id)
        if not engagement:
            return
        opp_id = engagement.opportunity_id
        existing = await self.lock_repo.get_by_opportunity(opp_id)
        if not existing:
            await self.lock_repo.create(
                opportunity_id=opp_id,
                locked_by_timesheet_id=timesheet_id,
            )
            logger.info(f"Permanent lock created for opportunity {opp_id}")

    async def submit_timesheet(
        self,
        timesheet_id: UUID,
        current_employee_id: UUID,
        force: bool = False,
    ) -> Tuple[TimesheetResponse, Optional[str]]:
        """Submit timesheet. Returns (response, warning_message).
        Submission is allowed for any week including before employee start_date; only incomplete
        flagging excludes pre-start weeks. Weeks before start_date are not required but can be submitted.
        """
        timesheet = await self.timesheet_repo.get(timesheet_id)
        if not timesheet:
            raise ValueError("Timesheet not found")
        if timesheet.employee_id != current_employee_id:
            from app.services.timesheet_approval_service import TimesheetApprovalService
            approval_svc = TimesheetApprovalService(self.session)
            if not await approval_svc._can_approve_async(current_employee_id, timesheet):
                raise ValueError("Only the timesheet owner or an approver can submit this timesheet")
        if timesheet.status not in (TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED):
            raise ValueError("Timesheet cannot be submitted in current status")

        await self._ensure_resource_plan_zero_entries(timesheet)
        await self.session.flush()
        await self.session.refresh(timesheet)  # reload entries including new 0-hour rows

        # Validate rows with hours: Type, Account, and Project (for ENGAGEMENT) are required
        for entry in timesheet.entries or []:
            entry_total = sum(
                Decimal(str(getattr(entry, f"{d}_hours") or 0))
                for d in ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
            )
            if entry_total <= 0:
                continue
            entry_type = getattr(entry, "entry_type", None) or TimesheetEntryType.ENGAGEMENT
            if entry_type == TimesheetEntryType.HOLIDAY:
                continue
            if not entry.account_id:
                raise ValueError("Every timesheet row with hours must have an Account selected")
            if entry_type == TimesheetEntryType.ENGAGEMENT and not entry.engagement_id:
                raise ValueError("Every Engagement row with hours must have a Project selected")

        total = Decimal("0")
        plan_vs_actual_warnings = []
        for entry in timesheet.entries:
            entry_total = sum(
                Decimal(str(getattr(entry, f"{d}_hours") or 0))
                for d in ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
            )
            total += entry_total
            if entry.engagement_line_item_id:
                plan = await self.weekly_hours_repo.get_by_line_item_and_week(
                    entry.engagement_line_item_id, timesheet.week_start_date
                )
                if plan and entry_total != Decimal(str(plan.hours)):
                    eng = await self.engagement_repo.get(entry.engagement_id) if entry.engagement_id else None
                    name = eng.name if eng else "Unknown"
                    plan_vs_actual_warnings.append(
                        f"{name}: Plan {plan.hours}h vs Actual {entry_total}h"
                    )

        if total < MIN_HOURS_TO_SUBMIT:
            raise ValueError(f"Total hours must be at least {MIN_HOURS_TO_SUBMIT} to submit")

        if plan_vs_actual_warnings and not force:
            return (
                await self._to_response(timesheet),
                "Plan vs actual differs. Submit anyway?" + "\n".join(plan_vs_actual_warnings),
            )

        old_status = timesheet.status
        timesheet.status = TimesheetStatus.SUBMITTED
        await self.status_history_repo.create(
            timesheet_id=timesheet_id,
            from_status=old_status,
            to_status=TimesheetStatus.SUBMITTED,
            changed_by_employee_id=current_employee_id,
        )
        # Create permanent lock for each entry with engagement + hours > 0 (SUBMITTED triggers lock)
        for entry in timesheet.entries or []:
            entry_total = sum(
                Decimal(str(getattr(entry, f"{d}_hours") or 0))
                for d in ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
            )
            if entry.engagement_id and entry_total > 0:
                await self._ensure_permanent_lock(entry.engagement_id, timesheet_id)
        await self.session.commit()
        timesheet = await self.timesheet_repo.get(timesheet_id)
        if timesheet:
            fresh_entries = await self.entry_repo.list_by_timesheet(timesheet.id)
            return await self._to_response(timesheet, entries_override=fresh_entries), None
        raise ValueError("Timesheet not found")

    async def _to_response(
        self, timesheet: Timesheet, entries_override: Optional[List[TimesheetEntry]] = None
    ) -> TimesheetResponse:
        """Convert timesheet to response schema. Use entries_override when provided to avoid stale session cache."""
        entries = entries_override if entries_override is not None else (timesheet.entries or [])
        total = Decimal("0")
        entries_resp = []
        for entry in sorted(entries, key=lambda e: e.row_order):
            entry_total = sum(
                Decimal(str(getattr(entry, f"{d}_hours") or 0))
                for d in ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
            )
            total += entry_total
            plan_hours = None
            if entry.engagement_line_item_id:
                plan = await self.weekly_hours_repo.get_by_line_item_and_week(
                    entry.engagement_line_item_id, timesheet.week_start_date
                )
                if plan:
                    plan_hours = Decimal(str(plan.hours))
            requires_notes = False
            if entry.engagement_id:
                eng = await self.engagement_repo.get(entry.engagement_id)
                if eng and eng.quote_id:
                    quote = await self.quote_repo.get(eng.quote_id)
                    if quote and quote.invoice_detail == InvoiceDetail.EMPLOYEE_WITH_DESCRIPTIONS:
                        requires_notes = True
            day_notes_resp = [
                TimesheetDayNoteResponse(
                    id=n.id, timesheet_entry_id=n.timesheet_entry_id, day_of_week=n.day_of_week, note=n.note
                )
                for n in (entry.day_notes or [])
            ]
            is_holiday = getattr(entry, "is_holiday_row", False)
            account_name = (
                getattr(entry, "account_display_name", None) if is_holiday or not entry.account
                else (entry.account.company_name if entry.account else None)
            ) or (entry.account.company_name if entry.account else None)
            engagement_name = (
                getattr(entry, "engagement_display_name", None) if is_holiday or not entry.engagement
                else (entry.engagement.name if entry.engagement else None)
            ) or (entry.engagement.name if entry.engagement else None)
            phase_name_val = (
                entry.engagement_phase.name if entry.engagement_phase
                else (getattr(entry, "engagement_display_name", None) if is_holiday else None)
            )
            entries_resp.append(
                TimesheetEntryResponse(
                    id=entry.id,
                    timesheet_id=entry.timesheet_id,
                    row_order=entry.row_order,
                    entry_type=entry.entry_type.value,
                    account_id=entry.account_id,
                    account_display_name=getattr(entry, "account_display_name", None),
                    engagement_display_name=getattr(entry, "engagement_display_name", None),
                    is_holiday_row=getattr(entry, "is_holiday_row", False),
                    engagement_id=entry.engagement_id,
                    opportunity_id=entry.opportunity_id,
                    engagement_line_item_id=entry.engagement_line_item_id,
                    engagement_phase_id=entry.engagement_phase_id,
                    billable=entry.billable,
                    sun_hours=entry.sun_hours,
                    mon_hours=entry.mon_hours,
                    tue_hours=entry.tue_hours,
                    wed_hours=entry.wed_hours,
                    thu_hours=entry.thu_hours,
                    fri_hours=entry.fri_hours,
                    sat_hours=entry.sat_hours,
                    total_hours=entry_total,
                    account_name=account_name,
                    engagement_name=engagement_name,
                    opportunity_name=entry.opportunity.name if entry.opportunity else None,
                    phase_name=(
                        entry.engagement_phase.name
                        if entry.engagement_phase
                        else ("PTO" if getattr(entry, "is_holiday_row", False) else None)
                    ),
                    plan_hours=plan_hours,
                    day_notes=day_notes_resp,
                    requires_notes=requires_notes,
                )
            )
        rejection_note = None
        status_history_resp = []
        if timesheet.status_history:
            for h in reversed(sorted(timesheet.status_history, key=lambda x: x.changed_at or "")):
                if h.from_status == TimesheetStatus.SUBMITTED and h.to_status == TimesheetStatus.REOPENED and h.note:
                    rejection_note = h.note
                    break
            # Build status history for Change History section (newest first)
            sorted_history = sorted(timesheet.status_history, key=lambda x: x.changed_at or "", reverse=True)
            for h in sorted_history:
                changed_by_name = None
                if h.changed_by_employee:
                    changed_by_name = f"{h.changed_by_employee.first_name} {h.changed_by_employee.last_name}"
                status_history_resp.append(
                    TimesheetStatusHistoryResponse(
                        id=h.id,
                        timesheet_id=h.timesheet_id,
                        from_status=h.from_status.value if h.from_status else None,
                        to_status=h.to_status.value if h.to_status else None,
                        changed_by_employee_id=h.changed_by_employee_id,
                        changed_by_name=changed_by_name,
                        changed_at=h.changed_at.isoformat() if h.changed_at else "",
                        note=h.note,
                    )
                )

        return TimesheetResponse(
            id=timesheet.id,
            employee_id=timesheet.employee_id,
            week_start_date=timesheet.week_start_date.isoformat(),
            status=timesheet.status.value,
            created_at=timesheet.created_at.isoformat() if timesheet.created_at else "",
            updated_at=timesheet.updated_at.isoformat() if timesheet.updated_at else "",
            employee_name=f"{timesheet.employee.first_name} {timesheet.employee.last_name}" if timesheet.employee else None,
            total_hours=total,
            entries=entries_resp,
            rejection_note=rejection_note,
            status_history=status_history_resp,
        )

    async def count_incomplete_past_weeks(self, employee_id: UUID, employee_start_date: date) -> int:
        """Count weeks in the past (on/after employee start_date) with NOT_SUBMITTED or REOPENED status."""
        today = date.today()
        return await self.timesheet_repo.count_incomplete_past_weeks(
            employee_id, today, employee_start_date
        )

    async def list_incomplete_past_weeks(
        self, employee_id: UUID, employee_start_date: date, limit: int = 20
    ) -> List[date]:
        """List week_start_date for past weeks (on/after employee start_date) with NOT_SUBMITTED or REOPENED."""
        today = date.today()
        return await self.timesheet_repo.list_incomplete_past_weeks(
            employee_id, today, employee_start_date, limit
        )

    async def get_week_statuses(
        self,
        employee_id: UUID,
        past_weeks: int = 52,
        future_weeks: int = 12,
    ) -> dict:
        """Get timesheet status by week for carousel. Returns {week_iso: status}."""
        from datetime import timedelta

        today = date.today()
        days_since_sunday = (today.weekday() + 1) % 7
        this_sunday = today - timedelta(days=days_since_sunday)
        start_date = this_sunday - timedelta(weeks=past_weeks)
        end_date = this_sunday + timedelta(weeks=future_weeks)
        return await self.timesheet_repo.get_week_statuses(
            employee_id, start_date, end_date
        )


async def run_engagement_timesheet_sync_job(engagement_id: UUID) -> None:
    """Run sync_engagement_to_timesheets in a fresh session.

    Use from FastAPI BackgroundTasks or asyncio.create_task so the HTTP request returns
    immediately after the engagement/line data is committed; full timesheet fan-out can
    touch thousands of rows and exceed client/proxy timeouts.
    """
    from app.db.session import async_session_maker, create_sessionmaker

    if async_session_maker is None:
        create_sessionmaker()
    try:
        async with async_session_maker() as session:
            svc = TimesheetService(session)
            await svc.sync_engagement_to_timesheets(engagement_id)
    except Exception:
        logger.exception(
            "Background sync_engagement_to_timesheets failed for engagement %s",
            engagement_id,
        )

"""
Timesheet service with business logic.
"""

import logging
from datetime import date, timedelta, datetime
from decimal import Decimal
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.services.base_service import BaseService
from app.db.repositories.timesheet_repository import TimesheetRepository
from app.db.repositories.timesheet_entry_repository import TimesheetEntryRepository
from app.db.repositories.timesheet_status_history_repository import TimesheetStatusHistoryRepository
from app.db.repositories.opportunity_permanent_lock_repository import OpportunityPermanentLockRepository
from app.db.repositories.engagement_line_item_repository import EngagementLineItemRepository
from app.db.repositories.engagement_weekly_hours_repository import EngagementWeeklyHoursRepository
from app.db.repositories.engagement_repository import EngagementRepository
from app.db.repositories.quote_repository import QuoteRepository
from app.models.timesheet import (
    Timesheet,
    TimesheetEntry,
    TimesheetDayNote,
    TimesheetStatus,
    TimesheetEntryType,
)
from app.models.engagement import EngagementLineItem, EngagementPhase, EngagementWeeklyHours
from app.models.quote import InvoiceDetail
from app.utils.currency_converter import convert_currency
from app.schemas.timesheet import (
    TimesheetResponse,
    TimesheetEntryResponse,
    TimesheetEntryUpsert,
    TimesheetDayNoteResponse,
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
        self.lock_repo = OpportunityPermanentLockRepository(session)
        self.line_item_repo = EngagementLineItemRepository(session)
        self.weekly_hours_repo = EngagementWeeklyHoursRepository(session)
        self.engagement_repo = EngagementRepository(session)
        self.quote_repo = QuoteRepository(session)

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
        elif not timesheet.entries:
            await self._default_entries_from_resource_plan(timesheet)
        await self.session.commit()
        timesheet = await self.timesheet_repo.get_by_employee_and_week(employee_id, week_start_date)
        return await self._to_response(timesheet)

    async def _default_entries_from_resource_plan(self, timesheet: Timesheet) -> None:
        """Populate timesheet entries from engagement resource plan."""
        week_start = timesheet.week_start_date
        line_items = await self.line_item_repo.list_by_employee_and_week(
            timesheet.employee_id, week_start
        )
        if not line_items:
            return

        # Sort: plan hours > 0 first, then billable with 0, then rest
        rows_with_hours = []
        billable_zero = []
        other = []
        for li in line_items:
            plan_hours = await self.weekly_hours_repo.get_by_line_item_and_week(li.id, week_start)
            h = Decimal(str(plan_hours.hours)) if plan_hours else Decimal("0")
            if h > 0:
                rows_with_hours.append((li, h))
            elif li.billable:
                billable_zero.append((li, Decimal("0")))
            else:
                other.append((li, Decimal("0")))

        sorted_rows = rows_with_hours + billable_zero + other

        # Get engagement + phases for each line item
        for row_order, (line_item, plan_weekly_hours) in enumerate(sorted_rows):
            engagement = await self.engagement_repo.get_with_line_items(line_item.engagement_id)
            if not engagement or not engagement.opportunity:
                continue
            account_id = engagement.opportunity.account_id

            # Phase: overlap with week, pick earliest start_date
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

            await self.entry_repo.create(
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
        await self.session.flush()

    async def _ensure_resource_plan_zero_entries(self, timesheet: Timesheet) -> None:
        """Ensure billable engagements the employee is assigned to (via Resource Plan) have a timesheet entry, even if 0 hours.
        Non-billable rows (Sales, non-billable Engagement) stay deleted when user removes them."""
        week_start = timesheet.week_start_date
        line_items = await self.line_item_repo.list_by_employee_and_week(
            timesheet.employee_id, week_start
        )
        existing_line_item_ids = {
            e.engagement_line_item_id
            for e in (timesheet.entries or [])
            if e.engagement_line_item_id
        }
        max_row = max((e.row_order for e in (timesheet.entries or [])), default=-1)
        for line_item in line_items:
            if not line_item.billable:
                continue  # only add back billable Resource Plan engagements; non-billable stay deleted
            if line_item.id in existing_line_item_ids:
                continue
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
                sun_hours=0,
                mon_hours=0,
                tue_hours=0,
                wed_hours=0,
                thu_hours=0,
                fri_hours=0,
                sat_hours=0,
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
        return await self._to_response(timesheet)

    async def get_timesheet_for_week(
        self,
        employee_id: UUID,
        week_start_date: date,
        current_employee_id: UUID,
    ) -> Optional[TimesheetResponse]:
        """Get timesheet for employee and week."""
        if employee_id != current_employee_id:
            # Approver check - allow for now
            pass
        timesheet = await self.timesheet_repo.get_by_employee_and_week(employee_id, week_start_date)
        if not timesheet:
            timesheet = await self.timesheet_repo.get_or_create(employee_id, week_start_date)
            await self._default_entries_from_resource_plan(timesheet)
            await self.session.commit()
        return await self._to_response(timesheet)

    async def save_entries(
        self,
        timesheet_id: UUID,
        entries: List[TimesheetEntryUpsert],
        current_employee_id: UUID,
    ) -> TimesheetResponse:
        """Save timesheet entries. Triggers permanent lock if any entry has hours > 0."""
        timesheet = await self.timesheet_repo.get(timesheet_id)
        if not timesheet:
            raise ValueError("Timesheet not found")
        if timesheet.status not in (TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED):
            raise ValueError("Cannot edit timesheet in current status")

        ids_in_payload = {e.id for e in entries if e.id}
        for existing in timesheet.entries or []:
            if existing.id not in ids_in_payload:
                await self.entry_repo.delete(existing.id)
        await self.session.flush()

        for i, entry_data in enumerate(entries):
            data = entry_data.model_dump(exclude_unset=True)
            day_notes = data.pop("day_notes", None)
            entry_id = data.pop("id", None)

            if entry_id:
                entry = await self.entry_repo.get(entry_id)
                if entry:
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
                    total = sum(
                        Decimal(str(update_data.get(f"{d}_hours") or getattr(entry, f"{d}_hours") or 0))
                        for d in ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
                    )
                    engagement_id = update_data.get("engagement_id") or entry.engagement_id
                    if engagement_id and total > 0:
                        await self._ensure_permanent_lock(engagement_id, timesheet_id)
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
            total = sum(
                Decimal(str(getattr(entry, f"{d}_hours") or 0))
                for d in ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
            )
            if entry.engagement_id and total > 0:
                await self._ensure_permanent_lock(entry.engagement_id, timesheet_id)

        await self.session.commit()
        timesheet = await self.timesheet_repo.get(timesheet_id)
        return await self._to_response(timesheet)

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
        """Submit timesheet. Returns (response, warning_message)."""
        timesheet = await self.timesheet_repo.get(timesheet_id)
        if not timesheet:
            raise ValueError("Timesheet not found")
        if timesheet.employee_id != current_employee_id:
            raise ValueError("Only the timesheet owner can submit")
        if timesheet.status not in (TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED):
            raise ValueError("Timesheet cannot be submitted in current status")

        await self._ensure_resource_plan_zero_entries(timesheet)
        await self.session.flush()
        await self.session.refresh(timesheet)  # reload entries including new 0-hour rows

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
        await self.session.commit()
        timesheet = await self.timesheet_repo.get(timesheet_id)
        return await self._to_response(timesheet), None

    async def _to_response(self, timesheet: Timesheet) -> TimesheetResponse:
        """Convert timesheet to response schema."""
        total = Decimal("0")
        entries_resp = []
        for entry in sorted(timesheet.entries or [], key=lambda e: e.row_order):
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
            entries_resp.append(
                TimesheetEntryResponse(
                    id=entry.id,
                    timesheet_id=entry.timesheet_id,
                    row_order=entry.row_order,
                    entry_type=entry.entry_type.value,
                    account_id=entry.account_id,
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
                    account_name=entry.account.company_name if entry.account else None,
                    engagement_name=entry.engagement.name if entry.engagement else None,
                    opportunity_name=entry.opportunity.name if entry.opportunity else None,
                    phase_name=entry.engagement_phase.name if entry.engagement_phase else None,
                    plan_hours=plan_hours,
                    day_notes=day_notes_resp,
                    requires_notes=requires_notes,
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
        )

    async def count_incomplete_past_weeks(self, employee_id: UUID) -> int:
        """Count weeks in the past with NOT_SUBMITTED or REOPENED status."""
        today = date.today()
        return await self.timesheet_repo.count_incomplete_past_weeks(employee_id, today)

    async def list_incomplete_past_weeks(self, employee_id: UUID, limit: int = 20) -> List[date]:
        """List week_start_date for past weeks with NOT_SUBMITTED or REOPENED."""
        today = date.today()
        return await self.timesheet_repo.list_incomplete_past_weeks(employee_id, today, limit)

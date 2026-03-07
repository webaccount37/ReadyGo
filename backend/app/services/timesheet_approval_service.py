"""
Timesheet approval service - approve, reject, reopen, mark invoiced.
"""

import logging
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete

from app.services.base_service import BaseService
from app.db.repositories.timesheet_repository import TimesheetRepository
from app.db.repositories.timesheet_entry_repository import TimesheetEntryRepository
from app.db.repositories.timesheet_status_history_repository import TimesheetStatusHistoryRepository
from app.db.repositories.timesheet_approved_snapshot_repository import TimesheetApprovedSnapshotRepository
from app.db.repositories.engagement_repository import EngagementRepository
from app.db.repositories.opportunity_permanent_lock_repository import OpportunityPermanentLockRepository
from app.db.repositories.opportunity_repository import OpportunityRepository
from app.db.repositories.engagement_timesheet_approver_repository import EngagementTimesheetApproverRepository
from app.db.repositories.delivery_center_approver_repository import DeliveryCenterApproverRepository
from app.models.timesheet import Timesheet, TimesheetEntry, TimesheetStatus, TimesheetEntryType
from app.models.engagement import Engagement
from app.models.opportunity import Opportunity, OpportunityStatus
from app.models.opportunity_permanent_lock import OpportunityPermanentLock
from app.utils.currency_converter import convert_currency
from app.schemas.timesheet import (
    TimesheetResponse,
    TimesheetApprovalSummary,
    TimesheetApprovalListResponse,
    ManageableEmployeeSummary,
    ManageableEmployeesResponse,
)

logger = logging.getLogger(__name__)


class TimesheetApprovalService(BaseService):
    """Service for timesheet approval operations."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.timesheet_repo = TimesheetRepository(session)
        self.entry_repo = TimesheetEntryRepository(session)
        self.status_history_repo = TimesheetStatusHistoryRepository(session)
        self.snapshot_repo = TimesheetApprovedSnapshotRepository(session)
        self.engagement_repo = EngagementRepository(session)
        self.opportunity_repo = OpportunityRepository(session)
        self.eng_approver_repo = EngagementTimesheetApproverRepository(session)
        self.lock_repo = OpportunityPermanentLockRepository(session)

    def _can_approve(self, approver_employee_id: UUID, timesheet: Timesheet) -> bool:
        """Check if employee can approve this timesheet."""
        from app.models.delivery_center_approver import DeliveryCenterApprover
        from app.models.opportunity import Opportunity
        from sqlalchemy import select, union_all
        from app.models.engagement_timesheet_approver import EngagementTimesheetApprover
        from app.models.engagement import Engagement

        for entry in timesheet.entries or []:
            if not entry.engagement_id:
                continue
            eng = self.session.get(Engagement, entry.engagement_id)
            if not eng:
                continue
            # Engagement approver?
            approvers = [a.employee_id for a in (eng.timesheet_approvers or [])]
            if approver_employee_id in approvers:
                return True
            # DC approver?
            opp = self.session.get(Opportunity, eng.opportunity_id)
            if opp and opp.delivery_center_id:
                result = self.session.execute(
                    select(DeliveryCenterApprover.employee_id).where(
                        DeliveryCenterApprover.delivery_center_id == opp.delivery_center_id,
                        DeliveryCenterApprover.employee_id == approver_employee_id,
                    )
                )
                if result.scalar_one_or_none():
                    return True
        return False

    def _entry_labels_from_timesheet(self, ts: Timesheet) -> list[str]:
        """Build list of entry labels (accounts/engagements) for all timesheet entries."""
        labels: set[str] = set()
        for e in ts.entries or []:
            if e.entry_type == TimesheetEntryType.HOLIDAY:
                label = e.engagement_display_name or e.account_display_name or "PTO"
                if label:
                    labels.add(label)
            elif e.entry_type == TimesheetEntryType.SALES:
                if e.account and getattr(e.account, "company_name", None):
                    labels.add(e.account.company_name)
                if e.opportunity and e.opportunity.name:
                    labels.add(e.opportunity.name)
            else:
                # ENGAGEMENT (default)
                if e.engagement and e.engagement.name:
                    labels.add(e.engagement.name)
                elif e.opportunity and e.opportunity.name:
                    labels.add(e.opportunity.name)
        return sorted(labels)

    async def approve_timesheet(
        self,
        timesheet_id: UUID,
        approver_employee_id: UUID,
    ) -> TimesheetResponse:
        """Approve timesheet. Creates cost/rate snapshots."""
        timesheet = await self.timesheet_repo.get(timesheet_id)
        if not timesheet:
            raise ValueError("Timesheet not found")
        if timesheet.status != TimesheetStatus.SUBMITTED:
            raise ValueError("Only submitted timesheets can be approved")

        # Sync check - need async version of _can_approve
        can_approve = await self._can_approve_async(approver_employee_id, timesheet)
        if not can_approve:
            raise ValueError("You are not authorized to approve this timesheet")

        from app.db.repositories.engagement_line_item_repository import EngagementLineItemRepository
        line_item_repo = EngagementLineItemRepository(self.session)

        # Snapshot cost/rate for each entry (Engagement type only)
        for entry in timesheet.entries or []:
            if not entry.engagement_line_item_id or not entry.engagement_id:
                continue
            line_item = await line_item_repo.get(entry.engagement_line_item_id)
            eng = await self.engagement_repo.get(entry.engagement_id) if entry.engagement_id else None
            if not eng:
                continue
            opp = await self.opportunity_repo.get(eng.opportunity_id)
            invoice_currency = (opp and opp.default_currency) or "USD"
            rate = line_item.rate if line_item else Decimal("0")
            cost = line_item.cost if line_item else Decimal("0")
            currency = line_item.currency if line_item else "USD"

            for day in range(7):
                hours = Decimal(str(getattr(entry, f"{['sun','mon','tue','wed','thu','fri','sat'][day]}_hours") or 0))
                if hours <= 0:
                    continue
                inv_rate = await convert_currency(float(rate), currency, invoice_currency, self.session)
                inv_cost = await convert_currency(float(cost), currency, invoice_currency, self.session)
                await self.snapshot_repo.create(
                    timesheet_entry_id=entry.id,
                    day_of_week=day,
                    hours=hours,
                    cost=cost,
                    rate=rate,
                    billable=entry.billable,
                    invoice_currency=invoice_currency,
                    invoice_rate=Decimal(str(inv_rate)),
                    invoice_cost=Decimal(str(inv_cost)),
                    currency_rate_applied=Decimal("1"),
                )

        old_status = timesheet.status
        timesheet.status = TimesheetStatus.APPROVED
        await self.status_history_repo.create(
            timesheet_id=timesheet_id,
            from_status=old_status,
            to_status=TimesheetStatus.APPROVED,
            changed_by_employee_id=approver_employee_id,
        )
        # Create permanent lock for each entry with engagement + hours > 0 (APPROVED triggers lock)
        await self._ensure_permanent_lock_for_timesheet(timesheet_id)
        # Set Opportunity status to Won for each affected opportunity
        await self._set_opportunity_won_for_timesheet(timesheet_id)
        await self.session.commit()
        from app.services.timesheet_service import TimesheetService
        svc = TimesheetService(self.session)
        return await svc._to_response(await self.timesheet_repo.get(timesheet_id))

    async def _ensure_permanent_lock_for_timesheet(self, timesheet_id: UUID) -> None:
        """Ensure opportunity permanent lock for each entry with engagement + hours > 0."""
        timesheet = await self.timesheet_repo.get(timesheet_id)
        if not timesheet or not timesheet.entries:
            return
        for entry in timesheet.entries:
            entry_total = sum(
                Decimal(str(getattr(entry, f"{d}_hours") or 0))
                for d in ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
            )
            if entry.engagement_id and entry_total > 0:
                engagement = await self.engagement_repo.get(entry.engagement_id)
                if engagement:
                    opp_id = engagement.opportunity_id
                    existing = await self.lock_repo.get_by_opportunity(opp_id)
                    if not existing:
                        await self.lock_repo.create(
                            opportunity_id=opp_id,
                            locked_by_timesheet_id=timesheet_id,
                        )
                        logger.info(f"Permanent lock created for opportunity {opp_id}")

    async def _set_opportunity_won_for_timesheet(self, timesheet_id: UUID) -> None:
        """Set Opportunity status to Won for each affected opportunity when timesheet is approved."""
        from app.models.opportunity import Opportunity, OpportunityStatus
        from datetime import date

        timesheet = await self.timesheet_repo.get(timesheet_id)
        if not timesheet or not timesheet.entries:
            return
        opp_ids = set()
        for entry in timesheet.entries:
            entry_total = sum(
                Decimal(str(getattr(entry, f"{d}_hours") or 0))
                for d in ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
            )
            if entry.engagement_id and entry_total > 0:
                engagement = await self.engagement_repo.get(entry.engagement_id)
                if engagement:
                    opp_ids.add(engagement.opportunity_id)
        today = date.today()
        for opp_id in opp_ids:
            opp = await self.opportunity_repo.get(opp_id)
            if opp and opp.status != OpportunityStatus.WON:
                opp.status = OpportunityStatus.WON
                opp.close_date = today
                logger.info(f"Opportunity {opp_id} set to Won (timesheet approved)")

    BLOCKING_STATUSES = (TimesheetStatus.SUBMITTED, TimesheetStatus.APPROVED, TimesheetStatus.INVOICED)

    async def _recalculate_permanent_lock_after_status_change(self, timesheet_id: UUID) -> None:
        """
        After reject/reopen: if an opportunity no longer has any SUBMITTED/APPROVED/INVOICED
        timesheet entries with hours, remove its permanent lock.
        """
        timesheet = await self.timesheet_repo.get(timesheet_id)
        if not timesheet or not timesheet.entries:
            return
        opp_ids = set()
        for entry in timesheet.entries:
            if entry.engagement_id:
                eng = await self.engagement_repo.get(entry.engagement_id)
                if eng:
                    opp_ids.add(eng.opportunity_id)
        await self.session.flush()  # Ensure status change is visible to following query
        hours_expr = (
            func.coalesce(TimesheetEntry.sun_hours, 0) + func.coalesce(TimesheetEntry.mon_hours, 0)
            + func.coalesce(TimesheetEntry.tue_hours, 0) + func.coalesce(TimesheetEntry.wed_hours, 0)
            + func.coalesce(TimesheetEntry.thu_hours, 0) + func.coalesce(TimesheetEntry.fri_hours, 0)
            + func.coalesce(TimesheetEntry.sat_hours, 0)
        )
        for opp_id in opp_ids:
            eng_ids_subq = select(Engagement.id).where(Engagement.opportunity_id == opp_id)
            count_result = await self.session.execute(
                select(func.count())
                .select_from(TimesheetEntry)
                .join(Timesheet, TimesheetEntry.timesheet_id == Timesheet.id)
                .where(TimesheetEntry.engagement_id.in_(eng_ids_subq))
                .where(Timesheet.status.in_(self.BLOCKING_STATUSES))
                .where(hours_expr > 0)
            )
            count = count_result.scalar_one() or 0
            if count == 0:
                await self.session.execute(
                    delete(OpportunityPermanentLock).where(
                        OpportunityPermanentLock.opportunity_id == opp_id
                    )
                )
                logger.info(f"Permanent lock removed for opportunity {opp_id} (no blocking timesheets)")

    async def _can_approve_async(self, approver_employee_id: UUID, timesheet: Timesheet) -> bool:
        """Async check if employee can approve.
        Paths: (1) Engagement timesheet approver, (2) DC approver for opp's invoice center,
        (3) DC approver for employee's delivery center (can approve entire timesheet).
        """
        from app.db.repositories.delivery_center_approver_repository import DeliveryCenterApproverRepository
        from app.models.employee import Employee

        # Path 3: DC approver for employee's delivery center - can approve entire timesheet
        if timesheet.employee_id:
            employee = await self.session.get(Employee, timesheet.employee_id)
            if employee and employee.delivery_center_id:
                dc_repo = DeliveryCenterApproverRepository(self.session)
                dc_approvers = await dc_repo.get_by_delivery_center(employee.delivery_center_id)
                if any(a.employee_id == approver_employee_id for a in dc_approvers):
                    return True

        # Paths 1 & 2: Engagement approver or DC approver for opp's invoice center
        for entry in timesheet.entries or []:
            if not entry.engagement_id:
                continue
            eng = await self.engagement_repo.get(entry.engagement_id)
            if not eng:
                continue
            approvers = await self.eng_approver_repo.list_by_engagement(entry.engagement_id)
            if any(a.employee_id == approver_employee_id for a in approvers):
                return True
            dc_repo = DeliveryCenterApproverRepository(self.session)
            opp = await self.opportunity_repo.get(eng.opportunity_id)
            if opp and opp.delivery_center_id:
                dc_approvers = await dc_repo.get_by_delivery_center(opp.delivery_center_id)
                if any(a.employee_id == approver_employee_id for a in dc_approvers):
                    return True
        return False

    async def reject_timesheet(
        self,
        timesheet_id: UUID,
        approver_employee_id: UUID,
        note: str,
    ) -> TimesheetResponse:
        """Reject timesheet - status becomes REOPENED. Note is required and stored for the employee."""
        if not note or not note.strip():
            raise ValueError("A rejection note is required")
        timesheet = await self.timesheet_repo.get(timesheet_id)
        if not timesheet:
            raise ValueError("Timesheet not found")
        if timesheet.status != TimesheetStatus.SUBMITTED:
            raise ValueError("Only submitted timesheets can be rejected")

        can_approve = await self._can_approve_async(approver_employee_id, timesheet)
        if not can_approve:
            raise ValueError("You are not authorized to reject this timesheet")

        old_status = timesheet.status
        timesheet.status = TimesheetStatus.REOPENED
        await self.status_history_repo.create(
            timesheet_id=timesheet_id,
            from_status=old_status,
            to_status=TimesheetStatus.REOPENED,
            changed_by_employee_id=approver_employee_id,
            note=note.strip()[:2000],
        )
        await self._recalculate_permanent_lock_after_status_change(timesheet_id)
        await self.session.commit()
        from app.services.timesheet_service import TimesheetService
        svc = TimesheetService(self.session)
        return await svc._to_response(await self.timesheet_repo.get(timesheet_id))

    async def reopen_timesheet(
        self,
        timesheet_id: UUID,
        reopener_employee_id: UUID,
        is_approver: bool,
    ) -> TimesheetResponse:
        """Reopen timesheet. Employee can reopen SUBMITTED; Approver can reopen SUBMITTED or APPROVED."""
        timesheet = await self.timesheet_repo.get(timesheet_id)
        if not timesheet:
            raise ValueError("Timesheet not found")
        if timesheet.status == TimesheetStatus.SUBMITTED:
            if timesheet.employee_id != reopener_employee_id:
                can_approve = await self._can_approve_async(reopener_employee_id, timesheet)
                if not can_approve:
                    raise ValueError("Only owner or approver can reopen")
        elif timesheet.status == TimesheetStatus.APPROVED:
            if not is_approver:
                raise ValueError("Only approvers can reopen approved timesheets")
            can_approve = await self._can_approve_async(reopener_employee_id, timesheet)
            if not can_approve:
                raise ValueError("You are not authorized to reopen this timesheet")
        else:
            raise ValueError("Timesheet cannot be reopened in current status")

        old_status = timesheet.status
        timesheet.status = TimesheetStatus.REOPENED
        await self.status_history_repo.create(
            timesheet_id=timesheet_id,
            from_status=old_status,
            to_status=TimesheetStatus.REOPENED,
            changed_by_employee_id=reopener_employee_id,
        )
        await self._recalculate_permanent_lock_after_status_change(timesheet_id)
        await self.session.commit()
        from app.services.timesheet_service import TimesheetService
        svc = TimesheetService(self.session)
        return await svc._to_response(await self.timesheet_repo.get(timesheet_id))

    async def mark_invoiced(self, timesheet_id: UUID) -> TimesheetResponse:
        """Mark timesheet as invoiced (external API call). Idempotent."""
        timesheet = await self.timesheet_repo.get(timesheet_id)
        if not timesheet:
            raise ValueError("Timesheet not found")
        if timesheet.status == TimesheetStatus.INVOICED:
            from app.services.timesheet_service import TimesheetService
            svc = TimesheetService(self.session)
            return await svc._to_response(timesheet)
        if timesheet.status != TimesheetStatus.APPROVED:
            raise ValueError("Only approved timesheets can be marked invoiced")
        old_status = timesheet.status
        timesheet.status = TimesheetStatus.INVOICED
        await self.status_history_repo.create(
            timesheet_id=timesheet_id,
            from_status=old_status,
            to_status=TimesheetStatus.INVOICED,
            changed_by_employee_id=None,
        )
        # Create permanent lock (INVOICED treats same as APPROVED - lock may already exist from approve)
        await self._ensure_permanent_lock_for_timesheet(timesheet_id)
        await self.session.commit()
        from app.services.timesheet_service import TimesheetService
        svc = TimesheetService(self.session)
        return await svc._to_response(await self.timesheet_repo.get(timesheet_id))

    async def list_pending_approvals(
        self,
        approver_employee_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> TimesheetApprovalListResponse:
        """List timesheets pending approval for the approver."""
        timesheets = await self.timesheet_repo.list_pending_approvals_for_approver(
            approver_employee_id, skip, limit
        )
        items = []
        for ts in timesheets:
            total = sum(
                Decimal(str(getattr(e, f"{d}_hours") or 0))
                for e in (ts.entries or [])
                for d in ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
            )
            entry_labels = self._entry_labels_from_timesheet(ts)
            emp_name = f"{ts.employee.first_name} {ts.employee.last_name}" if ts.employee else ""
            items.append(
                TimesheetApprovalSummary(
                    id=ts.id,
                    employee_id=ts.employee_id,
                    employee_name=emp_name,
                    week_start_date=ts.week_start_date.isoformat(),
                    status=ts.status.value,
                    total_hours=total,
                    engagement_names=entry_labels,
                )
            )
        # Return actual count for total (sidebar uses limit=1 but needs full count)
        total_count = await self.timesheet_repo.count_pending_approvals_for_approver(
            approver_employee_id
        )
        return TimesheetApprovalListResponse(items=items, total=total_count)

    async def list_approvable_timesheets(
        self,
        approver_employee_id: UUID,
        status: str | None = None,
        employee_id: UUID | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> TimesheetApprovalListResponse:
        """List timesheets the approver can manage, with optional status and employee filters."""
        # Ensure timesheets exist for employees on engagements (so approvers see them even if employee hasn't visited)
        eng_ids = await self.eng_approver_repo.list_engagement_ids_by_approver(approver_employee_id)
        opp_dc_eng_ids = await self._get_engagement_ids_for_opp_dc_approver(approver_employee_id)
        all_eng_ids = list(set(eng_ids) | set(opp_dc_eng_ids))
        if all_eng_ids:
            from app.services.timesheet_service import TimesheetService
            ts_service = TimesheetService(self.session)
            await ts_service.ensure_timesheets_for_engagement_employees(all_eng_ids)

        status_enum = TimesheetStatus(status) if status else None
        timesheets = await self.timesheet_repo.list_approvable_timesheets_for_approver(
            approver_employee_id, status_filter=status_enum, employee_id_filter=employee_id, skip=skip, limit=limit
        )
        items = []
        for ts in timesheets:
            total = sum(
                Decimal(str(getattr(e, f"{d}_hours") or 0))
                for e in (ts.entries or [])
                for d in ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
            )
            entry_labels = self._entry_labels_from_timesheet(ts)
            emp_name = f"{ts.employee.first_name} {ts.employee.last_name}" if ts.employee else ""
            items.append(
                TimesheetApprovalSummary(
                    id=ts.id,
                    employee_id=ts.employee_id,
                    employee_name=emp_name,
                    week_start_date=ts.week_start_date.isoformat(),
                    status=ts.status.value,
                    total_hours=total,
                    engagement_names=entry_labels,
                )
            )
        return TimesheetApprovalListResponse(items=items, total=len(items))

    async def list_manageable_employees(
        self,
        approver_employee_id: UUID,
    ) -> "ManageableEmployeesResponse":
        """List employees the approver can manage (engagement approvers, opp DC approvers, employee DC)."""
        from app.schemas.timesheet import ManageableEmployeeSummary, ManageableEmployeesResponse
        from app.models.engagement import EngagementLineItem
        from app.models.employee import Employee, EmployeeStatus

        dc_repo = DeliveryCenterApproverRepository(self.session)
        approver_dcs = await dc_repo.get_by_employee(approver_employee_id)
        approver_dc_ids = [a.delivery_center_id for a in approver_dcs]

        employee_ids = set()

        # From engagement line items: employees on engagements where approver is engagement or opp DC approver
        eng_ids = await self.eng_approver_repo.list_engagement_ids_by_approver(approver_employee_id)
        opp_dc_eng_ids = await self._get_engagement_ids_for_opp_dc_approver(approver_employee_id)
        all_eng_ids = set(eng_ids) | set(opp_dc_eng_ids)

        if all_eng_ids:
            result = await self.session.execute(
                select(EngagementLineItem.employee_id).where(
                    EngagementLineItem.engagement_id.in_(all_eng_ids),
                    EngagementLineItem.employee_id.isnot(None),
                ).distinct()
            )
            for row in result.scalars().all():
                if row:
                    employee_ids.add(row)

        # From Employee: delivery_center_id in approver's DCs (active or on-leave only)
        if approver_dc_ids:
            result = await self.session.execute(
                select(Employee.id).where(
                    Employee.delivery_center_id.in_(approver_dc_ids),
                    Employee.status.in_([EmployeeStatus.ACTIVE, EmployeeStatus.ON_LEAVE]),
                )
            )
            for row in result.scalars().all():
                employee_ids.add(row)

        # Fallback: include employees who have timesheets in approver's scope (catches edge cases)
        timesheets = await self.timesheet_repo.list_approvable_timesheets_for_approver(
            approver_employee_id, status_filter=None, skip=0, limit=500
        )
        for ts in timesheets:
            if ts.employee_id:
                employee_ids.add(ts.employee_id)

        if not employee_ids:
            return ManageableEmployeesResponse(items=[], total=0)

        result = await self.session.execute(
            select(Employee)
            .where(
                Employee.id.in_(employee_ids),
                Employee.status.in_([EmployeeStatus.ACTIVE, EmployeeStatus.ON_LEAVE]),
            )
            .order_by(Employee.last_name, Employee.first_name)
        )
        employees = list(result.scalars().all())
        items = [
            ManageableEmployeeSummary(
                id=e.id,
                first_name=e.first_name,
                last_name=e.last_name,
                email=e.email,
            )
            for e in employees
        ]
        return ManageableEmployeesResponse(items=items, total=len(items))

    async def _get_engagement_ids_for_opp_dc_approver(self, approver_employee_id: UUID) -> list:
        """Get engagement IDs where approver is DC approver for the opportunity's delivery center."""
        from app.models.delivery_center_approver import DeliveryCenterApprover
        from app.models.engagement import Engagement
        from app.models.opportunity import Opportunity

        result = await self.session.execute(
            select(Engagement.id)
            .select_from(Engagement)
            .join(Opportunity, Engagement.opportunity_id == Opportunity.id)
            .join(DeliveryCenterApprover, Opportunity.delivery_center_id == DeliveryCenterApprover.delivery_center_id)
            .where(DeliveryCenterApprover.employee_id == approver_employee_id)
        )
        return [r[0] for r in result.fetchall()]

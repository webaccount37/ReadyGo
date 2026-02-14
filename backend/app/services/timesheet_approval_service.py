"""
Timesheet approval service - approve, reject, reopen, mark invoiced.
"""

import logging
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.services.base_service import BaseService
from app.db.repositories.timesheet_repository import TimesheetRepository
from app.db.repositories.timesheet_entry_repository import TimesheetEntryRepository
from app.db.repositories.timesheet_status_history_repository import TimesheetStatusHistoryRepository
from app.db.repositories.timesheet_approved_snapshot_repository import TimesheetApprovedSnapshotRepository
from app.db.repositories.engagement_repository import EngagementRepository
from app.db.repositories.opportunity_repository import OpportunityRepository
from app.db.repositories.engagement_timesheet_approver_repository import EngagementTimesheetApproverRepository
from app.db.repositories.delivery_center_approver_repository import DeliveryCenterApproverRepository
from app.models.timesheet import Timesheet, TimesheetEntry, TimesheetStatus
from app.utils.currency_converter import convert_currency
from app.schemas.timesheet import TimesheetResponse, TimesheetApprovalSummary, TimesheetApprovalListResponse

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
        await self.session.commit()
        from app.services.timesheet_service import TimesheetService
        svc = TimesheetService(self.session)
        return await svc._to_response(await self.timesheet_repo.get(timesheet_id))

    async def _can_approve_async(self, approver_employee_id: UUID, timesheet: Timesheet) -> bool:
        """Async check if employee can approve."""
        from app.models.delivery_center_approver import DeliveryCenterApprover
        from app.models.engagement import Engagement
        from sqlalchemy import select

        for entry in timesheet.entries or []:
            if not entry.engagement_id:
                continue
            eng = await self.engagement_repo.get(entry.engagement_id)
            if not eng:
                continue
            approvers = await self.eng_approver_repo.list_by_engagement(entry.engagement_id)
            if any(a.employee_id == approver_employee_id for a in approvers):
                return True
            from app.db.repositories.delivery_center_approver_repository import DeliveryCenterApproverRepository
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
    ) -> TimesheetResponse:
        """Reject timesheet - status becomes REOPENED."""
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
        )
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
            eng_names = list(set(
                e.engagement.name for e in (ts.entries or [])
                if e.engagement_id and e.engagement
            ))
            emp_name = f"{ts.employee.first_name} {ts.employee.last_name}" if ts.employee else ""
            items.append(
                TimesheetApprovalSummary(
                    id=ts.id,
                    employee_id=ts.employee_id,
                    employee_name=emp_name,
                    week_start_date=ts.week_start_date.isoformat(),
                    status=ts.status.value,
                    total_hours=total,
                    engagement_names=eng_names,
                )
            )
        return TimesheetApprovalListResponse(items=items, total=len(items))

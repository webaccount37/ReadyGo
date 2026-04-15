"""Expense approval workflow (mirrors timesheet approval authorization, without snapshots)."""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.db.repositories.expense_sheet_repository import ExpenseSheetRepository
from app.db.repositories.expense_line_repository import ExpenseLineRepository
from app.db.repositories.expense_status_history_repository import ExpenseStatusHistoryRepository
from app.db.repositories.engagement_repository import EngagementRepository
from app.db.repositories.opportunity_repository import OpportunityRepository
from app.db.repositories.engagement_expense_approver_repository import EngagementExpenseApproverRepository
from app.db.repositories.delivery_center_approver_repository import DeliveryCenterApproverRepository
from app.models.expense import ExpenseSheet, ExpenseLine
from app.models.timesheet import TimesheetStatus, TimesheetEntryType
from app.models.employee import Employee
from app.schemas.expense import (
    ExpenseSheetResponse,
    ExpenseApprovalSummary,
    ExpenseApprovalListResponse,
    ManageableEmployeesResponse,
    ManageableEmployeeSummary,
)

logger = logging.getLogger(__name__)


class ExpenseApprovalService(BaseService):
    def __init__(self, session: AsyncSession):
        self.session = session
        self.sheet_repo = ExpenseSheetRepository(session)
        self.line_repo = ExpenseLineRepository(session)
        self.status_history_repo = ExpenseStatusHistoryRepository(session)
        self.engagement_repo = EngagementRepository(session)
        self.opp_repo = OpportunityRepository(session)
        self.eng_exp_approver_repo = EngagementExpenseApproverRepository(session)

    def _labels_from_sheet(self, sheet: ExpenseSheet) -> list[str]:
        labels: set[str] = set()
        for e in sheet.lines or []:
            if e.entry_type == TimesheetEntryType.SALES:
                if e.account and getattr(e.account, "company_name", None):
                    labels.add(e.account.company_name)
                if e.opportunity and e.opportunity.name:
                    labels.add(e.opportunity.name)
            else:
                if e.engagement and e.engagement.name:
                    labels.add(e.engagement.name)
                elif e.opportunity and e.opportunity.name:
                    labels.add(e.opportunity.name)
        return sorted(labels)

    async def _can_approve_async(self, approver_employee_id: UUID, sheet: ExpenseSheet) -> bool:
        if sheet.employee_id:
            employee = await self.session.get(Employee, sheet.employee_id)
            if employee and employee.delivery_center_id:
                dc_repo = DeliveryCenterApproverRepository(self.session)
                dc_approvers = await dc_repo.get_by_delivery_center(employee.delivery_center_id)
                if any(a.employee_id == approver_employee_id for a in dc_approvers):
                    return True

        for entry in sheet.lines or []:
            if entry.engagement_id:
                eng = await self.engagement_repo.get(entry.engagement_id)
                if not eng:
                    continue
                approvers = await self.eng_exp_approver_repo.list_by_engagement(entry.engagement_id)
                if any(a.employee_id == approver_employee_id for a in approvers):
                    return True
                dc_repo = DeliveryCenterApproverRepository(self.session)
                opp = await self.opp_repo.get(eng.opportunity_id)
                if opp and opp.delivery_center_id:
                    dc_approvers = await dc_repo.get_by_delivery_center(opp.delivery_center_id)
                    if any(a.employee_id == approver_employee_id for a in dc_approvers):
                        return True
            elif entry.opportunity_id:
                opp = await self.opp_repo.get(entry.opportunity_id)
                if opp and opp.delivery_center_id:
                    dc_repo = DeliveryCenterApproverRepository(self.session)
                    dc_approvers = await dc_repo.get_by_delivery_center(opp.delivery_center_id)
                    if any(a.employee_id == approver_employee_id for a in dc_approvers):
                        return True
        return False

    async def approve_sheet(self, sheet_id: UUID, approver_employee_id: UUID) -> ExpenseSheetResponse:
        sheet = await self.sheet_repo.get(sheet_id)
        if not sheet:
            raise ValueError("Expense sheet not found")
        if sheet.status != TimesheetStatus.SUBMITTED:
            raise ValueError("Only submitted expense sheets can be approved")
        if not await self._can_approve_async(approver_employee_id, sheet):
            raise ValueError("You are not authorized to approve this expense sheet")
        old = sheet.status
        sheet.status = TimesheetStatus.APPROVED
        await self.status_history_repo.create(
            expense_sheet_id=sheet_id,
            from_status=old,
            to_status=TimesheetStatus.APPROVED,
            changed_by_employee_id=approver_employee_id,
        )
        await self.session.commit()
        from app.services.expense_service import ExpenseService

        fresh = await self.line_repo.list_by_sheet(sheet_id)
        return await ExpenseService(self.session)._to_response(await self.sheet_repo.get(sheet_id), lines_override=fresh)

    async def reject_sheet(self, sheet_id: UUID, approver_employee_id: UUID, note: str) -> ExpenseSheetResponse:
        if not note or not note.strip():
            raise ValueError("A rejection note is required")
        sheet = await self.sheet_repo.get(sheet_id)
        if not sheet:
            raise ValueError("Expense sheet not found")
        if sheet.status != TimesheetStatus.SUBMITTED:
            raise ValueError("Only submitted expense sheets can be rejected")
        if not await self._can_approve_async(approver_employee_id, sheet):
            raise ValueError("You are not authorized to reject this expense sheet")
        old = sheet.status
        sheet.status = TimesheetStatus.REOPENED
        await self.status_history_repo.create(
            expense_sheet_id=sheet_id,
            from_status=old,
            to_status=TimesheetStatus.REOPENED,
            changed_by_employee_id=approver_employee_id,
            note=note.strip()[:2000],
        )
        await self.session.commit()
        from app.services.expense_service import ExpenseService

        fresh = await self.line_repo.list_by_sheet(sheet_id)
        return await ExpenseService(self.session)._to_response(await self.sheet_repo.get(sheet_id), lines_override=fresh)

    async def reopen_sheet(self, sheet_id: UUID, reopener_employee_id: UUID, is_approver: bool) -> ExpenseSheetResponse:
        sheet = await self.sheet_repo.get(sheet_id)
        if not sheet:
            raise ValueError("Expense sheet not found")
        if sheet.status == TimesheetStatus.SUBMITTED:
            if sheet.employee_id != reopener_employee_id:
                if not await self._can_approve_async(reopener_employee_id, sheet):
                    raise ValueError("Only owner or approver can reopen")
        elif sheet.status == TimesheetStatus.APPROVED:
            if not is_approver:
                raise ValueError("Only approvers can reopen approved expense sheets")
            if not await self._can_approve_async(reopener_employee_id, sheet):
                raise ValueError("You are not authorized to reopen this expense sheet")
        else:
            raise ValueError("Expense sheet cannot be reopened in current status")
        old = sheet.status
        sheet.status = TimesheetStatus.REOPENED
        await self.status_history_repo.create(
            expense_sheet_id=sheet_id,
            from_status=old,
            to_status=TimesheetStatus.REOPENED,
            changed_by_employee_id=reopener_employee_id,
        )
        await self.session.commit()
        from app.services.expense_service import ExpenseService

        fresh = await self.line_repo.list_by_sheet(sheet_id)
        return await ExpenseService(self.session)._to_response(await self.sheet_repo.get(sheet_id), lines_override=fresh)

    async def mark_invoiced(self, sheet_id: UUID) -> ExpenseSheetResponse:
        sheet = await self.sheet_repo.get(sheet_id)
        if not sheet:
            raise ValueError("Expense sheet not found")
        if sheet.status == TimesheetStatus.INVOICED:
            from app.services.expense_service import ExpenseService

            return await ExpenseService(self.session)._to_response(sheet)
        if sheet.status != TimesheetStatus.APPROVED:
            raise ValueError("Only approved expense sheets can be marked invoiced")
        old = sheet.status
        sheet.status = TimesheetStatus.INVOICED
        await self.status_history_repo.create(
            expense_sheet_id=sheet_id,
            from_status=old,
            to_status=TimesheetStatus.INVOICED,
            changed_by_employee_id=None,
        )
        await self.session.commit()
        from app.services.expense_service import ExpenseService

        fresh = await self.line_repo.list_by_sheet(sheet_id)
        return await ExpenseService(self.session)._to_response(await self.sheet_repo.get(sheet_id), lines_override=fresh)

    async def list_pending_approvals(
        self, approver_employee_id: UUID, skip: int = 0, limit: int = 100
    ) -> ExpenseApprovalListResponse:
        from app.services.expense_service import ExpenseService

        expense_svc = ExpenseService(self.session)
        sheets = await self.sheet_repo.list_pending_approvals_for_approver(approver_employee_id, skip, limit)
        items = []
        for s in sheets:
            total_all, total_bill, total_reimb, rc, _ = await expense_svc.aggregate_expense_lines(
                s, s.lines or [], build_line_responses=False
            )
            emp_name = f"{s.employee.first_name} {s.employee.last_name}" if s.employee else ""
            items.append(
                ExpenseApprovalSummary(
                    id=s.id,
                    employee_id=s.employee_id,
                    employee_name=emp_name,
                    week_start_date=s.week_start_date.isoformat(),
                    status=s.status.value,
                    reimbursement_currency=rc,
                    total_amount=total_all,
                    total_billable=total_bill,
                    total_reimbursement=total_reimb,
                    labels=self._labels_from_sheet(s),
                )
            )
        total_count = await self.sheet_repo.count_pending_approvals_for_approver(approver_employee_id)
        return ExpenseApprovalListResponse(items=items, total=total_count)

    async def list_approvable_sheets(
        self,
        approver_employee_id: UUID,
        status: str | None = None,
        employee_id: UUID | None = None,
        skip: int = 0,
        limit: int = 200,
    ) -> ExpenseApprovalListResponse:
        status_filter = None
        if status and status not in ("ALL", "NOT_SUBMITTED_REOPENED"):
            try:
                status_filter = TimesheetStatus(status)
            except ValueError:
                status_filter = None
        from app.services.expense_service import ExpenseService

        expense_svc = ExpenseService(self.session)
        sheets = await self.sheet_repo.list_approvable_expense_sheets_for_approver(
            approver_employee_id,
            status_filter=status_filter,
            employee_id_filter=employee_id,
            skip=skip,
            limit=limit,
        )
        items = []
        for s in sheets:
            total_all, total_bill, total_reimb, rc, _ = await expense_svc.aggregate_expense_lines(
                s, s.lines or [], build_line_responses=False
            )
            emp_name = f"{s.employee.first_name} {s.employee.last_name}" if s.employee else ""
            items.append(
                ExpenseApprovalSummary(
                    id=s.id,
                    employee_id=s.employee_id,
                    employee_name=emp_name,
                    week_start_date=s.week_start_date.isoformat(),
                    status=s.status.value,
                    reimbursement_currency=rc,
                    total_amount=total_all,
                    total_billable=total_bill,
                    total_reimbursement=total_reimb,
                    labels=self._labels_from_sheet(s),
                )
            )
        return ExpenseApprovalListResponse(items=items, total=len(items))

    async def list_manageable_employees(self, approver_employee_id: UUID) -> ManageableEmployeesResponse:
        from app.db.repositories.employee_repository import EmployeeRepository

        emp_repo = EmployeeRepository(self.session)
        ids = await self.sheet_repo.list_approvable_employee_ids_for_approver(approver_employee_id)
        seen: dict[UUID, ManageableEmployeeSummary] = {}
        for eid in ids:
            emp = await emp_repo.get(eid)
            if emp:
                seen[eid] = ManageableEmployeeSummary(
                    id=emp.id,
                    first_name=emp.first_name,
                    last_name=emp.last_name,
                    email=emp.email,
                )
        items = list(seen.values())
        return ManageableEmployeesResponse(items=items, total=len(items))

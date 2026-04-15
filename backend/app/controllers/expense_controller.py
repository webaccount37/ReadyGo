"""Expense sheet controller."""

from datetime import date
from typing import List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.expense_service import ExpenseService
from app.services.expense_approval_service import ExpenseApprovalService
from app.schemas.expense import (
    ExpenseSheetResponse,
    ExpenseLineUpsert,
    ExpenseApprovalListResponse,
    ManageableEmployeesResponse,
)


class ExpenseController:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.expense_service = ExpenseService(session)
        self.approval_service = ExpenseApprovalService(session)

    async def get_or_create_my_sheet(self, employee_id: UUID, week_start: date) -> ExpenseSheetResponse:
        return await self.expense_service.get_or_create_sheet(employee_id, week_start)

    async def get_sheet(self, sheet_id: UUID, current_employee_id: UUID) -> Optional[ExpenseSheetResponse]:
        return await self.expense_service.get_sheet(sheet_id, current_employee_id)

    async def get_sheet_for_week(
        self,
        employee_id: UUID,
        week_start: date,
        current_employee_id: UUID,
    ) -> Optional[ExpenseSheetResponse]:
        return await self.expense_service.get_sheet_for_week(employee_id, week_start, current_employee_id)

    async def save_entries(
        self,
        sheet_id: UUID,
        entries: List[ExpenseLineUpsert],
        current_employee_id: UUID,
        reimbursement_currency: Optional[str] = None,
    ) -> ExpenseSheetResponse:
        return await self.expense_service.save_entries(
            sheet_id, entries, current_employee_id, reimbursement_currency=reimbursement_currency
        )

    async def submit_sheet(self, sheet_id: UUID, current_employee_id: UUID) -> ExpenseSheetResponse:
        return await self.expense_service.submit_sheet(sheet_id, current_employee_id)

    async def get_week_statuses(
        self,
        employee_id: UUID,
        past_weeks: int = 52,
        future_weeks: int = 12,
    ) -> dict:
        return await self.expense_service.get_week_statuses(employee_id, past_weeks, future_weeks)

    async def approve_sheet(self, sheet_id: UUID, approver_id: UUID) -> ExpenseSheetResponse:
        return await self.approval_service.approve_sheet(sheet_id, approver_id)

    async def reject_sheet(self, sheet_id: UUID, approver_id: UUID, note: str) -> ExpenseSheetResponse:
        return await self.approval_service.reject_sheet(sheet_id, approver_id, note)

    async def reopen_sheet(self, sheet_id: UUID, employee_id: UUID, is_approver: bool) -> ExpenseSheetResponse:
        return await self.approval_service.reopen_sheet(sheet_id, employee_id, is_approver)

    async def list_pending_approvals(
        self, approver_id: UUID, skip: int = 0, limit: int = 100
    ) -> ExpenseApprovalListResponse:
        return await self.approval_service.list_pending_approvals(approver_id, skip, limit)

    async def list_approvable(
        self,
        approver_id: UUID,
        status: Optional[str] = None,
        employee_id: Optional[UUID] = None,
        skip: int = 0,
        limit: int = 200,
    ) -> ExpenseApprovalListResponse:
        return await self.approval_service.list_approvable_sheets(
            approver_id, status=status, employee_id=employee_id, skip=skip, limit=limit
        )

    async def list_manageable_employees(self, approver_id: UUID) -> ManageableEmployeesResponse:
        return await self.approval_service.list_manageable_employees(approver_id)

    async def mark_invoiced(self, sheet_id: UUID) -> ExpenseSheetResponse:
        return await self.approval_service.mark_invoiced(sheet_id)

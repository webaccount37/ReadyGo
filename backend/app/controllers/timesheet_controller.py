"""
Timesheet controller - coordinates service calls.
"""

from datetime import date
from typing import Optional, List
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.base_controller import BaseController
from app.services.timesheet_service import TimesheetService
from app.services.timesheet_approval_service import TimesheetApprovalService
from app.schemas.timesheet import (
    TimesheetResponse,
    TimesheetEntryUpsert,
    TimesheetSubmitRequest,
    TimesheetApprovalListResponse,
)


class TimesheetController(BaseController):
    """Controller for timesheet operations."""

    def __init__(self, session: AsyncSession):
        self.timesheet_service = TimesheetService(session)
        self.approval_service = TimesheetApprovalService(session)

    async def get_or_create_timesheet(
        self,
        employee_id: UUID,
        week_start_date: date,
    ) -> TimesheetResponse:
        return await self.timesheet_service.get_or_create_timesheet(employee_id, week_start_date)

    async def get_timesheet(
        self,
        timesheet_id: UUID,
        current_employee_id: UUID,
    ) -> Optional[TimesheetResponse]:
        return await self.timesheet_service.get_timesheet(timesheet_id, current_employee_id)

    async def save_entries(
        self,
        timesheet_id: UUID,
        entries: List[TimesheetEntryUpsert],
        current_employee_id: UUID,
    ) -> TimesheetResponse:
        return await self.timesheet_service.save_entries(
            timesheet_id, entries, current_employee_id
        )

    async def submit_timesheet(
        self,
        timesheet_id: UUID,
        current_employee_id: UUID,
        force: bool = False,
    ) -> tuple[TimesheetResponse, Optional[str]]:
        return await self.timesheet_service.submit_timesheet(
            timesheet_id, current_employee_id, force
        )

    async def approve_timesheet(
        self,
        timesheet_id: UUID,
        approver_employee_id: UUID,
    ) -> TimesheetResponse:
        return await self.approval_service.approve_timesheet(
            timesheet_id, approver_employee_id
        )

    async def reject_timesheet(
        self,
        timesheet_id: UUID,
        approver_employee_id: UUID,
    ) -> TimesheetResponse:
        return await self.approval_service.reject_timesheet(
            timesheet_id, approver_employee_id
        )

    async def reopen_timesheet(
        self,
        timesheet_id: UUID,
        reopener_employee_id: UUID,
        is_approver: bool,
    ) -> TimesheetResponse:
        return await self.approval_service.reopen_timesheet(
            timesheet_id, reopener_employee_id, is_approver
        )

    async def mark_invoiced(self, timesheet_id: UUID) -> TimesheetResponse:
        return await self.approval_service.mark_invoiced(timesheet_id)

    async def list_pending_approvals(
        self,
        approver_employee_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> TimesheetApprovalListResponse:
        return await self.approval_service.list_pending_approvals(
            approver_employee_id, skip, limit
        )

    async def count_incomplete_past_weeks(self, employee_id: UUID) -> int:
        return await self.timesheet_service.count_incomplete_past_weeks(employee_id)

    async def list_incomplete_past_weeks(self, employee_id: UUID, limit: int = 20) -> List[date]:
        return await self.timesheet_service.list_incomplete_past_weeks(employee_id, limit)

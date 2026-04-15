"""Expense status history repository."""

from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.expense import ExpenseStatusHistory
from app.models.timesheet import TimesheetStatus


class ExpenseStatusHistoryRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        *,
        expense_sheet_id: UUID,
        from_status: TimesheetStatus | None,
        to_status: TimesheetStatus,
        changed_by_employee_id: UUID | None = None,
        note: str | None = None,
    ) -> ExpenseStatusHistory:
        h = ExpenseStatusHistory(
            expense_sheet_id=expense_sheet_id,
            from_status=from_status,
            to_status=to_status,
            changed_by_employee_id=changed_by_employee_id,
            note=note,
        )
        self.session.add(h)
        await self.session.flush()
        await self.session.refresh(h)
        return h

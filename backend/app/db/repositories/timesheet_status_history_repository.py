"""
Timesheet status history repository for database operations.
"""

from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.timesheet import TimesheetStatusHistory


class TimesheetStatusHistoryRepository(BaseRepository[TimesheetStatusHistory]):
    """Repository for timesheet status history operations."""

    def __init__(self, session: AsyncSession):
        super().__init__(TimesheetStatusHistory, session)

    async def create(self, **kwargs) -> TimesheetStatusHistory:
        """Create a new status history entry."""
        instance = TimesheetStatusHistory(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def list_by_timesheet(self, timesheet_id: UUID):
        """List status history for a timesheet."""
        result = await self.session.execute(
            select(TimesheetStatusHistory)
            .options(selectinload(TimesheetStatusHistory.changed_by_employee))
            .where(TimesheetStatusHistory.timesheet_id == timesheet_id)
            .order_by(TimesheetStatusHistory.changed_at)
        )
        return list(result.scalars().all())

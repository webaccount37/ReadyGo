"""
Timesheet approved snapshot repository.
"""

from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.timesheet import TimesheetApprovedSnapshot


class TimesheetApprovedSnapshotRepository:
    """Repository for timesheet approved snapshot operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, **kwargs) -> TimesheetApprovedSnapshot:
        """Create a new snapshot entry."""
        instance = TimesheetApprovedSnapshot(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

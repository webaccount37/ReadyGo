"""
Timesheet entry repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func

from app.db.repositories.base_repository import BaseRepository
from app.models.timesheet import TimesheetEntry


class TimesheetEntryRepository(BaseRepository[TimesheetEntry]):
    """Repository for timesheet entry operations."""

    def __init__(self, session: AsyncSession):
        super().__init__(TimesheetEntry, session)

    async def get(self, id: UUID) -> Optional[TimesheetEntry]:
        """Get timesheet entry by ID."""
        from sqlalchemy.orm import selectinload

        result = await self.session.execute(
            select(TimesheetEntry)
            .options(
                selectinload(TimesheetEntry.account),
                selectinload(TimesheetEntry.engagement),
                selectinload(TimesheetEntry.opportunity),
                selectinload(TimesheetEntry.engagement_phase),
                selectinload(TimesheetEntry.day_notes),
            )
            .where(TimesheetEntry.id == id)
        )
        return result.scalar_one_or_none()

    async def list_by_timesheet(self, timesheet_id: UUID) -> List[TimesheetEntry]:
        """List entries for a timesheet, ordered by row_order."""
        from sqlalchemy.orm import selectinload

        result = await self.session.execute(
            select(TimesheetEntry)
            .options(
                selectinload(TimesheetEntry.account),
                selectinload(TimesheetEntry.engagement),
                selectinload(TimesheetEntry.opportunity),
                selectinload(TimesheetEntry.engagement_phase),
                selectinload(TimesheetEntry.engagement_line_item),
                selectinload(TimesheetEntry.day_notes),
            )
            .where(TimesheetEntry.timesheet_id == timesheet_id)
            .order_by(TimesheetEntry.row_order)
        )
        return list(result.scalars().all())

    async def get_max_row_order(self, timesheet_id: UUID) -> int:
        """Get the maximum row_order for a timesheet."""
        result = await self.session.execute(
            select(func.coalesce(func.max(TimesheetEntry.row_order), -1)).where(
                TimesheetEntry.timesheet_id == timesheet_id
            )
        )
        return int(result.scalar_one())

    async def create(self, **kwargs) -> TimesheetEntry:
        """Create a new timesheet entry."""
        instance = TimesheetEntry(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def update(self, id: UUID, **kwargs) -> Optional[TimesheetEntry]:
        """Update a timesheet entry."""
        await self.session.execute(
            update(TimesheetEntry).where(TimesheetEntry.id == id).values(**kwargs)
        )
        await self.session.flush()
        return await self.get(id)

    async def delete(self, id: UUID) -> bool:
        """Delete a timesheet entry."""
        result = await self.session.execute(delete(TimesheetEntry).where(TimesheetEntry.id == id))
        await self.session.flush()
        return result.rowcount > 0

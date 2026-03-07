"""
Timesheet dismissed row repository for database operations.
"""

from typing import List, Set
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.db.repositories.base_repository import BaseRepository
from app.models.timesheet import TimesheetDismissedRow


class TimesheetDismissedRowRepository(BaseRepository[TimesheetDismissedRow]):
    """Repository for timesheet dismissed row operations."""

    def __init__(self, session: AsyncSession):
        super().__init__(TimesheetDismissedRow, session)

    async def list_dismissed_keys(self, timesheet_id: UUID) -> Set[UUID]:
        """List all dismissed engagement_line_item_id (or HOLIDAY_DISMISSED_SENTINEL) for a timesheet."""
        result = await self.session.execute(
            select(TimesheetDismissedRow.engagement_line_item_id).where(
                TimesheetDismissedRow.timesheet_id == timesheet_id
            )
        )
        return {row[0] for row in result.fetchall()}

    async def add_dismissed(
        self,
        timesheet_id: UUID,
        engagement_line_item_id: UUID,
    ) -> TimesheetDismissedRow:
        """Record a dismissed row. Idempotent - unique constraint prevents duplicates."""
        existing = await self.session.execute(
            select(TimesheetDismissedRow).where(
                TimesheetDismissedRow.timesheet_id == timesheet_id,
                TimesheetDismissedRow.engagement_line_item_id == engagement_line_item_id,
            )
        )
        row = existing.scalar_one_or_none()
        if row:
            return row
        return await self.create(
            timesheet_id=timesheet_id,
            engagement_line_item_id=engagement_line_item_id,
        )

    async def clear_for_timesheet(self, timesheet_id: UUID) -> int:
        """Remove all dismissed rows for a timesheet. Returns count deleted."""
        result = await self.session.execute(
            delete(TimesheetDismissedRow).where(TimesheetDismissedRow.timesheet_id == timesheet_id)
        )
        await self.session.flush()
        return result.rowcount or 0

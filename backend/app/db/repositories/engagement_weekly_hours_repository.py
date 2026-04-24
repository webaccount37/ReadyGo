"""
Engagement weekly hours repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete

from app.db.repositories.base_repository import BaseRepository
from app.models.engagement import EngagementWeeklyHours
from app.utils.planning_week_hours import week_does_not_overlap_line_range


class EngagementWeeklyHoursRepository(BaseRepository[EngagementWeeklyHours]):
    """Repository for engagement weekly hours operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(EngagementWeeklyHours, session)
    
    async def list_by_line_item(
        self,
        line_item_id: UUID,
    ) -> List[EngagementWeeklyHours]:
        """List weekly hours for a line item, ordered by week_start_date."""
        query = select(EngagementWeeklyHours).where(
            EngagementWeeklyHours.engagement_line_item_id == line_item_id
        )
        query = query.order_by(EngagementWeeklyHours.week_start_date)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def list_by_engagement_line_item_ids(
        self,
        line_item_ids: List[UUID],
    ) -> List[EngagementWeeklyHours]:
        """All weekly hours rows for the given engagement line item ids (one query)."""
        if not line_item_ids:
            return []
        result = await self.session.execute(
            select(EngagementWeeklyHours)
            .where(EngagementWeeklyHours.engagement_line_item_id.in_(line_item_ids))
            .order_by(
                EngagementWeeklyHours.engagement_line_item_id,
                EngagementWeeklyHours.week_start_date,
            )
        )
        return list(result.scalars().all())
    
    async def get_by_line_item_and_week(
        self,
        line_item_id: UUID,
        week_start_date: date,
    ) -> Optional[EngagementWeeklyHours]:
        """Get weekly hours for a specific line item and week."""
        query = select(EngagementWeeklyHours).where(
            EngagementWeeklyHours.engagement_line_item_id == line_item_id,
            EngagementWeeklyHours.week_start_date == week_start_date,
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def create(self, **kwargs) -> EngagementWeeklyHours:
        """Create a new weekly hours record."""
        instance = EngagementWeeklyHours(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def bulk_add_all(self, rows: List[EngagementWeeklyHours], chunk_size: int = 3000) -> None:
        """Insert many rows with flush per chunk, no per-row refresh."""
        for i in range(0, len(rows), chunk_size):
            self.session.add_all(rows[i : i + chunk_size])
            await self.session.flush()
    
    async def update(self, id: UUID, **kwargs) -> Optional[EngagementWeeklyHours]:
        """Update a weekly hours record."""
        await self.session.execute(
            update(EngagementWeeklyHours)
            .where(EngagementWeeklyHours.id == id)
            .values(**kwargs)
        )
        await self.session.flush()
        return await self.get(id)
    
    async def delete(self, id: UUID) -> bool:
        """Delete a weekly hours record."""
        result = await self.session.execute(
            delete(EngagementWeeklyHours).where(EngagementWeeklyHours.id == id)
        )
        await self.session.flush()
        return result.rowcount > 0
    
    async def delete_by_line_item(self, line_item_id: UUID) -> int:
        """Delete all weekly hours for a line item."""
        result = await self.session.execute(
            delete(EngagementWeeklyHours).where(
                EngagementWeeklyHours.engagement_line_item_id == line_item_id
            )
        )
        await self.session.flush()
        return result.rowcount

    async def delete_for_line_item_outside_inclusive_date_range(
        self,
        line_item_id: UUID,
        line_start: date,
        line_end: date,
    ) -> int:
        """
        Remove weekly rows whose Sunday week does not overlap [line_start, line_end] (inclusive).
        """
        rows = await self.list_by_line_item(line_item_id)
        deleted = 0
        for row in rows:
            ws = row.week_start_date
            if week_does_not_overlap_line_range(ws, line_start, line_end):
                if await self.delete(row.id):
                    deleted += 1
        return deleted

    async def upsert(
        self,
        line_item_id: UUID,
        week_start_date: date,
        hours: float,
    ) -> EngagementWeeklyHours:
        """Create or update weekly hours for a line item and week."""
        existing = await self.get_by_line_item_and_week(line_item_id, week_start_date)
        if existing:
            return await self.update(existing.id, hours=hours)
        else:
            return await self.create(
                engagement_line_item_id=line_item_id,
                week_start_date=week_start_date,
                hours=hours,
            )

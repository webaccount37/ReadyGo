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

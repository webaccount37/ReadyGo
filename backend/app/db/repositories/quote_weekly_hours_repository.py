"""
Quote weekly hours repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.repositories.base_repository import BaseRepository
from app.models.quote import QuoteWeeklyHours


class QuoteWeeklyHoursRepository(BaseRepository[QuoteWeeklyHours]):
    """Repository for quote weekly hours operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(QuoteWeeklyHours, session)
    
    async def list_by_line_item(
        self,
        line_item_id: UUID,
    ) -> List[QuoteWeeklyHours]:
        """List weekly hours for a line item, ordered by week_start_date."""
        query = select(QuoteWeeklyHours).where(
            QuoteWeeklyHours.quote_line_item_id == line_item_id
        )
        query = query.order_by(QuoteWeeklyHours.week_start_date)
        result = await self.session.execute(query)
        return list(result.scalars().all())


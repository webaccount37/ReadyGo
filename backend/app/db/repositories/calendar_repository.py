"""
Calendar repository for database operations.
"""

from datetime import date
from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.db.repositories.base_repository import BaseRepository
from app.models.calendar import Calendar


class CalendarRepository(BaseRepository[Calendar]):
    """Repository for calendar operations."""

    def __init__(self, session: AsyncSession):
        super().__init__(Calendar, session)

    async def list_by_year_and_delivery_center(
        self,
        year: int,
        delivery_center_id: UUID,
        skip: int = 0,
        limit: int = 500,
    ) -> tuple[List[Calendar], int]:
        """List calendar entries for a year and delivery center."""
        query = select(Calendar).where(
            and_(
                Calendar.year == year,
                Calendar.delivery_center_id == delivery_center_id,
            )
        ).order_by(Calendar.date)
        count_query = select(Calendar).where(
            and_(
                Calendar.year == year,
                Calendar.delivery_center_id == delivery_center_id,
            )
        )
        total_result = await self.session.execute(count_query)
        total = len(list(total_result.scalars().all()))
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all()), total

    async def list_by_delivery_center_and_date_range(
        self,
        delivery_center_id: UUID,
        start_date: date,
        end_date: date,
    ) -> List[Calendar]:
        """List calendar events in a date range for a delivery center."""
        query = select(Calendar).where(
            and_(
                Calendar.delivery_center_id == delivery_center_id,
                Calendar.date >= start_date,
                Calendar.date <= end_date,
            )
        ).order_by(Calendar.date)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_by_date_and_delivery_center(
        self,
        event_date: date,
        delivery_center_id: UUID,
    ) -> Optional[Calendar]:
        """Get calendar entry by date and delivery center."""
        result = await self.session.execute(
            select(Calendar).where(
                and_(
                    Calendar.date == event_date,
                    Calendar.delivery_center_id == delivery_center_id,
                )
            )
        )
        return result.scalar_one_or_none()

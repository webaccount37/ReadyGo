"""
Calendar repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.calendar import Calendar


class CalendarRepository(BaseRepository[Calendar]):
    """Repository for calendar operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(Calendar, session)
    
    async def get_by_date(
        self,
        year: int,
        month: int,
        day: int,
    ) -> Optional[Calendar]:
        """Get calendar entry by date."""
        result = await self.session.execute(
            select(Calendar).where(
                and_(
                    Calendar.year == year,
                    Calendar.month == month,
                    Calendar.day == day,
                )
            )
        )
        return result.scalar_one_or_none()
    
    async def list_by_year_month(
        self,
        year: int,
        month: int,
    ) -> List[Calendar]:
        """List calendar entries for a specific year and month."""
        query = select(Calendar).where(
            and_(
                Calendar.year == year,
                Calendar.month == month,
            )
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_holidays(
        self,
        year: Optional[int] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Calendar]:
        """List holiday entries."""
        query = select(Calendar).where(Calendar.is_holiday == True)
        if year:
            query = query.where(Calendar.year == year)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_by_financial_period(
        self,
        financial_period: str,
    ) -> List[Calendar]:
        """List calendar entries by financial period."""
        query = select(Calendar).where(Calendar.financial_period == financial_period)
        result = await self.session.execute(query)
        return list(result.scalars().all())












"""
Quote weekly hours repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, and_
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.quote import QuoteWeeklyHours


class QuoteWeeklyHoursRepository(BaseRepository[QuoteWeeklyHours]):
    """Repository for quote weekly hours operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(QuoteWeeklyHours, session)
    
    async def get(self, id: UUID) -> Optional[QuoteWeeklyHours]:
        """Get weekly hours by ID."""
        result = await self.session.execute(
            select(QuoteWeeklyHours).where(QuoteWeeklyHours.id == id)
        )
        return result.scalar_one_or_none()
    
    async def get_by_line_item_and_week(
        self,
        line_item_id: UUID,
        week_start_date: date,
    ) -> Optional[QuoteWeeklyHours]:
        """Get weekly hours for a specific line item and week."""
        result = await self.session.execute(
            select(QuoteWeeklyHours).where(
                and_(
                    QuoteWeeklyHours.quote_line_item_id == line_item_id,
                    QuoteWeeklyHours.week_start_date == week_start_date
                )
            )
        )
        return result.scalar_one_or_none()
    
    async def list_by_line_item(
        self,
        line_item_id: UUID,
    ) -> List[QuoteWeeklyHours]:
        """List weekly hours for a line item, ordered by week_start_date."""
        result = await self.session.execute(
            select(QuoteWeeklyHours)
            .where(QuoteWeeklyHours.quote_line_item_id == line_item_id)
            .order_by(QuoteWeeklyHours.week_start_date)
        )
        return list(result.scalars().all())
    
    async def list_by_date_range(
        self,
        line_item_id: UUID,
        start_date: date,
        end_date: date,
    ) -> List[QuoteWeeklyHours]:
        """List weekly hours for a line item within a date range."""
        result = await self.session.execute(
            select(QuoteWeeklyHours)
            .where(
                and_(
                    QuoteWeeklyHours.quote_line_item_id == line_item_id,
                    QuoteWeeklyHours.week_start_date >= start_date,
                    QuoteWeeklyHours.week_start_date <= end_date
                )
            )
            .order_by(QuoteWeeklyHours.week_start_date)
        )
        return list(result.scalars().all())
    
    async def create(self, **kwargs) -> QuoteWeeklyHours:
        """Create or update weekly hours (upsert behavior)."""
        line_item_id = kwargs.get("quote_line_item_id")
        week_start_date = kwargs.get("week_start_date")
        
        # Check if exists
        existing = await self.get_by_line_item_and_week(line_item_id, week_start_date)
        if existing:
            # Update existing
            await self.session.execute(
                update(QuoteWeeklyHours)
                .where(QuoteWeeklyHours.id == existing.id)
                .values(hours=kwargs.get("hours", 0))
            )
            await self.session.flush()
            await self.session.refresh(existing)
            return existing
        else:
            # Create new
            instance = QuoteWeeklyHours(**kwargs)
            self.session.add(instance)
            await self.session.flush()
            await self.session.refresh(instance)
            return instance
    
    async def bulk_create_or_update(
        self,
        line_item_id: UUID,
        weekly_hours: List[dict],
    ) -> List[QuoteWeeklyHours]:
        """Bulk create or update weekly hours."""
        results = []
        for week_data in weekly_hours:
            week_data["quote_line_item_id"] = line_item_id
            result = await self.create(**week_data)
            results.append(result)
        return results
    
    async def update(self, id: UUID, **kwargs) -> Optional[QuoteWeeklyHours]:
        """Update weekly hours."""
        await self.session.execute(
            update(QuoteWeeklyHours)
            .where(QuoteWeeklyHours.id == id)
            .values(**kwargs)
        )
        await self.session.flush()
        return await self.get(id)
    
    async def delete(self, id: UUID) -> bool:
        """Delete weekly hours."""
        result = await self.session.execute(
            delete(QuoteWeeklyHours).where(QuoteWeeklyHours.id == id)
        )
        await self.session.flush()
        return result.rowcount > 0
    
    async def delete_by_line_item(self, line_item_id: UUID) -> int:
        """Delete all weekly hours for a line item."""
        result = await self.session.execute(
            delete(QuoteWeeklyHours).where(
                QuoteWeeklyHours.quote_line_item_id == line_item_id
            )
        )
        await self.session.flush()
        return result.rowcount
    
    async def delete_by_date_range(
        self,
        line_item_id: UUID,
        start_date: date,
        end_date: date,
    ) -> int:
        """Delete weekly hours within a date range."""
        result = await self.session.execute(
            delete(QuoteWeeklyHours).where(
                and_(
                    QuoteWeeklyHours.quote_line_item_id == line_item_id,
                    QuoteWeeklyHours.week_start_date >= start_date,
                    QuoteWeeklyHours.week_start_date <= end_date
                )
            )
        )
        await self.session.flush()
        return result.rowcount







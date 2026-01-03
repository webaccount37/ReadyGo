"""
Estimate weekly hours repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, and_
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.estimate import EstimateWeeklyHours


class EstimateWeeklyHoursRepository(BaseRepository[EstimateWeeklyHours]):
    """Repository for estimate weekly hours operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(EstimateWeeklyHours, session)
    
    async def get(self, id: UUID) -> Optional[EstimateWeeklyHours]:
        """Get weekly hours by ID."""
        result = await self.session.execute(
            select(EstimateWeeklyHours).where(EstimateWeeklyHours.id == id)
        )
        return result.scalar_one_or_none()
    
    async def get_by_line_item_and_week(
        self,
        line_item_id: UUID,
        week_start_date: date,
    ) -> Optional[EstimateWeeklyHours]:
        """Get weekly hours for a specific line item and week."""
        result = await self.session.execute(
            select(EstimateWeeklyHours).where(
                and_(
                    EstimateWeeklyHours.estimate_line_item_id == line_item_id,
                    EstimateWeeklyHours.week_start_date == week_start_date
                )
            )
        )
        return result.scalar_one_or_none()
    
    async def list_by_line_item(
        self,
        line_item_id: UUID,
    ) -> List[EstimateWeeklyHours]:
        """List weekly hours for a line item, ordered by week_start_date."""
        result = await self.session.execute(
            select(EstimateWeeklyHours)
            .where(EstimateWeeklyHours.estimate_line_item_id == line_item_id)
            .order_by(EstimateWeeklyHours.week_start_date)
        )
        return list(result.scalars().all())
    
    async def list_by_date_range(
        self,
        line_item_id: UUID,
        start_date: date,
        end_date: date,
    ) -> List[EstimateWeeklyHours]:
        """List weekly hours for a line item within a date range."""
        result = await self.session.execute(
            select(EstimateWeeklyHours)
            .where(
                and_(
                    EstimateWeeklyHours.estimate_line_item_id == line_item_id,
                    EstimateWeeklyHours.week_start_date >= start_date,
                    EstimateWeeklyHours.week_start_date <= end_date
                )
            )
            .order_by(EstimateWeeklyHours.week_start_date)
        )
        return list(result.scalars().all())
    
    async def create(self, **kwargs) -> EstimateWeeklyHours:
        """Create or update weekly hours (upsert behavior)."""
        line_item_id = kwargs.get("estimate_line_item_id")
        week_start_date = kwargs.get("week_start_date")
        
        # Check if exists
        existing = await self.get_by_line_item_and_week(line_item_id, week_start_date)
        if existing:
            # Update existing
            await self.session.execute(
                update(EstimateWeeklyHours)
                .where(EstimateWeeklyHours.id == existing.id)
                .values(hours=kwargs.get("hours", 0))
            )
            await self.session.flush()
            await self.session.refresh(existing)
            return existing
        else:
            # Create new
            instance = EstimateWeeklyHours(**kwargs)
            self.session.add(instance)
            await self.session.flush()
            await self.session.refresh(instance)
            return instance
    
    async def bulk_create_or_update(
        self,
        line_item_id: UUID,
        weekly_hours: List[dict],
    ) -> List[EstimateWeeklyHours]:
        """Bulk create or update weekly hours."""
        results = []
        for week_data in weekly_hours:
            week_data["estimate_line_item_id"] = line_item_id
            result = await self.create(**week_data)
            results.append(result)
        return results
    
    async def update(self, id: UUID, **kwargs) -> Optional[EstimateWeeklyHours]:
        """Update weekly hours."""
        await self.session.execute(
            update(EstimateWeeklyHours)
            .where(EstimateWeeklyHours.id == id)
            .values(**kwargs)
        )
        await self.session.flush()
        return await self.get(id)
    
    async def delete(self, id: UUID) -> bool:
        """Delete weekly hours."""
        result = await self.session.execute(
            delete(EstimateWeeklyHours).where(EstimateWeeklyHours.id == id)
        )
        await self.session.flush()
        return result.rowcount > 0
    
    async def delete_by_line_item(self, line_item_id: UUID) -> int:
        """Delete all weekly hours for a line item."""
        result = await self.session.execute(
            delete(EstimateWeeklyHours).where(
                EstimateWeeklyHours.estimate_line_item_id == line_item_id
            )
        )
        await self.session.flush()
        return result.rowcount
    
    async def delete_duplicate_monday_for_sunday(
        self,
        line_item_id: UUID,
        sunday_date: date,
    ) -> int:
        """Delete Monday record if Sunday record exists for the same week.
        
        When we save a Sunday date (e.g., 2026-01-04), we should delete
        any Monday record (e.g., 2026-01-05) for the same week to avoid duplicates.
        """
        from datetime import timedelta
        monday_date = sunday_date + timedelta(days=1)
        result = await self.session.execute(
            delete(EstimateWeeklyHours).where(
                and_(
                    EstimateWeeklyHours.estimate_line_item_id == line_item_id,
                    EstimateWeeklyHours.week_start_date == monday_date
                )
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
            delete(EstimateWeeklyHours).where(
                and_(
                    EstimateWeeklyHours.estimate_line_item_id == line_item_id,
                    EstimateWeeklyHours.week_start_date >= start_date,
                    EstimateWeeklyHours.week_start_date <= end_date
                )
            )
        )
        await self.session.flush()
        return result.rowcount





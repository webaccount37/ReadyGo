"""
Estimate repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.estimate import Estimate, EstimateStatus


class EstimateRepository(BaseRepository[Estimate]):
    """Repository for estimate operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(Estimate, session)
    
    def _base_query(self):
        """Base query with eager loading of relationships."""
        from app.models.release import Release
        
        return select(Estimate).options(
            selectinload(Estimate.release).selectinload(Release.engagement),
            selectinload(Estimate.created_by_employee),
            selectinload(Estimate.phases),
        )
    
    async def get(self, id: UUID) -> Optional[Estimate]:
        """Get estimate by ID with relationships loaded."""
        query = self._base_query().where(Estimate.id == id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def list(
        self,
        skip: int = 0,
        limit: int = 100,
        **filters,
    ) -> List[Estimate]:
        """List estimates with pagination and filters."""
        query = self._base_query()
        
        # Apply filters
        for key, value in filters.items():
            if hasattr(Estimate, key):
                query = query.where(getattr(Estimate, key) == value)
        
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def count(self, **filters) -> int:
        """Count estimates matching filters."""
        query = select(func.count(Estimate.id))
        
        for key, value in filters.items():
            if hasattr(Estimate, key):
                query = query.where(getattr(Estimate, key) == value)
        
        result = await self.session.execute(query)
        return result.scalar_one()
    
    async def list_by_release(
        self,
        release_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Estimate]:
        """List estimates by release."""
        query = self._base_query().where(Estimate.release_id == release_id)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_by_status(
        self,
        status: EstimateStatus,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Estimate]:
        """List estimates by status."""
        query = self._base_query().where(Estimate.status == status)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_with_line_items(self, quote_id: UUID) -> Optional[Estimate]:
        """Get estimate with all line items and weekly hours."""
        from app.models.estimate import EstimateLineItem, EstimateWeeklyHours
        from app.models.release import Release
        from app.models.engagement import Engagement
        
        result = await self.session.execute(
            select(Estimate)
            .options(
                selectinload(Estimate.release).selectinload(Release.engagement),
                selectinload(Estimate.created_by_employee),
                selectinload(Estimate.phases),
                selectinload(Estimate.line_items)
                .selectinload(EstimateLineItem.role),
                selectinload(Estimate.line_items)
                .selectinload(EstimateLineItem.delivery_center),
                selectinload(Estimate.line_items)
                .selectinload(EstimateLineItem.employee),
                selectinload(Estimate.line_items)
                .selectinload(EstimateLineItem.weekly_hours),
            )
            .where(Estimate.id == quote_id)
        )
        return result.scalar_one_or_none()
    
    async def create(self, **kwargs) -> Estimate:
        """Create a new estimate."""
        instance = Estimate(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance
    
    async def update(self, id: UUID, **kwargs) -> Optional[Estimate]:
        """Update an estimate."""
        from sqlalchemy import update
        
        await self.session.execute(
            update(Estimate)
            .where(Estimate.id == id)
            .values(**kwargs)
        )
        await self.session.flush()
        return await self.get(id)
    
    async def delete(self, id: UUID) -> bool:
        """Delete an estimate."""
        from sqlalchemy import delete
        
        result = await self.session.execute(
            delete(Estimate).where(Estimate.id == id)
        )
        await self.session.flush()
        return result.rowcount > 0


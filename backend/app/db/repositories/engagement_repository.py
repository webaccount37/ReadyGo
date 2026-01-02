"""
Engagement repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.engagement import Engagement, EngagementStatus


class EngagementRepository(BaseRepository[Engagement]):
    """Repository for engagement operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(Engagement, session)
    
    def _base_query(self):
        """Base query with eager loading of opportunity, billing_term, and delivery_center relationships."""
        return select(Engagement).options(
            selectinload(Engagement.opportunity),
            selectinload(Engagement.billing_term),
            selectinload(Engagement.delivery_center)
        )
    
    async def list(
        self,
        skip: int = 0,
        limit: int = 100,
        **filters,
    ) -> List[Engagement]:
        """List engagements with pagination and filters, eagerly loading opportunity."""
        query = self._base_query()
        
        # Apply filters
        for key, value in filters.items():
            if hasattr(Engagement, key):
                query = query.where(getattr(Engagement, key) == value)
        
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get(self, id: UUID) -> Optional[Engagement]:
        """Get engagement by ID with opportunity relationship loaded."""
        query = self._base_query().where(Engagement.id == id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def list_by_opportunity(
        self,
        opportunity_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Engagement]:
        """List engagements by opportunity."""
        query = self._base_query().where(Engagement.opportunity_id == opportunity_id)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_by_status(
        self,
        status: EngagementStatus,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Engagement]:
        """List engagements by status."""
        query = self._base_query().where(Engagement.status == status)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_by_date_range(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Engagement]:
        """List engagements within date range."""
        query = self._base_query()
        if start_date:
            query = query.where(Engagement.start_date >= start_date)
        if end_date:
            query = query.where(Engagement.end_date <= end_date)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_with_relationships(self, engagement_id: UUID) -> Optional[Engagement]:
        """Get engagement with related entities."""
        # Note: Employees are now loaded from ESTIMATE_LINE_ITEMS where ACTIVE_VERSION = TRUE
        # This is handled in the service layer, not the repository
        result = await self.session.execute(
            select(Engagement)
            .options(
                selectinload(Engagement.opportunity),
                selectinload(Engagement.billing_term),
                selectinload(Engagement.delivery_center),
            )
            .where(Engagement.id == engagement_id)
        )
        return result.scalar_one_or_none()





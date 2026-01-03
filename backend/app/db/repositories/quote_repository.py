"""
Quote repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.quote import Quote


class QuoteRepository(BaseRepository[Quote]):
    """Repository for quote operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(Quote, session)
    
    def _base_query(self):
        """Base query with eager loading of relationships."""
        from app.models.engagement import Engagement
        from app.models.estimate import Estimate
        
        return select(Quote).options(
            selectinload(Quote.engagement).selectinload(Engagement.opportunity),
            selectinload(Quote.estimate),
            selectinload(Quote.created_by_employee),
        )
    
    async def get(self, id: UUID) -> Optional[Quote]:
        """Get quote by ID with relationships loaded."""
        query = self._base_query().where(Quote.id == id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def list(
        self,
        skip: int = 0,
        limit: int = 100,
        **filters,
    ) -> List[Quote]:
        """List quotes with pagination and filters."""
        query = self._base_query()
        
        # Apply filters
        for key, value in filters.items():
            if hasattr(Quote, key):
                query = query.where(getattr(Quote, key) == value)
        
        query = query.offset(skip).limit(limit).order_by(Quote.created_at.desc())
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def count(self, **filters) -> int:
        """Count quotes matching filters."""
        query = select(func.count(Quote.id))
        
        for key, value in filters.items():
            if hasattr(Quote, key):
                query = query.where(getattr(Quote, key) == value)
        
        result = await self.session.execute(query)
        return result.scalar_one()
    
    async def get_active_quote_by_engagement(self, engagement_id: UUID) -> Optional[Quote]:
        """Get active quote for an engagement."""
        query = self._base_query().where(
            Quote.engagement_id == engagement_id,
            Quote.is_active == True
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def list_by_engagement(
        self,
        engagement_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Quote]:
        """List quotes by engagement."""
        query = self._base_query().where(Quote.engagement_id == engagement_id)
        query = query.order_by(Quote.created_at.desc()).offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def deactivate_all_by_engagement(self, engagement_id: UUID) -> int:
        """Deactivate all quotes for an engagement."""
        from sqlalchemy import update
        
        result = await self.session.execute(
            update(Quote)
            .where(Quote.engagement_id == engagement_id)
            .values(is_active=False)
        )
        await self.session.flush()
        return result.rowcount
    
    async def get_max_version_by_engagement(self, engagement_id: UUID) -> int:
        """Get the maximum version number for quotes of an engagement."""
        result = await self.session.execute(
            select(func.max(Quote.version))
            .where(Quote.engagement_id == engagement_id)
        )
        max_version = result.scalar_one_or_none()
        return max_version if max_version is not None else 0


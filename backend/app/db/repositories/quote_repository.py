"""
Quote repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.quote import Quote, QuoteStatus


class QuoteRepository(BaseRepository[Quote]):
    """Repository for quote operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(Quote, session)
    
    def _base_query(self):
        """Base query with eager loading of relationships."""
        from app.models.release import Release
        
        return select(Quote).options(
            selectinload(Quote.release).selectinload(Release.opportunity),
            selectinload(Quote.created_by_employee),
            selectinload(Quote.phases),
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
        
        query = query.offset(skip).limit(limit)
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
    
    async def list_by_release(
        self,
        release_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Quote]:
        """List quotes by release."""
        query = self._base_query().where(Quote.release_id == release_id)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_by_status(
        self,
        status: QuoteStatus,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Quote]:
        """List quotes by status."""
        query = self._base_query().where(Quote.status == status)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_with_line_items(self, quote_id: UUID) -> Optional[Quote]:
        """Get quote with all line items and weekly hours."""
        from app.models.quote import QuoteLineItem, QuoteWeeklyHours
        from app.models.release import Release
        from app.models.opportunity import Opportunity
        
        result = await self.session.execute(
            select(Quote)
            .options(
                selectinload(Quote.release).selectinload(Release.opportunity),
                selectinload(Quote.created_by_employee),
                selectinload(Quote.phases),
                selectinload(Quote.line_items)
                .selectinload(QuoteLineItem.role),
                selectinload(Quote.line_items)
                .selectinload(QuoteLineItem.delivery_center),
                selectinload(Quote.line_items)
                .selectinload(QuoteLineItem.employee),
                selectinload(Quote.line_items)
                .selectinload(QuoteLineItem.weekly_hours),
            )
            .where(Quote.id == quote_id)
        )
        return result.scalar_one_or_none()
    
    async def create(self, **kwargs) -> Quote:
        """Create a new quote."""
        instance = Quote(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance
    
    async def update(self, id: UUID, **kwargs) -> Optional[Quote]:
        """Update a quote."""
        from sqlalchemy import update
        
        await self.session.execute(
            update(Quote)
            .where(Quote.id == id)
            .values(**kwargs)
        )
        await self.session.flush()
        return await self.get(id)
    
    async def delete(self, id: UUID) -> bool:
        """Delete a quote."""
        from sqlalchemy import delete
        
        result = await self.session.execute(
            delete(Quote).where(Quote.id == id)
        )
        await self.session.flush()
        return result.rowcount > 0


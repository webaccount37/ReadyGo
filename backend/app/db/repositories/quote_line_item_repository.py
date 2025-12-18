"""
Quote line item repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.quote import QuoteLineItem


class QuoteLineItemRepository(BaseRepository[QuoteLineItem]):
    """Repository for quote line item operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(QuoteLineItem, session)
    
    def _base_query(self):
        """Base query with eager loading of relationships."""
        return select(QuoteLineItem).options(
            selectinload(QuoteLineItem.role),
            selectinload(QuoteLineItem.delivery_center),
            selectinload(QuoteLineItem.employee),
            selectinload(QuoteLineItem.quote),
        )
    
    async def get(self, id: UUID) -> Optional[QuoteLineItem]:
        """Get line item by ID with relationships loaded."""
        query = self._base_query().where(QuoteLineItem.id == id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def list_by_quote(
        self,
        quote_id: UUID,
    ) -> List[QuoteLineItem]:
        """List line items for a quote, ordered by row_order."""
        query = self._base_query().where(QuoteLineItem.quote_id == quote_id)
        query = query.order_by(QuoteLineItem.row_order)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_with_weekly_hours(self, line_item_id: UUID) -> Optional[QuoteLineItem]:
        """Get line item with weekly hours."""
        from app.models.quote import QuoteWeeklyHours
        
        result = await self.session.execute(
            select(QuoteLineItem)
            .options(
                selectinload(QuoteLineItem.role),
                selectinload(QuoteLineItem.delivery_center),
                selectinload(QuoteLineItem.employee),
                selectinload(QuoteLineItem.quote),
                selectinload(QuoteLineItem.weekly_hours),
            )
            .where(QuoteLineItem.id == line_item_id)
        )
        return result.scalar_one_or_none()
    
    async def get_max_row_order(self, quote_id: UUID) -> int:
        """Get the maximum row_order for a quote."""
        result = await self.session.execute(
            select(func.max(QuoteLineItem.row_order))
            .where(QuoteLineItem.quote_id == quote_id)
        )
        max_order = result.scalar_one_or_none()
        return max_order if max_order is not None else -1
    
    async def create(self, **kwargs) -> QuoteLineItem:
        """Create a new line item."""
        instance = QuoteLineItem(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance
    
    async def update(self, id: UUID, **kwargs) -> Optional[QuoteLineItem]:
        """Update a line item."""
        await self.session.execute(
            update(QuoteLineItem)
            .where(QuoteLineItem.id == id)
            .values(**kwargs)
        )
        await self.session.flush()
        return await self.get(id)
    
    async def delete(self, id: UUID) -> bool:
        """Delete a line item."""
        result = await self.session.execute(
            delete(QuoteLineItem).where(QuoteLineItem.id == id)
        )
        await self.session.flush()
        return result.rowcount > 0
    
    async def delete_by_quote(self, quote_id: UUID) -> int:
        """Delete all line items for a quote."""
        result = await self.session.execute(
            delete(QuoteLineItem).where(QuoteLineItem.quote_id == quote_id)
        )
        await self.session.flush()
        return result.rowcount



"""
Quote line item repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.quote import QuoteLineItem


class QuoteLineItemRepository(BaseRepository[QuoteLineItem]):
    """Repository for quote line item operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(QuoteLineItem, session)
    
    def _base_query(self):
        """Base query with eager loading of relationships."""
        from app.models.role_rate import RoleRate
        
        return select(QuoteLineItem).options(
            selectinload(QuoteLineItem.role_rate).selectinload(RoleRate.role),
            selectinload(QuoteLineItem.role_rate).selectinload(RoleRate.delivery_center),
            selectinload(QuoteLineItem.payable_center),
            selectinload(QuoteLineItem.employee),
            selectinload(QuoteLineItem.weekly_hours),
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


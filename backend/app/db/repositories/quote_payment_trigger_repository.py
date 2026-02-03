"""
Quote Payment Trigger repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.repositories.base_repository import BaseRepository
from app.models.quote import QuotePaymentTrigger


class QuotePaymentTriggerRepository(BaseRepository[QuotePaymentTrigger]):
    """Repository for quote payment trigger operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(QuotePaymentTrigger, session)
    
    async def list_by_quote(self, quote_id: UUID) -> List[QuotePaymentTrigger]:
        """List payment triggers for a quote."""
        query = select(QuotePaymentTrigger).where(
            QuotePaymentTrigger.quote_id == quote_id
        ).order_by(QuotePaymentTrigger.row_order)
        result = await self.session.execute(query)
        return list(result.scalars().all())

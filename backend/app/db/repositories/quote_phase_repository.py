"""
Quote phase repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.repositories.base_repository import BaseRepository
from app.models.quote import QuotePhase


class QuotePhaseRepository(BaseRepository[QuotePhase]):
    """Repository for quote phase operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(QuotePhase, session)
    
    async def list_by_quote(
        self,
        quote_id: UUID,
    ) -> List[QuotePhase]:
        """List phases for a quote, ordered by row_order."""
        query = select(QuotePhase).where(QuotePhase.quote_id == quote_id)
        query = query.order_by(QuotePhase.row_order)
        result = await self.session.execute(query)
        return list(result.scalars().all())


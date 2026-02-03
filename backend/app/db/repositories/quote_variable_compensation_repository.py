"""
Quote Variable Compensation repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.quote import QuoteVariableCompensation


class QuoteVariableCompensationRepository(BaseRepository[QuoteVariableCompensation]):
    """Repository for quote variable compensation operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(QuoteVariableCompensation, session)
    
    async def list_by_quote(self, quote_id: UUID) -> List[QuoteVariableCompensation]:
        """List variable compensations for a quote."""
        from app.models.employee import Employee
        
        query = select(QuoteVariableCompensation).options(
            selectinload(QuoteVariableCompensation.employee)
        ).where(
            QuoteVariableCompensation.quote_id == quote_id
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

"""
Estimate phase repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func

from app.db.repositories.base_repository import BaseRepository
from app.models.estimate import EstimatePhase


class EstimatePhaseRepository(BaseRepository[EstimatePhase]):
    """Repository for estimate phase operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(EstimatePhase, session)
    
    async def list_by_estimate(
        self,
        estimate_id: UUID,
    ) -> List[EstimatePhase]:
        """List phases for an estimate, ordered by row_order."""
        query = select(EstimatePhase).where(EstimatePhase.estimate_id == estimate_id)
        query = query.order_by(EstimatePhase.row_order)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_max_row_order(self, estimate_id: UUID) -> int:
        """Get the maximum row_order for an estimate."""
        result = await self.session.execute(
            select(func.max(EstimatePhase.row_order))
            .where(EstimatePhase.estimate_id == estimate_id)
        )
        max_order = result.scalar_one_or_none()
        return max_order if max_order is not None else -1




"""
Engagement phase repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func

from app.db.repositories.base_repository import BaseRepository
from app.models.engagement import EngagementPhase


class EngagementPhaseRepository(BaseRepository[EngagementPhase]):
    """Repository for engagement phase operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(EngagementPhase, session)
    
    async def list_by_engagement(
        self,
        engagement_id: UUID,
    ) -> List[EngagementPhase]:
        """List phases for an engagement, ordered by row_order."""
        query = select(EngagementPhase).where(EngagementPhase.engagement_id == engagement_id)
        query = query.order_by(EngagementPhase.row_order)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_max_row_order(self, engagement_id: UUID) -> int:
        """Get the maximum row_order for an engagement."""
        result = await self.session.execute(
            select(func.max(EngagementPhase.row_order))
            .where(EngagementPhase.engagement_id == engagement_id)
        )
        max_order = result.scalar_one_or_none()
        return max_order if max_order is not None else -1

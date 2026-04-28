"""
Opportunity permanent lock repository for database operations.
"""

from typing import Optional, Set, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.db.repositories.base_repository import BaseRepository
from app.models.opportunity_permanent_lock import OpportunityPermanentLock


class OpportunityPermanentLockRepository(BaseRepository[OpportunityPermanentLock]):
    """Repository for opportunity permanent lock operations."""

    def __init__(self, session: AsyncSession):
        super().__init__(OpportunityPermanentLock, session)

    async def get_by_opportunity(self, opportunity_id: UUID) -> Optional[OpportunityPermanentLock]:
        """Get permanent lock for an opportunity."""
        result = await self.session.execute(
            select(OpportunityPermanentLock).where(
                OpportunityPermanentLock.opportunity_id == opportunity_id
            )
        )
        return result.scalar_one_or_none()

    async def is_opportunity_locked(self, opportunity_id: UUID) -> bool:
        """Check if opportunity is permanently locked."""
        lock = await self.get_by_opportunity(opportunity_id)
        return lock is not None

    async def list_locked_opportunity_ids_among(self, opportunity_ids: List[UUID]) -> Set[UUID]:
        """Return which of the given opportunities have a permanent lock row."""
        if not opportunity_ids:
            return set()
        result = await self.session.execute(
            select(OpportunityPermanentLock.opportunity_id).where(
                OpportunityPermanentLock.opportunity_id.in_(opportunity_ids)
            )
        )
        return {row[0] for row in result.all() if row[0] is not None}

    async def create(self, **kwargs) -> OpportunityPermanentLock:
        """Create a new permanent lock."""
        instance = OpportunityPermanentLock(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def delete_by_opportunity(self, opportunity_id: UUID) -> bool:
        """Remove permanent lock for an opportunity. Returns True if a lock was deleted."""
        result = await self.session.execute(
            delete(OpportunityPermanentLock).where(
                OpportunityPermanentLock.opportunity_id == opportunity_id
            )
        )
        await self.session.flush()
        return result.rowcount > 0

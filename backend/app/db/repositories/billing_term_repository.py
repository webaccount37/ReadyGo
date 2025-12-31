"""
Billing Term repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.repositories.base_repository import BaseRepository
from app.models.billing_term import BillingTerm


class BillingTermRepository(BaseRepository[BillingTerm]):
    """Repository for billing term operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(BillingTerm, session)
    
    async def get_by_code(self, code: str) -> Optional[BillingTerm]:
        """Get billing term by code."""
        result = await self.session.execute(
            select(BillingTerm).where(BillingTerm.code == code)
        )
        return result.scalar_one_or_none()
    
    async def list_active(
        self,
        skip: int = 0,
        limit: int = 100,
    ) -> List[BillingTerm]:
        """List active billing terms ordered by sort_order."""
        query = (
            select(BillingTerm)
            .where(BillingTerm.is_active == True)
            .order_by(BillingTerm.sort_order, BillingTerm.name)
        )
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_all_ordered(
        self,
        skip: int = 0,
        limit: int = 100,
    ) -> List[BillingTerm]:
        """List all billing terms ordered by sort_order."""
        query = (
            select(BillingTerm)
            .order_by(BillingTerm.sort_order, BillingTerm.name)
        )
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def count_active(self) -> int:
        """Count active billing terms."""
        from sqlalchemy import func
        result = await self.session.execute(
            select(func.count(BillingTerm.id)).where(BillingTerm.is_active == True)
        )
        return result.scalar() or 0









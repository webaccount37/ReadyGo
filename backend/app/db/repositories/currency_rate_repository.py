"""
Currency rate repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.repositories.base_repository import BaseRepository
from app.models.currency_rate import CurrencyRate


class CurrencyRateRepository(BaseRepository[CurrencyRate]):
    """Repository for currency rate operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(CurrencyRate, session)
    
    async def get(self, id: UUID) -> Optional[CurrencyRate]:
        """Get currency rate by ID."""
        result = await self.session.execute(
            select(CurrencyRate).where(CurrencyRate.id == id)
        )
        return result.scalar_one_or_none()
    
    async def get_by_currency_code(self, currency_code: str) -> Optional[CurrencyRate]:
        """Get currency rate by currency code."""
        result = await self.session.execute(
            select(CurrencyRate).where(CurrencyRate.currency_code == currency_code.upper())
        )
        return result.scalar_one_or_none()
    
    async def get_all_rates(self) -> List[CurrencyRate]:
        """Get all currency rates."""
        result = await self.session.execute(select(CurrencyRate))
        return list(result.scalars().all())
    
    async def update(self, id: UUID, **kwargs) -> Optional[CurrencyRate]:
        """Update a currency rate."""
        from sqlalchemy import update
        await self.session.execute(
            update(CurrencyRate)
            .where(CurrencyRate.id == id)
            .values(**kwargs)
        )
        await self.session.flush()
        return await self.get(id)
    
    async def delete(self, id: UUID) -> bool:
        """Delete a currency rate."""
        from sqlalchemy import delete
        result = await self.session.execute(
            delete(CurrencyRate).where(CurrencyRate.id == id)
        )
        await self.session.flush()
        return result.rowcount > 0


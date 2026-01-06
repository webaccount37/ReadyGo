"""
Account repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.account import Account


class AccountRepository(BaseRepository[Account]):
    """Repository for account operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(Account, session)
    
    def _base_query(self):
        """Base query with eager loading of billing_term relationship."""
        return select(Account).options(selectinload(Account.billing_term))
    
    async def list(
        self,
        skip: int = 0,
        limit: int = 100,
        **filters,
    ) -> List[Account]:
        """List accounts with pagination and filters, eagerly loading billing_term."""
        query = self._base_query()
        
        # Apply filters
        for key, value in filters.items():
            if hasattr(Account, key):
                query = query.where(getattr(Account, key) == value)
        
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get(self, id: UUID) -> Optional[Account]:
        """Get account by ID with billing_term relationship loaded."""
        query = self._base_query().where(Account.id == id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def get_by_company_name(self, company_name: str) -> Optional[Account]:
        """Get account by company name."""
        query = self._base_query().where(Account.company_name == company_name)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def get_with_contacts(self, account_id: UUID) -> Optional[Account]:
        """Get account with contacts loaded."""
        result = await self.session.execute(
            select(Account)
            .options(
                selectinload(Account.billing_term),
                selectinload(Account.contacts),
            )
            .where(Account.id == account_id)
        )
        return result.scalar_one_or_none()










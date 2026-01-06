"""
Contact repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.contact import Contact


class ContactRepository(BaseRepository[Contact]):
    """Repository for contact operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(Contact, session)
    
    async def list_by_account(
        self,
        account_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Contact]:
        """List contacts by account ID."""
        query = select(Contact).options(selectinload(Contact.account)).where(Contact.account_id == account_id)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def count_by_account(self, account_id: UUID) -> int:
        """Count contacts for an account."""
        from sqlalchemy import func
        result = await self.session.execute(
            select(func.count(Contact.id)).where(Contact.account_id == account_id)
        )
        return result.scalar() or 0
    
    async def get_primary_contact(self, account_id: UUID) -> Optional[Contact]:
        """Get the primary contact for an account."""
        result = await self.session.execute(
            select(Contact)
            .where(Contact.account_id == account_id)
            .where(Contact.is_primary == "true")
        )
        return result.scalar_one_or_none()
    
    async def clear_primary_contacts(self, account_id: UUID) -> None:
        """Clear primary status for all contacts of an account."""
        from sqlalchemy import update
        await self.session.execute(
            update(Contact)
            .where(Contact.account_id == account_id)
            .values(is_primary="false")
        )
        await self.session.commit()
    
    async def clear_billing_contacts(self, account_id: UUID) -> None:
        """Clear billing status for all contacts of an account."""
        from sqlalchemy import update
        await self.session.execute(
            update(Contact)
            .where(Contact.account_id == account_id)
            .values(is_billing="false")
        )
        await self.session.flush()
    
    async def list_all(
        self,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Contact]:
        """List all contacts with pagination."""
        query = select(Contact).options(selectinload(Contact.account)).offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def count_all(self) -> int:
        """Count all contacts."""
        from sqlalchemy import func
        result = await self.session.execute(
            select(func.count(Contact.id))
        )
        return result.scalar() or 0
    
    async def get(self, id: UUID) -> Optional[Contact]:
        """Get contact by ID with account relationship loaded."""
        query = select(Contact).options(selectinload(Contact.account)).where(Contact.id == id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()


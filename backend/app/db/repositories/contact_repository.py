"""
Contact repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.db.search_helpers import ilike_pattern, normalize_sort_order
from app.models.contact import Contact
from app.models.account import Account


class ContactRepository(BaseRepository[Contact]):
    """Repository for contact operations."""

    _SORT_COLUMNS = {
        "first_name": Contact.first_name,
        "last_name": Contact.last_name,
        "email": Contact.email,
        "phone": Contact.phone,
        "job_title": Contact.job_title,
        "account": Account.company_name,
    }
    
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
        search: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_order: Optional[str] = None,
    ) -> List[Contact]:
        """List all contacts with pagination."""
        query = (
            select(Contact)
            .options(selectinload(Contact.account))
            .join(Account, Contact.account_id == Account.id)
        )
        pattern = ilike_pattern(search)
        if pattern:
            query = query.where(
                or_(
                    Contact.first_name.ilike(pattern, escape="\\"),
                    Contact.last_name.ilike(pattern, escape="\\"),
                    Contact.email.ilike(pattern, escape="\\"),
                    Contact.phone.ilike(pattern, escape="\\"),
                    Contact.job_title.ilike(pattern, escape="\\"),
                    Account.company_name.ilike(pattern, escape="\\"),
                )
            )
        sk = sort_by or "last_name"
        sort_col = Account.company_name if sk == "account" else self._SORT_COLUMNS.get(sk, Contact.last_name)
        if normalize_sort_order(sort_order) == "desc":
            query = query.order_by(sort_col.desc().nulls_last(), Contact.first_name.desc())
        else:
            query = query.order_by(sort_col.asc().nulls_last(), Contact.first_name.asc())
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def count_all(self, search: Optional[str] = None) -> int:
        """Count all contacts."""
        query = select(func.count(Contact.id)).select_from(Contact).join(
            Account, Contact.account_id == Account.id
        )
        pattern = ilike_pattern(search)
        if pattern:
            query = query.where(
                or_(
                    Contact.first_name.ilike(pattern, escape="\\"),
                    Contact.last_name.ilike(pattern, escape="\\"),
                    Contact.email.ilike(pattern, escape="\\"),
                    Contact.phone.ilike(pattern, escape="\\"),
                    Contact.job_title.ilike(pattern, escape="\\"),
                    Account.company_name.ilike(pattern, escape="\\"),
                )
            )
        result = await self.session.execute(query)
        return result.scalar() or 0
    
    async def get(self, id: UUID) -> Optional[Contact]:
        """Get contact by ID with account relationship loaded."""
        query = select(Contact).options(selectinload(Contact.account)).where(Contact.id == id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()


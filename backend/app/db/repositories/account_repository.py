"""
Account repository for database operations.
"""

from typing import List, Optional, Sequence
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, cast, String
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.db.search_helpers import ilike_pattern, normalize_sort_order
from app.models.account import Account


class AccountRepository(BaseRepository[Account]):
    """Repository for account operations."""

    _SORT_COLUMNS = {
        "company_name": Account.company_name,
        "industry": Account.industry,
        "city": Account.city,
        "region": Account.region,
        "country": Account.country,
        "type": Account.type,
    }

    def __init__(self, session: AsyncSession):
        super().__init__(Account, session)
    
    def _base_query(self):
        """Base query with eager loading of billing_term relationship."""
        return select(Account).options(selectinload(Account.billing_term))

    def _apply_search(self, query, pattern: Optional[str]):
        if not pattern:
            return query
        type_txt = cast(Account.type, String)
        return query.where(
            or_(
                Account.company_name.ilike(pattern, escape="\\"),
                Account.industry.ilike(pattern, escape="\\"),
                Account.city.ilike(pattern, escape="\\"),
                Account.region.ilike(pattern, escape="\\"),
                Account.country.ilike(pattern, escape="\\"),
                type_txt.ilike(pattern, escape="\\"),
            )
        )

    def _apply_sort(self, query, sort_by: Optional[str], sort_order: Optional[str]):
        col = self._SORT_COLUMNS.get(sort_by or "", Account.company_name)
        if normalize_sort_order(sort_order) == "desc":
            return query.order_by(col.desc().nulls_last())
        return query.order_by(col.asc().nulls_last())
    
    async def list(
        self,
        skip: int = 0,
        limit: int = 100,
        search: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_order: Optional[str] = None,
        **filters,
    ) -> List[Account]:
        """List accounts with pagination and filters, eagerly loading billing_term."""
        query = self._base_query()
        
        # Apply filters
        for key, value in filters.items():
            if hasattr(Account, key):
                query = query.where(getattr(Account, key) == value)

        pattern = ilike_pattern(search)
        query = self._apply_search(query, pattern)
        query = self._apply_sort(query, sort_by, sort_order)
        
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def list_ids_for_aggregate_window(
        self,
        search: Optional[str] = None,
        limit: int = 10000,
        **filters,
    ) -> List[UUID]:
        """Account IDs only (no billing_term load), same filters/search as list(), ordered by company_name asc."""
        query = select(Account.id)
        for key, value in filters.items():
            if hasattr(Account, key):
                query = query.where(getattr(Account, key) == value)
        pattern = ilike_pattern(search)
        query = self._apply_search(query, pattern)
        query = query.order_by(Account.company_name.asc().nulls_last())
        query = query.limit(limit)
        result = await self.session.execute(query)
        return [row[0] for row in result.all()]

    async def list_by_ids_preserve_order(self, ids: Sequence[UUID]) -> List[Account]:
        """Load accounts by ID; return rows in the same order as ids (skip missing)."""
        if not ids:
            return []
        query = self._base_query().where(Account.id.in_(ids))
        result = await self.session.execute(query)
        by_id = {a.id: a for a in result.scalars().all()}
        return [by_id[i] for i in ids if i in by_id]

    async def count(
        self,
        search: Optional[str] = None,
        **filters,
    ) -> int:
        """Count accounts matching filters."""
        query = select(func.count(Account.id))
        for key, value in filters.items():
            if hasattr(Account, key):
                query = query.where(getattr(Account, key) == value)
        pattern = ilike_pattern(search)
        query = self._apply_search(query, pattern)
        result = await self.session.execute(query)
        return result.scalar_one() or 0
    
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










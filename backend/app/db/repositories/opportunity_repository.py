"""
Opportunity repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.opportunity import Opportunity, OpportunityStatus


class OpportunityRepository(BaseRepository[Opportunity]):
    """Repository for opportunity operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(Opportunity, session)
    
    def _base_query(self):
        """Base query with eager loading of account relationship."""
        return select(Opportunity).options(selectinload(Opportunity.account))
    
    async def list(
        self,
        skip: int = 0,
        limit: int = 100,
        **filters,
    ) -> List[Opportunity]:
        """List opportunities with pagination and filters, eagerly loading account."""
        query = self._base_query()
        
        # Apply filters
        for key, value in filters.items():
            if hasattr(Opportunity, key):
                query = query.where(getattr(Opportunity, key) == value)
        
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get(self, id: UUID) -> Optional[Opportunity]:
        """Get opportunity by ID with account relationship loaded."""
        query = self._base_query().where(Opportunity.id == id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def list_by_account(
        self,
        account_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Opportunity]:
        """List opportunities by account."""
        query = self._base_query().where(Opportunity.account_id == account_id)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_by_status(
        self,
        status: OpportunityStatus,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Opportunity]:
        """List opportunities by status."""
        query = self._base_query().where(Opportunity.status == status)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_by_date_range(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Opportunity]:
        """List opportunities within date range."""
        query = self._base_query()
        if start_date:
            query = query.where(Opportunity.start_date >= start_date)
        if end_date:
            query = query.where(Opportunity.end_date <= end_date)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_child_opportunities(
        self,
        parent_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Opportunity]:
        """List child opportunities of a parent."""
        query = self._base_query().where(Opportunity.parent_opportunity_id == parent_id)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_with_relationships(self, opportunity_id: UUID) -> Optional[Opportunity]:
        """Get opportunity with related entities."""
        # TODO: Refactor to use ESTIMATE_LINE_ITEMS from active estimates instead of association models
        from app.models.engagement import Engagement
        
        result = await self.session.execute(
            select(Opportunity)
            .options(
                selectinload(Opportunity.account),
                # TODO: Load employees from ESTIMATE_LINE_ITEMS where ACTIVE_VERSION = TRUE
                selectinload(Opportunity.engagements),
                selectinload(Opportunity.parent_opportunity),
            )
            .where(Opportunity.id == opportunity_id)
        )
        opportunity = result.scalar_one_or_none()
        return opportunity


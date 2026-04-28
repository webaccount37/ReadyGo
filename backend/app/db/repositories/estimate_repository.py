"""
Estimate repository for database operations.
"""

import logging
from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, asc
from sqlalchemy.orm import selectinload, noload

from app.db.repositories.base_repository import BaseRepository
from app.models.estimate import Estimate

logger = logging.getLogger(__name__)


class EstimateRepository(BaseRepository[Estimate]):
    """Repository for estimate operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(Estimate, session)
    
    def _base_query(self):
        """Base query with eager loading of relationships."""
        from app.models.opportunity import Opportunity
        
        return select(Estimate).options(
            selectinload(Estimate.opportunity).selectinload(Opportunity.account),
            selectinload(Estimate.created_by_employee),
            selectinload(Estimate.phases),
        )
    
    async def get(self, id: UUID) -> Optional[Estimate]:
        """Get estimate by ID with relationships loaded."""
        query = self._base_query().where(Estimate.id == id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    def _list_query_for_index(self):
        """List/index query: no phases, stable order (matches grouped list UX)."""
        from app.models.opportunity import Opportunity

        return (
            select(Estimate)
            .options(
                selectinload(Estimate.opportunity).selectinload(Opportunity.account),
                selectinload(Estimate.created_by_employee),
                noload(Estimate.phases),
            )
            .order_by(asc(Estimate.opportunity_id), asc(Estimate.name))
        )

    async def list_for_list_api(
        self,
        skip: int = 0,
        limit: int = 100,
        **filters,
    ) -> List[Estimate]:
        """List estimates for list API: slimmer loads and deterministic sort."""
        query = self._list_query_for_index()
        for key, value in filters.items():
            if hasattr(Estimate, key):
                query = query.where(getattr(Estimate, key) == value)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def list(
        self,
        skip: int = 0,
        limit: int = 100,
        **filters,
    ) -> List[Estimate]:
        """List estimates with pagination and filters."""
        query = self._base_query()

        # Apply filters
        for key, value in filters.items():
            if hasattr(Estimate, key):
                query = query.where(getattr(Estimate, key) == value)

        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def count(self, **filters) -> int:
        """Count estimates matching filters."""
        query = select(func.count(Estimate.id))
        
        for key, value in filters.items():
            if hasattr(Estimate, key):
                query = query.where(getattr(Estimate, key) == value)
        
        result = await self.session.execute(query)
        return result.scalar_one()
    
    async def list_by_opportunity(
        self,
        opportunity_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Estimate]:
        """List estimates by opportunity."""
        query = self._base_query().where(Estimate.opportunity_id == opportunity_id)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_with_line_items(self, estimate_id: UUID) -> Optional[Estimate]:
        """Get estimate with all line items and weekly hours."""
        from app.models.estimate import EstimateLineItem, EstimateWeeklyHours
        from app.models.opportunity import Opportunity
        from app.models.role_rate import RoleRate
        from app.models.role import Role
        from app.models.delivery_center import DeliveryCenter
        
        # CRITICAL: Use a single selectinload for line_items with all nested relationships chained
        # Multiple selectinload calls on the same relationship can cause issues
        result = await self.session.execute(
            select(Estimate)
            .options(
                selectinload(Estimate.opportunity).selectinload(Opportunity.account),
                selectinload(Estimate.created_by_employee),
                selectinload(Estimate.phases),
                # Single selectinload with all nested relationships chained
                selectinload(Estimate.line_items)
                .selectinload(EstimateLineItem.role_rate)
                .selectinload(RoleRate.role),
                selectinload(Estimate.line_items)
                .selectinload(EstimateLineItem.role_rate)
                .selectinload(RoleRate.delivery_center),
                selectinload(Estimate.line_items)
                .selectinload(EstimateLineItem.employee),
                selectinload(Estimate.line_items)
                .selectinload(EstimateLineItem.payable_center),
                selectinload(Estimate.line_items)
                .selectinload(EstimateLineItem.weekly_hours),
            )
            .where(Estimate.id == estimate_id)
        )
        estimate = result.scalar_one_or_none()

        if estimate and estimate.line_items:
            estimate.line_items.sort(key=lambda li: li.row_order if li.row_order is not None else 0)

        return estimate
    
    async def create(self, **kwargs) -> Estimate:
        """Create a new estimate."""
        instance = Estimate(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance
    
    async def update(self, id: UUID, **kwargs) -> Optional[Estimate]:
        """Update an estimate."""
        from sqlalchemy import update
        
        await self.session.execute(
            update(Estimate)
            .where(Estimate.id == id)
            .values(**kwargs)
        )
        await self.session.flush()
        return await self.get(id)
    
    async def delete(self, id: UUID) -> bool:
        """Delete an estimate."""
        from sqlalchemy import delete
        
        result = await self.session.execute(
            delete(Estimate).where(Estimate.id == id)
        )
        await self.session.flush()
        return result.rowcount > 0


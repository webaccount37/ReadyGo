"""
Estimate line item repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.estimate import EstimateLineItem


class EstimateLineItemRepository(BaseRepository[EstimateLineItem]):
    """Repository for estimate line item operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(EstimateLineItem, session)
    
    def _base_query(self):
        """Base query with eager loading of relationships."""
        from app.models.role_rate import RoleRate
        
        return select(EstimateLineItem).options(
            selectinload(EstimateLineItem.role_rate).selectinload(RoleRate.role),
            selectinload(EstimateLineItem.role_rate).selectinload(RoleRate.delivery_center),
            selectinload(EstimateLineItem.employee),
            selectinload(EstimateLineItem.estimate),
            selectinload(EstimateLineItem.weekly_hours),
        )
    
    async def get(self, id: UUID) -> Optional[EstimateLineItem]:
        """Get line item by ID with relationships loaded."""
        query = self._base_query().where(EstimateLineItem.id == id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def list_by_estimate(
        self,
        estimate_id: UUID,
    ) -> List[EstimateLineItem]:
        """List line items for an estimate, ordered by row_order."""
        query = self._base_query().where(EstimateLineItem.estimate_id == estimate_id)
        query = query.order_by(EstimateLineItem.row_order)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_with_weekly_hours(self, line_item_id: UUID) -> Optional[EstimateLineItem]:
        """Get line item with weekly hours."""
        from app.models.estimate import EstimateWeeklyHours
        from app.models.role_rate import RoleRate
        
        result = await self.session.execute(
            select(EstimateLineItem)
            .options(
                selectinload(EstimateLineItem.role_rate).selectinload(RoleRate.role),
                selectinload(EstimateLineItem.role_rate).selectinload(RoleRate.delivery_center),
                selectinload(EstimateLineItem.employee),
                selectinload(EstimateLineItem.estimate),
                selectinload(EstimateLineItem.weekly_hours),
            )
            .where(EstimateLineItem.id == line_item_id)
        )
        return result.scalar_one_or_none()
    
    async def get_max_row_order(self, estimate_id: UUID) -> int:
        """Get the maximum row_order for an estimate."""
        result = await self.session.execute(
            select(func.max(EstimateLineItem.row_order))
            .where(EstimateLineItem.estimate_id == estimate_id)
        )
        max_order = result.scalar_one_or_none()
        return max_order if max_order is not None else -1
    
    async def create(self, **kwargs) -> EstimateLineItem:
        """Create a new line item."""
        instance = EstimateLineItem(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance
    
    async def update(self, id: UUID, **kwargs) -> Optional[EstimateLineItem]:
        """Update a line item."""
        await self.session.execute(
            update(EstimateLineItem)
            .where(EstimateLineItem.id == id)
            .values(**kwargs)
        )
        await self.session.flush()
        return await self.get(id)
    
    async def delete(self, id: UUID) -> bool:
        """Delete a line item."""
        result = await self.session.execute(
            delete(EstimateLineItem).where(EstimateLineItem.id == id)
        )
        await self.session.flush()
        return result.rowcount > 0
    
    async def delete_by_estimate(self, estimate_id: UUID) -> int:
        """Delete all line items for an estimate."""
        result = await self.session.execute(
            delete(EstimateLineItem).where(EstimateLineItem.estimate_id == estimate_id)
        )
        await self.session.flush()
        return result.rowcount



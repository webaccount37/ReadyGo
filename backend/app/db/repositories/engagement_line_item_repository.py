"""
Engagement line item repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.engagement import EngagementLineItem


class EngagementLineItemRepository(BaseRepository[EngagementLineItem]):
    """Repository for engagement line item operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(EngagementLineItem, session)
    
    def _base_query(self):
        """Base query with eager loading of relationships."""
        from app.models.role_rate import RoleRate
        
        return select(EngagementLineItem).options(
            selectinload(EngagementLineItem.role_rate).selectinload(RoleRate.role),
            selectinload(EngagementLineItem.role_rate).selectinload(RoleRate.delivery_center),
            selectinload(EngagementLineItem.payable_center),  # Load Payable Center relationship
            selectinload(EngagementLineItem.employee),
            selectinload(EngagementLineItem.engagement),
            selectinload(EngagementLineItem.weekly_hours),
        )
    
    async def get(self, id: UUID) -> Optional[EngagementLineItem]:
        """Get line item by ID with relationships loaded."""
        query = self._base_query().where(EngagementLineItem.id == id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def list_by_employee_and_week(
        self,
        employee_id: UUID,
        week_start_date: date,
    ) -> List[EngagementLineItem]:
        """List line items for employee where the week overlaps [start_date, end_date]."""
        from datetime import timedelta

        week_end_date = week_start_date + timedelta(days=6)
        query = self._base_query().where(
            EngagementLineItem.employee_id == employee_id,
            EngagementLineItem.start_date <= week_end_date,
            EngagementLineItem.end_date >= week_start_date,
        )
        query = query.order_by(EngagementLineItem.row_order)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def list_by_engagement(
        self,
        engagement_id: UUID,
    ) -> List[EngagementLineItem]:
        """List line items for an engagement, ordered by row_order."""
        query = self._base_query().where(EngagementLineItem.engagement_id == engagement_id)
        query = query.order_by(EngagementLineItem.row_order)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_with_weekly_hours(self, line_item_id: UUID) -> Optional[EngagementLineItem]:
        """Get line item with weekly hours."""
        from app.models.engagement import EngagementWeeklyHours
        from app.models.role_rate import RoleRate
        
        result = await self.session.execute(
            select(EngagementLineItem)
            .options(
                selectinload(EngagementLineItem.role_rate).selectinload(RoleRate.role),
                selectinload(EngagementLineItem.role_rate).selectinload(RoleRate.delivery_center),
                selectinload(EngagementLineItem.payable_center),  # Load Payable Center relationship
                selectinload(EngagementLineItem.employee),
                selectinload(EngagementLineItem.engagement),
                selectinload(EngagementLineItem.weekly_hours),
            )
            .where(EngagementLineItem.id == line_item_id)
        )
        return result.scalar_one_or_none()
    
    async def get_max_row_order(self, engagement_id: UUID) -> int:
        """Get the maximum row_order for an engagement."""
        result = await self.session.execute(
            select(func.max(EngagementLineItem.row_order))
            .where(EngagementLineItem.engagement_id == engagement_id)
        )
        max_order = result.scalar_one_or_none()
        return max_order if max_order is not None else -1
    
    async def create(self, **kwargs) -> EngagementLineItem:
        """Create a new line item."""
        instance = EngagementLineItem(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance
    
    async def update(self, id: UUID, **kwargs) -> Optional[EngagementLineItem]:
        """Update a line item."""
        await self.session.execute(
            update(EngagementLineItem)
            .where(EngagementLineItem.id == id)
            .values(**kwargs)
        )
        await self.session.flush()
        return await self.get(id)
    
    async def delete(self, id: UUID) -> bool:
        """Delete a line item."""
        result = await self.session.execute(
            delete(EngagementLineItem).where(EngagementLineItem.id == id)
        )
        await self.session.flush()
        return result.rowcount > 0
    
    async def delete_by_engagement(self, engagement_id: UUID) -> int:
        """Delete all line items for an engagement."""
        result = await self.session.execute(
            delete(EngagementLineItem).where(EngagementLineItem.engagement_id == engagement_id)
        )
        await self.session.flush()
        return result.rowcount

"""
Engagement repository for database operations.
"""

import logging
from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.engagement import Engagement

logger = logging.getLogger(__name__)


class EngagementRepository(BaseRepository[Engagement]):
    """Repository for engagement operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(Engagement, session)
    
    def _base_query(self):
        """Base query with eager loading of relationships."""
        from app.models.opportunity import Opportunity
        
        return select(Engagement).options(
            selectinload(Engagement.opportunity).selectinload(Opportunity.account),
            selectinload(Engagement.created_by_employee),
            selectinload(Engagement.quote),
            selectinload(Engagement.phases),
        )
    
    async def get(self, id: UUID) -> Optional[Engagement]:
        """Get engagement by ID with relationships loaded."""
        query = self._base_query().where(Engagement.id == id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def list(
        self,
        skip: int = 0,
        limit: int = 100,
        **filters,
    ) -> List[Engagement]:
        """List engagements with pagination and filters."""
        query = self._base_query()
        
        # Apply filters
        for key, value in filters.items():
            if hasattr(Engagement, key):
                query = query.where(getattr(Engagement, key) == value)
        
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def count(self, **filters) -> int:
        """Count engagements matching filters."""
        query = select(func.count(Engagement.id))
        
        for key, value in filters.items():
            if hasattr(Engagement, key):
                query = query.where(getattr(Engagement, key) == value)
        
        result = await self.session.execute(query)
        return result.scalar_one()
    
    async def list_by_opportunity(
        self,
        opportunity_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Engagement]:
        """List engagements by opportunity."""
        query = self._base_query().where(Engagement.opportunity_id == opportunity_id)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_by_quote(
        self,
        quote_id: UUID,
    ) -> List[Engagement]:
        """List engagements by quote."""
        query = self._base_query().where(Engagement.quote_id == quote_id)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_with_line_items(self, engagement_id: UUID) -> Optional[Engagement]:
        """Get engagement with all line items and weekly hours."""
        from app.models.engagement import EngagementLineItem, EngagementWeeklyHours
        from app.models.opportunity import Opportunity
        from app.models.role_rate import RoleRate
        from app.models.role import Role
        from app.models.delivery_center import DeliveryCenter
        
        # CRITICAL: Use a single selectinload for line_items with all nested relationships chained
        result = await self.session.execute(
            select(Engagement)
            .options(
                selectinload(Engagement.opportunity).selectinload(Opportunity.account),
                selectinload(Engagement.created_by_employee),
                selectinload(Engagement.quote),
                selectinload(Engagement.phases),
                # Single selectinload with all nested relationships chained
                selectinload(Engagement.line_items)
                .selectinload(EngagementLineItem.role_rate)
                .selectinload(RoleRate.role),
                selectinload(Engagement.line_items)
                .selectinload(EngagementLineItem.role_rate)
                .selectinload(RoleRate.delivery_center),
                selectinload(Engagement.line_items)
                .selectinload(EngagementLineItem.employee),
                selectinload(Engagement.line_items)
                .selectinload(EngagementLineItem.weekly_hours),
            )
            .where(Engagement.id == engagement_id)
        )
        engagement = result.scalar_one_or_none()
        
        # CRITICAL: Always reload line items directly from database to ensure we get all records
        if engagement:
            from app.db.repositories.engagement_line_item_repository import EngagementLineItemRepository
            line_item_repo = EngagementLineItemRepository(self.session)
            actual_line_items = await line_item_repo.list_by_engagement(engagement_id)
            # Replace relationship-loaded items with actual database records
            engagement.line_items = actual_line_items
            logger.info(f"Reloaded {len(actual_line_items)} line items from database for engagement {engagement_id}")
        
        return engagement
    
    async def create(self, **kwargs) -> Engagement:
        """Create a new engagement."""
        instance = Engagement(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance
    
    async def update(self, id: UUID, **kwargs) -> Optional[Engagement]:
        """Update an engagement."""
        from sqlalchemy import update
        
        await self.session.execute(
            update(Engagement)
            .where(Engagement.id == id)
            .values(**kwargs)
        )
        await self.session.flush()
        return await self.get(id)
    
    async def delete(self, id: UUID) -> bool:
        """Delete an engagement."""
        from sqlalchemy import delete
        
        result = await self.session.execute(
            delete(Engagement).where(Engagement.id == id)
        )
        await self.session.flush()
        return result.rowcount > 0

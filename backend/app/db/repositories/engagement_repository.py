"""
Engagement repository for database operations.
"""

import logging
from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, distinct, or_, and_
from sqlalchemy.orm import selectinload, with_loader_criteria

from app.db.repositories.base_repository import BaseRepository
from app.db.search_helpers import ilike_pattern, normalize_sort_order
from app.models.engagement import Engagement

logger = logging.getLogger(__name__)


class EngagementRepository(BaseRepository[Engagement]):
    """Repository for engagement operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(Engagement, session)
    
    def _base_query(self, include_line_items: bool = False):
        """Base query with eager loading of relationships."""
        from app.models.engagement import EngagementLineItem
        from app.models.opportunity import Opportunity

        opts = [
            selectinload(Engagement.opportunity).selectinload(Opportunity.account),
            selectinload(Engagement.created_by_employee),
            selectinload(Engagement.quote),
            selectinload(Engagement.phases),
        ]
        if include_line_items:
            opts.append(selectinload(Engagement.line_items).selectinload(EngagementLineItem.weekly_hours))
        return select(Engagement).options(*opts)
    
    async def get(self, id: UUID) -> Optional[Engagement]:
        """Get engagement by ID with relationships loaded."""
        query = self._base_query().where(Engagement.id == id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def list(
        self,
        skip: int = 0,
        limit: int = 100,
        include_line_items: bool = False,
        search: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_order: Optional[str] = None,
        **filters,
    ) -> List[Engagement]:
        """List engagements with pagination and filters."""
        from app.models.opportunity import Opportunity
        from app.models.account import Account
        from app.models.quote import Quote

        query = self._base_query(include_line_items=include_line_items)
        query = (
            query.join(Opportunity, Engagement.opportunity_id == Opportunity.id)
            .join(Account, Opportunity.account_id == Account.id)
            .join(Quote, Engagement.quote_id == Quote.id)
        )

        for key, value in filters.items():
            if hasattr(Engagement, key):
                query = query.where(getattr(Engagement, key) == value)

        pattern = ilike_pattern(search)
        if pattern:
            query = query.where(
                or_(
                    Engagement.name.ilike(pattern, escape="\\"),
                    Quote.quote_number.ilike(pattern, escape="\\"),
                    Opportunity.name.ilike(pattern, escape="\\"),
                    Account.company_name.ilike(pattern, escape="\\"),
                )
            )

        sk = sort_by or "name"
        desc = normalize_sort_order(sort_order) == "desc"
        col_map = {
            "name": Engagement.name,
            "account": Account.company_name,
            "opportunity": Opportunity.name,
            "opportunity_start_date": Opportunity.start_date,
            "opportunity_end_date": Opportunity.end_date,
            "quote": Quote.quote_number,
            "created_at": Engagement.created_at,
        }
        col = col_map.get(sk, Engagement.name)
        if desc:
            query = query.order_by(col.desc().nulls_last())
        else:
            query = query.order_by(col.asc().nulls_last())

        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def count(
        self,
        search: Optional[str] = None,
        **filters,
    ) -> int:
        """Count engagements matching filters."""
        from app.models.opportunity import Opportunity
        from app.models.account import Account
        from app.models.quote import Quote

        query = select(func.count(Engagement.id)).select_from(Engagement).join(
            Opportunity, Engagement.opportunity_id == Opportunity.id
        ).join(Account, Opportunity.account_id == Account.id).join(
            Quote, Engagement.quote_id == Quote.id
        )

        for key, value in filters.items():
            if hasattr(Engagement, key):
                query = query.where(getattr(Engagement, key) == value)

        pattern = ilike_pattern(search)
        if pattern:
            query = query.where(
                or_(
                    Engagement.name.ilike(pattern, escape="\\"),
                    Quote.quote_number.ilike(pattern, escape="\\"),
                    Opportunity.name.ilike(pattern, escape="\\"),
                    Account.company_name.ilike(pattern, escape="\\"),
                )
            )

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

    async def list_by_employee_on_resource_plan(
        self,
        employee_id: UUID,
        skip: int = 0,
        limit: int = 200,
        week_start_date: Optional["date"] = None,
    ) -> List[Engagement]:
        """List engagements where the employee has a line item on the resource plan.
        
        When week_start_date is provided, only return engagements where a line item for
        this employee overlaps the given week (line_item.start_date <= week_end and
        line_item.end_date >= week_start). Used for timesheet project dropdown filtering.
        
        Uses subquery for distinct IDs to avoid PostgreSQL 'equality operator for type json'
        error when DISTINCT is applied to full Engagement rows (attributes column is JSON).

        Line items are filtered to this employee (and week overlap when ``week_start_date`` is set);
        weekly_hours are not loaded (not needed for timesheet list / pick_timesheet_line_item).
        """
        from datetime import timedelta
        from app.models.engagement import EngagementLineItem
        from app.models.opportunity import Opportunity
        from app.models.quote import Quote

        subq = (
            select(Engagement.id)
            .join(EngagementLineItem, Engagement.id == EngagementLineItem.engagement_id)
            .where(EngagementLineItem.employee_id == employee_id)
        )
        if week_start_date is not None:
            week_end = week_start_date + timedelta(days=6)
            subq = subq.where(
                EngagementLineItem.start_date <= week_end,
                EngagementLineItem.end_date >= week_start_date,
            )
        subq = subq.distinct()

        li_criteria = EngagementLineItem.employee_id == employee_id
        if week_start_date is not None:
            week_end = week_start_date + timedelta(days=6)
            li_criteria = and_(
                li_criteria,
                EngagementLineItem.start_date <= week_end,
                EngagementLineItem.end_date >= week_start_date,
            )

        query = (
            select(Engagement)
            .options(
                selectinload(Engagement.opportunity).selectinload(Opportunity.account),
                selectinload(Engagement.created_by_employee),
                selectinload(Engagement.quote).selectinload(Quote.opportunity),
                selectinload(Engagement.phases),
                with_loader_criteria(EngagementLineItem, li_criteria, include_aliases=True),
                selectinload(Engagement.line_items),
            )
            .where(Engagement.id.in_(subq))
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def count_by_employee_on_resource_plan_for_week(
        self, employee_id: UUID, week_start_date
    ) -> int:
        """Count engagements where the employee has a line item overlapping the given week."""
        from datetime import timedelta
        from app.models.engagement import EngagementLineItem

        week_end = week_start_date + timedelta(days=6)
        result = await self.session.execute(
            select(func.count(distinct(Engagement.id)))
            .select_from(Engagement)
            .join(EngagementLineItem, Engagement.id == EngagementLineItem.engagement_id)
            .where(
                EngagementLineItem.employee_id == employee_id,
                EngagementLineItem.start_date <= week_end,
                EngagementLineItem.end_date >= week_start_date,
            )
        )
        return result.scalar() or 0

    async def count_by_employee_on_resource_plan(self, employee_id: UUID) -> int:
        """Count engagements where the employee has a line item on the resource plan."""
        from app.models.engagement import EngagementLineItem

        result = await self.session.execute(
            select(func.count(distinct(Engagement.id)))
            .select_from(Engagement)
            .join(EngagementLineItem, Engagement.id == EngagementLineItem.engagement_id)
            .where(EngagementLineItem.employee_id == employee_id)
        )
        return result.scalar() or 0
    
    async def load_engagements_for_plan_actuals_batch(
        self, opportunity_ids: List[UUID]
    ) -> List[Engagement]:
        """All engagements for the given opportunities, with quote + line items + weekly hours.

        Uses one eager-loaded query only. Do not assign to ``engagement.line_items`` after load in
        async SQLAlchemy — that triggers a lazy read of the old collection and raises MissingGreenlet.
        """
        if not opportunity_ids:
            return []
        from app.models.engagement import EngagementLineItem

        q = (
            select(Engagement)
            .where(Engagement.opportunity_id.in_(opportunity_ids))
            .options(
                selectinload(Engagement.quote),
                selectinload(Engagement.line_items).selectinload(EngagementLineItem.weekly_hours),
            )
        )
        return list((await self.session.execute(q)).scalars().all())

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

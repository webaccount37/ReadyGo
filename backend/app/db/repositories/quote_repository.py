"""
Quote repository for database operations.
"""

from typing import Dict, Optional, List, Tuple
from uuid import UUID
from collections import defaultdict

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload, load_only

from app.db.repositories.base_repository import BaseRepository
from app.models.quote import Quote, QuoteLineItem, QuoteStatus


class QuoteRepository(BaseRepository[Quote]):
    """Repository for quote operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(Quote, session)
    
    def _base_query(self):
        """Base query with eager loading of relationships."""
        from app.models.opportunity import Opportunity
        from app.models.estimate import Estimate

        return select(Quote).options(
            selectinload(Quote.opportunity).selectinload(Opportunity.account),
            selectinload(Quote.estimate),
            selectinload(Quote.created_by_employee),
        )

    def _list_api_eager_options(self):
        """Lean eager loads for list APIs (subset of columns on joined rows)."""
        from app.models.opportunity import Opportunity
        from app.models.estimate import Estimate
        from app.models.account import Account
        from app.models.employee import Employee

        return (
            selectinload(Quote.opportunity)
            .load_only(
                Opportunity.id,
                Opportunity.name,
                Opportunity.account_id,
                Opportunity.start_date,
                Opportunity.end_date,
                Opportunity.default_currency,
            )
            .selectinload(Opportunity.account)
            .load_only(Account.id, Account.company_name),
            selectinload(Quote.estimate).load_only(Estimate.id, Estimate.name),
            selectinload(Quote.created_by_employee).load_only(
                Employee.id,
                Employee.first_name,
                Employee.last_name,
            ),
        )

    async def list_for_list_api(
        self,
        skip: int = 0,
        limit: int = 100,
        opportunity_id: Optional[UUID] = None,
    ) -> Tuple[List[Quote], int]:
        """List quotes for the list API with windowed total count (one round-trip when non-empty)."""
        wl = func.count().over().label("_list_total")
        stmt = (
            select(Quote, wl)
            .options(*self._list_api_eager_options())
            .order_by(Quote.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        if opportunity_id is not None:
            stmt = stmt.where(Quote.opportunity_id == opportunity_id)

        result = await self.session.execute(stmt)
        rows = result.all()
        if not rows:
            cq = select(func.count(Quote.id))
            if opportunity_id is not None:
                cq = cq.where(Quote.opportunity_id == opportunity_id)
            total = (await self.session.execute(cq)).scalar_one()
            return [], int(total)

        quotes = [r[0] for r in rows]
        total = int(rows[0][1])
        return quotes, total

    async def list_drafts_for_approver_centers(
        self,
        delivery_center_ids: List[UUID],
        skip: int,
        limit: int,
    ) -> Tuple[List[Quote], int]:
        """Draft quotes for approver delivery centers with windowed total count."""
        from app.models.opportunity import Opportunity

        wl = func.count().over().label("_list_total")
        stmt = (
            select(Quote, wl)
            .join(Opportunity, Quote.opportunity_id == Opportunity.id)
            .where(
                Quote.status == QuoteStatus.DRAFT,
                Opportunity.delivery_center_id.in_(delivery_center_ids),
            )
            .options(*self._list_api_eager_options())
            .order_by(Quote.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        rows = result.all()
        if not rows:
            cq = (
                select(func.count(Quote.id))
                .join(Opportunity, Quote.opportunity_id == Opportunity.id)
                .where(
                    Quote.status == QuoteStatus.DRAFT,
                    Opportunity.delivery_center_id.in_(delivery_center_ids),
                )
            )
            total = (await self.session.execute(cq)).scalar_one()
            return [], int(total)

        return [r[0] for r in rows], int(rows[0][1])

    async def load_line_items_with_weekly_by_quote_ids(
        self, quote_ids: List[UUID]
    ) -> Dict[UUID, List[QuoteLineItem]]:
        """Batch-load quote line items and weekly hours for list financial summaries."""
        if not quote_ids:
            return {}
        stmt = (
            select(QuoteLineItem)
            .where(QuoteLineItem.quote_id.in_(quote_ids))
            .options(selectinload(QuoteLineItem.weekly_hours))
            .order_by(QuoteLineItem.quote_id, QuoteLineItem.row_order)
        )
        result = await self.session.execute(stmt)
        items = list(result.scalars().all())
        by_quote: Dict[UUID, List[QuoteLineItem]] = defaultdict(list)
        for li in items:
            by_quote[li.quote_id].append(li)
        return dict(by_quote)
    
    async def get(self, id: UUID) -> Optional[Quote]:
        """Get quote by ID with relationships loaded."""
        query = self._base_query().where(Quote.id == id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def list(
        self,
        skip: int = 0,
        limit: int = 100,
        **filters,
    ) -> List[Quote]:
        """List quotes with pagination and filters."""
        query = self._base_query()
        
        # Apply filters
        for key, value in filters.items():
            if hasattr(Quote, key):
                query = query.where(getattr(Quote, key) == value)
        
        query = query.offset(skip).limit(limit).order_by(Quote.created_at.desc())
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def count(self, **filters) -> int:
        """Count quotes matching filters."""
        query = select(func.count(Quote.id))
        
        for key, value in filters.items():
            if hasattr(Quote, key):
                query = query.where(getattr(Quote, key) == value)
        
        result = await self.session.execute(query)
        return result.scalar_one()
    
    async def get_active_quote_by_opportunity(self, opportunity_id: UUID) -> Optional[Quote]:
        """Get active quote for an opportunity."""
        query = self._base_query().where(
            Quote.opportunity_id == opportunity_id,
            Quote.is_active == True
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def map_active_quotes_by_opportunity_ids(
        self, opportunity_ids: List[UUID]
    ) -> Dict[UUID, Quote]:
        """At most one active quote per opportunity; first row wins if duplicates exist."""
        if not opportunity_ids:
            return {}
        # List callers only need id + opportunity_id; avoid heavy selectinloads.
        query = (
            select(Quote)
            .options(load_only(Quote.id, Quote.opportunity_id))
            .where(
                Quote.opportunity_id.in_(opportunity_ids),
                Quote.is_active == True,
            )
        )
        result = await self.session.execute(query)
        rows = list(result.scalars().all())
        out: Dict[UUID, Quote] = {}
        for q in rows:
            oid = q.opportunity_id
            if oid is not None and oid not in out:
                out[oid] = q
        return out

    async def list_by_opportunity(
        self,
        opportunity_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Quote]:
        """List quotes by opportunity."""
        query = self._base_query().where(Quote.opportunity_id == opportunity_id)
        query = query.order_by(Quote.created_at.desc()).offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def deactivate_all_by_opportunity(self, opportunity_id: UUID) -> int:
        """Deactivate all quotes for an opportunity."""
        from sqlalchemy import update
        
        result = await self.session.execute(
            update(Quote)
            .where(Quote.opportunity_id == opportunity_id)
            .values(is_active=False)
        )
        await self.session.flush()
        return result.rowcount
    
    async def get_max_version_by_opportunity(self, opportunity_id: UUID) -> int:
        """Get the maximum version number for quotes of an opportunity."""
        result = await self.session.execute(
            select(func.max(Quote.version))
            .where(Quote.opportunity_id == opportunity_id)
        )
        max_version = result.scalar_one_or_none()
        return max_version if max_version is not None else 0
    
    async def invalidate_previous_versions(self, opportunity_id: UUID, exclude_quote_id: Optional[UUID] = None) -> int:
        """Set all previous versions of quotes for an opportunity to INVALID status, except REJECTED quotes which remain REJECTED."""
        from app.models.quote import QuoteStatus
        from sqlalchemy import update
        
        query = update(Quote).where(
            Quote.opportunity_id == opportunity_id,
            Quote.status != QuoteStatus.INVALID,
            Quote.status != QuoteStatus.REJECTED
        )
        
        if exclude_quote_id:
            query = query.where(Quote.id != exclude_quote_id)
        
        result = await self.session.execute(
            query.values(status=QuoteStatus.INVALID)
        )
        await self.session.flush()
        return result.rowcount


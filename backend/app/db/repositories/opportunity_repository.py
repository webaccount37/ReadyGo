"""
Opportunity repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, cast, String
from sqlalchemy.orm import selectinload, aliased

from app.db.repositories.base_repository import BaseRepository
from app.db.search_helpers import ilike_pattern, normalize_sort_order
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

    async def count(self, **filters) -> int:
        """Count opportunities matching optional column filters (same keys as list())."""
        query = select(func.count(Opportunity.id))
        for key, value in filters.items():
            if hasattr(Opportunity, key):
                query = query.where(getattr(Opportunity, key) == value)
        result = await self.session.execute(query)
        return int(result.scalar_one() or 0)

    async def count_by_account(self, account_id: UUID) -> int:
        result = await self.session.execute(
            select(func.count(Opportunity.id)).where(Opportunity.account_id == account_id)
        )
        return int(result.scalar_one() or 0)

    async def count_by_status(self, status: OpportunityStatus) -> int:
        result = await self.session.execute(
            select(func.count(Opportunity.id)).where(Opportunity.status == status)
        )
        return int(result.scalar_one() or 0)

    async def count_by_date_range(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> int:
        query = select(func.count(Opportunity.id))
        if start_date:
            query = query.where(Opportunity.start_date >= start_date)
        if end_date:
            query = query.where(Opportunity.end_date <= end_date)
        result = await self.session.execute(query)
        return int(result.scalar_one() or 0)

    async def count_child_opportunities(self, parent_id: UUID) -> int:
        result = await self.session.execute(
            select(func.count(Opportunity.id)).where(
                Opportunity.parent_opportunity_id == parent_id
            )
        )
        return int(result.scalar_one() or 0)
    
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
        # Employees are loaded from ESTIMATE_LINE_ITEMS where ACTIVE_VERSION = TRUE
        # This is handled in the service layer, not the repository
        result = await self.session.execute(
            select(Opportunity)
            .options(
                selectinload(Opportunity.account),
                selectinload(Opportunity.parent_opportunity),
            )
            .where(Opportunity.id == opportunity_id)
        )
        opportunity = result.scalar_one_or_none()
        return opportunity
    
    async def count_by_account(self, account_id: UUID) -> int:
        """Count opportunities for an account."""
        result = await self.session.execute(
            select(func.count(Opportunity.id)).where(Opportunity.account_id == account_id)
        )
        return result.scalar() or 0

    async def list_without_sharepoint_folder(
        self,
        skip: int = 0,
        limit: int = 500,
    ) -> List[Opportunity]:
        """Opportunities with no linked SharePoint folder (for backfill)."""
        query = (
            self._base_query()
            .where(Opportunity.sharepoint_folder_web_url.is_(None))
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_average_deal_value_by_currency(self, currency: str):
        """Get average deal_value and count for opportunities with given default_currency and non-null deal_value."""
        from decimal import Decimal

        currency_upper = (currency or "USD").upper()
        query = select(
            func.avg(Opportunity.deal_value).label("avg_value"),
            func.count(Opportunity.id).label("cnt"),
        ).where(
            Opportunity.default_currency == currency_upper,
            Opportunity.deal_value.isnot(None),
        )
        result = await self.session.execute(query)
        row = result.one_or_none()
        if not row or (row.cnt or 0) == 0:
            return None, 0
        avg_val = Decimal(str(row.avg_value)) if row.avg_value is not None else None
        return avg_val, int(row.cnt or 0)

    def _list_api_base(self):
        from app.models.account import Account
        from app.models.delivery_center import DeliveryCenter
        from app.models.employee import Employee

        O = Opportunity
        parent_opp = aliased(Opportunity)
        owner = aliased(Employee)
        base = (
            select(O)
            .options(
                selectinload(O.account),
                selectinload(O.delivery_center),
                selectinload(O.opportunity_owner),
            )
            .join(Account, O.account_id == Account.id)
            .outerjoin(DeliveryCenter, O.delivery_center_id == DeliveryCenter.id)
            .outerjoin(owner, O.opportunity_owner_id == owner.id)
            .outerjoin(parent_opp, O.parent_opportunity_id == parent_opp.id)
        )
        return O, Account, DeliveryCenter, owner, parent_opp, base

    def _apply_list_api_filters(
        self,
        query,
        O,
        Account,
        DeliveryCenter,
        owner,
        parent_opp,
        account_id: Optional[UUID] = None,
        status_enum: Optional[OpportunityStatus] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        search: Optional[str] = None,
    ):
        if account_id:
            query = query.where(O.account_id == account_id)
        if status_enum is not None:
            query = query.where(O.status == status_enum)
        if start_date:
            query = query.where(O.start_date >= start_date)
        if end_date:
            query = query.where(O.end_date <= end_date)
        pattern = ilike_pattern(search)
        if pattern:
            status_txt = cast(O.status, String)
            query = query.where(
                or_(
                    O.name.ilike(pattern, escape="\\"),
                    O.description.ilike(pattern, escape="\\"),
                    Account.company_name.ilike(pattern, escape="\\"),
                    status_txt.ilike(pattern, escape="\\"),
                    DeliveryCenter.name.ilike(pattern, escape="\\"),
                    DeliveryCenter.code.ilike(pattern, escape="\\"),
                    owner.first_name.ilike(pattern, escape="\\"),
                    owner.last_name.ilike(pattern, escape="\\"),
                    parent_opp.name.ilike(pattern, escape="\\"),
                    cast(O.deal_value_usd, String).ilike(pattern, escape="\\"),
                    cast(O.forecast_value_usd, String).ilike(pattern, escape="\\"),
                )
            )
        return query

    def _apply_list_api_sort(self, query, O, Account, DeliveryCenter, owner, sort_by: Optional[str], sort_order: Optional[str]):
        sk = sort_by or "name"
        desc = normalize_sort_order(sort_order) == "desc"
        if sk == "owner":
            if desc:
                return query.order_by(
                    owner.last_name.desc().nulls_last(),
                    owner.first_name.desc().nulls_last(),
                )
            return query.order_by(
                owner.last_name.asc().nulls_last(),
                owner.first_name.asc().nulls_last(),
            )
        col_map = {
            "name": O.name,
            "status": O.status,
            "start_date": O.start_date,
            "end_date": O.end_date,
            "account": Account.company_name,
            "deal_value_usd": O.deal_value_usd,
            "forecast_value_usd": O.forecast_value_usd,
            "default_currency": O.default_currency,
            "delivery_center": DeliveryCenter.name,
        }
        col = col_map.get(sk, O.name)
        if desc:
            return query.order_by(col.desc().nulls_last())
        return query.order_by(col.asc().nulls_last())

    async def list_for_list_api(
        self,
        skip: int = 0,
        limit: int = 100,
        account_id: Optional[UUID] = None,
        status_enum: Optional[OpportunityStatus] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        search: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_order: Optional[str] = None,
    ) -> List[Opportunity]:
        O, Account, DeliveryCenter, owner, parent_opp, query = self._list_api_base()
        query = self._apply_list_api_filters(
            query, O, Account, DeliveryCenter, owner, parent_opp,
            account_id, status_enum, start_date, end_date, search,
        )
        query = self._apply_list_api_sort(query, O, Account, DeliveryCenter, owner, sort_by, sort_order)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def count_for_list_api(
        self,
        account_id: Optional[UUID] = None,
        status_enum: Optional[OpportunityStatus] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        search: Optional[str] = None,
    ) -> int:
        O, Account, DeliveryCenter, owner, parent_opp, _ = self._list_api_base()
        query = select(func.count(O.id)).select_from(O).join(Account, O.account_id == Account.id).outerjoin(
            DeliveryCenter, O.delivery_center_id == DeliveryCenter.id
        ).outerjoin(owner, O.opportunity_owner_id == owner.id).outerjoin(
            parent_opp, O.parent_opportunity_id == parent_opp.id
        )
        query = self._apply_list_api_filters(
            query, O, Account, DeliveryCenter, owner, parent_opp,
            account_id, status_enum, start_date, end_date, search,
        )
        result = await self.session.execute(query)
        return int(result.scalar_one() or 0)

"""
Account service with business logic.
"""

from datetime import date
from decimal import Decimal
from typing import List, Optional, Set
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.services.opportunity_service import OpportunityService
from app.db.repositories.account_repository import AccountRepository
from app.db.repositories.contact_repository import ContactRepository
from app.db.repositories.opportunity_repository import OpportunityRepository
from app.db.search_helpers import normalize_sort_order
from app.schemas.account import AccountCreate, AccountUpdate, AccountResponse
from app.models.account import Account

_AGGREGATE_SORT_KEYS = frozenset({"forecast_sum", "plan_sum", "actuals_sum"})
_MAX_ACCOUNTS_FOR_AGGREGATE_SORT = 10000


class AccountService(BaseService):
    """Service for account operations."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.account_repo = AccountRepository(session)
        self.contact_repo = ContactRepository(session)
        self.opportunity_repo = OpportunityRepository(session)
        self.opportunity_service = OpportunityService(session)

    async def create_account(self, account_data: AccountCreate) -> AccountResponse:
        """Create a new account."""
        account_dict = account_data.model_dump(exclude_unset=True)
        account = await self.account_repo.create(**account_dict)
        await self.session.commit()
        account = await self.account_repo.get(account.id)
        if not account:
            raise ValueError("Failed to reload account after creation")
        return await self._to_account_response_with_enrichment(account)

    async def get_account(self, account_id: UUID) -> Optional[AccountResponse]:
        """Get account by ID."""
        account = await self.account_repo.get(account_id)
        if not account:
            return None
        return await self._to_account_response_with_enrichment(account)

    async def get_account_with_opportunities(self, account_id: UUID) -> Optional[AccountResponse]:
        """Get account with related opportunities."""
        account = await self.account_repo.get(account_id)
        if not account:
            return None
        return await self._to_account_response_with_enrichment(account)

    async def _to_account_response_with_enrichment(self, account: Account) -> AccountResponse:
        active_ids = await self.opportunity_repo.account_ids_with_active_engagement_line_on(
            [account.id], date.today()
        )
        return await self._build_enriched_account_row(account, active_ids)

    async def _build_enriched_account_row(
        self,
        account: Account,
        active_account_ids: Set[UUID],
    ) -> AccountResponse:
        account_dict = AccountResponse.model_validate(account).model_dump()
        contact_count = await self.contact_repo.count_by_account(account.id)
        opportunity_count = await self.opportunity_repo.count_by_account(account.id)
        account_dict["contact_count"] = contact_count
        account_dict["opportunities_count"] = opportunity_count

        opportunities_raw = await self.opportunity_repo.list_by_account(
            account.id, skip=0, limit=10000
        )
        raw_by_id = {str(o.id): o for o in opportunities_raw}
        opportunities_with_plan, _ = await self.opportunity_service.list_opportunities(
            account_id=account.id, skip=0, limit=10000
        )
        forecast_sum = Decimal("0")
        plan_sum = Decimal("0")
        actuals_sum = Decimal("0")
        has_locked_opportunities = False
        for opp in opportunities_with_plan:
            opp_id = getattr(opp, "id", None)
            raw = raw_by_id.get(str(opp_id) if opp_id else "")
            if raw:
                fv = raw.forecast_value_usd
                if fv is not None and Decimal(str(fv)) > 0:
                    forecast_sum += Decimal(str(fv))
                elif raw.deal_value_usd is not None and raw.probability is not None and raw.probability > 0:
                    forecast_sum += Decimal(str(raw.deal_value_usd)) * (Decimal(str(raw.probability)) / 100)
            if opp.plan_amount is not None and opp.plan_amount != "":
                try:
                    plan_sum += Decimal(str(opp.plan_amount))
                except (ValueError, TypeError):
                    pass
            if opp.actuals_amount is not None and opp.actuals_amount != "" and str(opp.actuals_amount) != "0":
                try:
                    actuals_sum += Decimal(str(opp.actuals_amount))
                except (ValueError, TypeError):
                    pass
            if getattr(opp, "is_permanently_locked", False) or getattr(opp, "is_locked", False):
                has_locked_opportunities = True
        account_dict["forecast_sum"] = float(forecast_sum) if forecast_sum and forecast_sum != 0 else None
        account_dict["plan_sum"] = float(plan_sum) if plan_sum and plan_sum != 0 else None
        account_dict["actuals_sum"] = float(actuals_sum) if actuals_sum and actuals_sum != 0 else None
        account_dict["has_locked_opportunities"] = has_locked_opportunities
        account_dict["has_active_engagement_today"] = account.id in active_account_ids
        account_dict["msa_original_filename"] = getattr(account, "msa_original_filename", None)
        account_dict["nda_original_filename"] = getattr(account, "nda_original_filename", None)
        account_dict["other_original_filename"] = getattr(account, "other_original_filename", None)
        return AccountResponse(**account_dict)

    async def list_accounts(
        self,
        skip: int = 0,
        limit: int = 100,
        region: Optional[str] = None,
        search: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_order: Optional[str] = None,
    ) -> tuple[List[AccountResponse], int]:
        """List accounts with optional filters."""
        region_kw = {"region": region} if region else {}
        total = await self.account_repo.count(search=search, **region_kw)

        if sort_by in _AGGREGATE_SORT_KEYS:
            all_accounts = await self.account_repo.list(
                skip=0,
                limit=_MAX_ACCOUNTS_FOR_AGGREGATE_SORT,
                search=search,
                sort_by="company_name",
                sort_order="asc",
                **region_kw,
            )
            ids = [a.id for a in all_accounts]
            active_ids = await self.opportunity_repo.account_ids_with_active_engagement_line_on(
                ids, date.today()
            )
            responses: List[AccountResponse] = []
            for account in all_accounts:
                responses.append(await self._build_enriched_account_row(account, active_ids))

            reverse = normalize_sort_order(sort_order) == "desc"

            def _agg_sort_key(r: AccountResponse) -> tuple:
                v = getattr(r, sort_by, None)
                missing = v is None
                val = float(v) if v is not None else 0.0
                return (1 if missing else 0, val)

            responses.sort(key=_agg_sort_key, reverse=reverse)
            return responses[skip : skip + limit], total

        accounts = await self.account_repo.list(
            skip=skip,
            limit=limit,
            search=search,
            sort_by=sort_by,
            sort_order=sort_order,
            **region_kw,
        )
        ids = [a.id for a in accounts]
        active_ids = await self.opportunity_repo.account_ids_with_active_engagement_line_on(ids, date.today())
        responses = []
        for account in accounts:
            responses.append(await self._build_enriched_account_row(account, active_ids))
        return responses, total

    async def update_account(
        self,
        account_id: UUID,
        account_data: AccountUpdate,
    ) -> Optional[AccountResponse]:
        """Update an account."""
        account = await self.account_repo.get(account_id)
        if not account:
            return None

        update_dict = account_data.model_dump(exclude_unset=True)
        updated = await self.account_repo.update(account_id, **update_dict)
        await self.session.commit()
        updated = await self.account_repo.get(account_id)
        if not updated:
            return None
        return await self._to_account_response_with_enrichment(updated)

    async def delete_account(self, account_id: UUID) -> bool:
        """Delete an account. Fails if account has any locked or permanently locked opportunities."""
        opportunities, _ = await self.opportunity_service.list_opportunities(
            account_id=account_id, skip=0, limit=10000
        )
        for opp in opportunities:
            if getattr(opp, "is_permanently_locked", False) or getattr(opp, "is_locked", False):
                raise ValueError(
                    "Cannot delete account: it has opportunities that are locked (by active quote) or permanently locked (by timesheets). "
                    "Unlock or remove those opportunities first."
                )
        deleted = await self.account_repo.delete(account_id)
        await self.session.commit()
        return deleted

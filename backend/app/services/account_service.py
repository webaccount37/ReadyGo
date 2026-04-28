"""
Account service with business logic.
"""

from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Any, Dict, List, Optional, Set
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.services.account_list_forecast import forecast_contribution_from_opportunity_row
from app.services.opportunity_service import OpportunityService
from app.db.repositories.account_repository import AccountRepository
from app.db.repositories.contact_repository import ContactRepository
from app.db.repositories.opportunity_repository import OpportunityRepository
from app.db.repositories.opportunity_permanent_lock_repository import OpportunityPermanentLockRepository
from app.db.repositories.quote_repository import QuoteRepository
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
        self.perm_lock_repo = OpportunityPermanentLockRepository(session)
        self.quote_repo = QuoteRepository(session)

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

    async def _batch_compute_list_enrichment(
        self,
        account_ids: List[UUID],
        active_engagement_account_ids: Set[UUID],
        *,
        include_plan_actuals: bool = True,
    ) -> Dict[UUID, Dict[str, Any]]:
        """One batched pass for list/detail enrichment fields (counts, sums, flags).

        When include_plan_actuals is False, plan_sum and actuals_sum are omitted (None) and
        no per-opportunity plan/actuals queries run — used to sort by forecast_sum over large sets.
        """
        if not account_ids:
            return {}

        contact_counts = await self.contact_repo.count_by_accounts(account_ids)
        opp_counts = await self.opportunity_repo.count_by_accounts(account_ids)
        all_opps = await self.opportunity_repo.list_by_account_ids(account_ids)

        opps_by_account: Dict[UUID, List] = defaultdict(list)
        for o in all_opps:
            opps_by_account[o.account_id].append(o)

        all_opp_ids = [o.id for o in all_opps]
        perm_locked_ids: Set[UUID] = await self.perm_lock_repo.list_locked_opportunity_ids_among(all_opp_ids)
        active_quotes_by_opp = await self.quote_repo.map_active_quotes_by_opportunity_ids(all_opp_ids)
        plan_actuals_by_opp: Dict[UUID, dict] = {}
        if include_plan_actuals and all_opp_ids:
            plan_actuals_by_opp = await self.opportunity_service.batch_plan_actuals_for_opportunities(all_opp_ids)

        out: Dict[UUID, Dict[str, Any]] = {}
        for aid in account_ids:
            opps = opps_by_account.get(aid, [])
            forecast_sum = Decimal("0")
            plan_sum = Decimal("0")
            actuals_sum = Decimal("0")
            has_locked_opportunities = False

            for raw in opps:
                forecast_sum += forecast_contribution_from_opportunity_row(raw)

                if include_plan_actuals:
                    pa = plan_actuals_by_opp.get(raw.id) or {}
                    plan_amt = pa.get("plan_amount")
                    if plan_amt is not None and plan_amt != "":
                        try:
                            plan_sum += Decimal(str(plan_amt))
                        except (ValueError, TypeError):
                            pass
                    act_amt = pa.get("actuals_amount")
                    if act_amt is not None and act_amt != "" and str(act_amt) != "0":
                        try:
                            actuals_sum += Decimal(str(act_amt))
                        except (ValueError, TypeError):
                            pass

                if raw.id in perm_locked_ids or raw.id in active_quotes_by_opp:
                    has_locked_opportunities = True

            row: Dict[str, Any] = {
                "contact_count": contact_counts.get(aid, 0),
                "opportunities_count": opp_counts.get(aid, 0),
                "forecast_sum": float(forecast_sum) if forecast_sum and forecast_sum != 0 else None,
                "has_locked_opportunities": has_locked_opportunities,
                "has_active_engagement_today": aid in active_engagement_account_ids,
            }
            if include_plan_actuals:
                row["plan_sum"] = float(plan_sum) if plan_sum and plan_sum != 0 else None
                row["actuals_sum"] = float(actuals_sum) if actuals_sum and actuals_sum != 0 else None
            else:
                row["plan_sum"] = None
                row["actuals_sum"] = None
            out[aid] = row
        return out

    async def _build_enriched_account_row(
        self,
        account: Account,
        active_account_ids: Set[UUID],
    ) -> AccountResponse:
        enrich = await self._batch_compute_list_enrichment([account.id], active_account_ids)
        account_dict = AccountResponse.model_validate(account).model_dump()
        account_dict.update(enrich[account.id])
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
            all_ids = await self.account_repo.list_ids_for_aggregate_window(
                search=search,
                limit=_MAX_ACCOUNTS_FOR_AGGREGATE_SORT,
                **region_kw,
            )

            active_ids = await self.opportunity_repo.account_ids_with_active_engagement_line_on(
                all_ids, date.today()
            )
            # Sorting by forecast only needs opportunity rows + locks; avoid plan/actuals over the full window.
            enrich_for_sort = await self._batch_compute_list_enrichment(
                all_ids,
                active_ids,
                include_plan_actuals=(sort_by != "forecast_sum"),
            )

            reverse = normalize_sort_order(sort_order) == "desc"

            def _agg_sort_key(aid: UUID) -> tuple:
                row = enrich_for_sort.get(aid, {})
                v = row.get(sort_by)
                missing = v is None
                val = float(v) if v is not None else 0.0
                return (1 if missing else 0, val)

            sorted_ids = sorted(all_ids, key=_agg_sort_key, reverse=reverse)
            page_ids = sorted_ids[skip : skip + limit]
            accounts = await self.account_repo.list_by_ids_preserve_order(page_ids)

            active_page_ids = await self.opportunity_repo.account_ids_with_active_engagement_line_on(
                page_ids, date.today()
            )
            if sort_by == "forecast_sum":
                enrich_page = await self._batch_compute_list_enrichment(
                    page_ids, active_page_ids, include_plan_actuals=True
                )
            else:
                enrich_page = {aid: enrich_for_sort[aid] for aid in page_ids if aid in enrich_for_sort}

            responses: List[AccountResponse] = []
            for account in accounts:
                account_dict = AccountResponse.model_validate(account).model_dump()
                account_dict.update(enrich_page[account.id])
                account_dict["msa_original_filename"] = getattr(account, "msa_original_filename", None)
                account_dict["nda_original_filename"] = getattr(account, "nda_original_filename", None)
                account_dict["other_original_filename"] = getattr(account, "other_original_filename", None)
                responses.append(AccountResponse(**account_dict))
            return responses, total

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
        enrich = await self._batch_compute_list_enrichment(ids, active_ids)
        responses: List[AccountResponse] = []
        for account in accounts:
            account_dict = AccountResponse.model_validate(account).model_dump()
            account_dict.update(enrich[account.id])
            account_dict["msa_original_filename"] = getattr(account, "msa_original_filename", None)
            account_dict["nda_original_filename"] = getattr(account, "nda_original_filename", None)
            account_dict["other_original_filename"] = getattr(account, "other_original_filename", None)
            responses.append(AccountResponse(**account_dict))
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
        opps = await self.opportunity_repo.list_by_account_ids([account_id])
        if not opps:
            deleted = await self.account_repo.delete(account_id)
            await self.session.commit()
            return deleted
        opp_ids = [o.id for o in opps]
        perm_locked = await self.perm_lock_repo.list_locked_opportunity_ids_among(opp_ids)
        active_quotes = await self.quote_repo.map_active_quotes_by_opportunity_ids(opp_ids)
        for o in opps:
            if o.id in perm_locked or o.id in active_quotes:
                raise ValueError(
                    "Cannot delete account: it has opportunities that are locked (by active quote) or permanently locked (by timesheets). "
                    "Unlock or remove those opportunities first."
                )
        deleted = await self.account_repo.delete(account_id)
        await self.session.commit()
        return deleted

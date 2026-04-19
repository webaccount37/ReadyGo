"""
Currency rate service with business logic.
"""

from typing import Any, Dict, List, Optional, cast
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories.currency_rate_repository import CurrencyRateRepository
from app.schemas.currency_rate import (
    CurrencyRateCreate,
    CurrencyRateUpdate,
    CurrencyRateResponse,
    CurrencyRatesImportResponse,
)
from app.utils.currency_converter import clear_currency_rates_cache
from app.services.opportunity_service import OpportunityService

OPEN_EXCHANGERATE_API_URL = "https://open.er-api.com/v6/latest/USD"


class CurrencyRateService:
    """Service for currency rate operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.currency_rate_repo = CurrencyRateRepository(session)
    
    async def create_currency_rate(self, currency_rate_data: CurrencyRateCreate) -> CurrencyRateResponse:
        """Create a new currency rate."""
        # Normalize currency code to uppercase
        currency_code = currency_rate_data.currency_code.upper()
        
        # Check if currency rate already exists
        existing = await self.currency_rate_repo.get_by_currency_code(currency_code)
        if existing:
            raise ValueError(f"Currency rate for {currency_code} already exists")
        
        currency_rate = await self.currency_rate_repo.create(
            currency_code=currency_code,
            rate_to_usd=currency_rate_data.rate_to_usd,
        )
        await self.session.commit()
        await self.session.refresh(currency_rate)
        clear_currency_rates_cache()  # Clear cache when rates are updated
        await self._sync_opportunity_forecasts()
        return CurrencyRateResponse.model_validate(currency_rate)
    
    async def get_currency_rate(self, currency_rate_id: UUID) -> Optional[CurrencyRateResponse]:
        """Get currency rate by ID."""
        currency_rate = await self.currency_rate_repo.get(currency_rate_id)
        if not currency_rate:
            return None
        return CurrencyRateResponse.model_validate(currency_rate)
    
    async def get_currency_rate_by_code(self, currency_code: str) -> Optional[CurrencyRateResponse]:
        """Get currency rate by currency code."""
        currency_rate = await self.currency_rate_repo.get_by_currency_code(currency_code)
        if not currency_rate:
            return None
        return CurrencyRateResponse.model_validate(currency_rate)
    
    async def list_currency_rates(
        self,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[List[CurrencyRateResponse], int]:
        """List currency rates with pagination."""
        currency_rates = await self.currency_rate_repo.list(skip=skip, limit=limit)
        total = len(await self.currency_rate_repo.get_all_rates())
        return [CurrencyRateResponse.model_validate(cr) for cr in currency_rates], total
    
    async def update_currency_rate(
        self,
        currency_rate_id: UUID,
        currency_rate_data: CurrencyRateUpdate,
    ) -> Optional[CurrencyRateResponse]:
        """Update a currency rate."""
        currency_rate = await self.currency_rate_repo.get(currency_rate_id)
        if not currency_rate:
            return None
        
        updated = await self.currency_rate_repo.update(
            currency_rate_id,
            rate_to_usd=currency_rate_data.rate_to_usd,
        )
        await self.session.commit()
        await self.session.refresh(updated)
        clear_currency_rates_cache()  # Clear cache when rates are updated
        await self._sync_opportunity_forecasts()
        return CurrencyRateResponse.model_validate(updated)
    
    async def update_currency_rate_by_code(
        self,
        currency_code: str,
        currency_rate_data: CurrencyRateUpdate,
    ) -> Optional[CurrencyRateResponse]:
        """Update a currency rate by currency code."""
        currency_rate = await self.currency_rate_repo.get_by_currency_code(currency_code)
        if not currency_rate:
            return None
        
        updated = await self.currency_rate_repo.update(
            currency_rate.id,
            rate_to_usd=currency_rate_data.rate_to_usd,
        )
        await self.session.commit()
        await self.session.refresh(updated)
        clear_currency_rates_cache()  # Clear cache when rates are updated
        await self._sync_opportunity_forecasts()
        return CurrencyRateResponse.model_validate(updated)
    
    async def delete_currency_rate(self, currency_rate_id: UUID) -> bool:
        """Delete a currency rate."""
        # Prevent deletion of USD rate
        currency_rate = await self.currency_rate_repo.get(currency_rate_id)
        if currency_rate and currency_rate.currency_code.upper() == "USD":
            raise ValueError("Cannot delete USD currency rate (base currency)")
        
        deleted = await self.currency_rate_repo.delete(currency_rate_id)
        await self.session.commit()
        if deleted:
            await self._sync_opportunity_forecasts()
        return deleted

    async def _sync_opportunity_forecasts(self) -> None:
        """Recompute deal_value_usd and forecast_value_usd for all opportunities after rate changes."""
        opp_svc = OpportunityService(self.session)
        await opp_svc.sync_forecast_values_for_all_opportunities()
    
    async def get_all_rates_dict(self) -> dict[str, float]:
        """Get all currency rates as a dictionary for use in currency converter."""
        currency_rates = await self.currency_rate_repo.get_all_rates()
        return {cr.currency_code.upper(): cr.rate_to_usd for cr in currency_rates}

    async def import_rates_from_exchangerate_api(self) -> CurrencyRatesImportResponse:
        """
        Fetch USD-based rates from ExchangeRate-API open endpoint and update existing
        DB rows (except USD). Single commit, cache clear, and forecast sync.
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(OPEN_EXCHANGERATE_API_URL)
            resp.raise_for_status()
            data = cast(Dict[str, Any], resp.json())

        if data.get("result") != "success" or data.get("base_code") != "USD":
            raise ValueError("Invalid response from exchange rate provider")

        raw_rates = data.get("rates")
        if not isinstance(raw_rates, dict):
            raise ValueError("Invalid response from exchange rate provider")

        rates_date = str(data.get("time_last_update_utc") or "")

        computed: dict[str, float] = {}
        for code, value in raw_rates.items():
            key = str(code).upper()
            try:
                rate_val = float(value)
            except (TypeError, ValueError):
                continue
            if rate_val > 0:
                computed[key] = rate_val

        all_rows = await self.currency_rate_repo.get_all_rates()
        updated_codes: List[str] = []
        skipped_not_in_feed: List[str] = []

        for cr in all_rows:
            code = cr.currency_code.upper()
            if code == "USD":
                continue
            if code not in computed:
                skipped_not_in_feed.append(code)
                continue
            new_rate = computed[code]
            if new_rate <= 0:
                skipped_not_in_feed.append(code)
                continue
            await self.currency_rate_repo.update(cr.id, rate_to_usd=new_rate)
            updated_codes.append(code)

        await self.session.commit()
        clear_currency_rates_cache()
        await self._sync_opportunity_forecasts()

        return CurrencyRatesImportResponse(
            rates_date=rates_date,
            updated_codes=sorted(updated_codes),
            skipped_not_in_feed=sorted(skipped_not_in_feed),
        )


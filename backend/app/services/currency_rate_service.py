"""
Currency rate service with business logic.
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories.currency_rate_repository import CurrencyRateRepository
from app.schemas.currency_rate import CurrencyRateCreate, CurrencyRateUpdate, CurrencyRateResponse
from app.models.currency_rate import CurrencyRate
from app.utils.currency_converter import clear_currency_rates_cache


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
        return CurrencyRateResponse.model_validate(updated)
    
    async def delete_currency_rate(self, currency_rate_id: UUID) -> bool:
        """Delete a currency rate."""
        # Prevent deletion of USD rate
        currency_rate = await self.currency_rate_repo.get(currency_rate_id)
        if currency_rate and currency_rate.currency_code.upper() == "USD":
            raise ValueError("Cannot delete USD currency rate (base currency)")
        
        deleted = await self.currency_rate_repo.delete(currency_rate_id)
        await self.session.commit()
        return deleted
    
    async def get_all_rates_dict(self) -> dict[str, float]:
        """Get all currency rates as a dictionary for use in currency converter."""
        currency_rates = await self.currency_rate_repo.get_all_rates()
        return {cr.currency_code.upper(): cr.rate_to_usd for cr in currency_rates}


"""
Currency rate controller.
"""

from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.base_controller import BaseController
from app.services.currency_rate_service import CurrencyRateService
from app.schemas.currency_rate import (
    CurrencyRateCreate,
    CurrencyRateUpdate,
    CurrencyRateResponse,
    CurrencyRateListResponse,
)


class CurrencyRateController(BaseController):
    """Controller for currency rate operations."""
    
    def __init__(self, session: AsyncSession):
        self.currency_rate_service = CurrencyRateService(session)
    
    async def create_currency_rate(self, currency_rate_data: CurrencyRateCreate) -> CurrencyRateResponse:
        """Create a new currency rate."""
        return await self.currency_rate_service.create_currency_rate(currency_rate_data)
    
    async def get_currency_rate(self, currency_rate_id: UUID) -> Optional[CurrencyRateResponse]:
        """Get currency rate by ID."""
        return await self.currency_rate_service.get_currency_rate(currency_rate_id)
    
    async def get_currency_rate_by_code(self, currency_code: str) -> Optional[CurrencyRateResponse]:
        """Get currency rate by currency code."""
        return await self.currency_rate_service.get_currency_rate_by_code(currency_code)
    
    async def list_currency_rates(
        self,
        skip: int = 0,
        limit: int = 100,
    ) -> CurrencyRateListResponse:
        """List currency rates with pagination."""
        currency_rates, total = await self.currency_rate_service.list_currency_rates(
            skip=skip,
            limit=limit,
        )
        return CurrencyRateListResponse(items=currency_rates, total=total)
    
    async def update_currency_rate(
        self,
        currency_rate_id: UUID,
        currency_rate_data: CurrencyRateUpdate,
    ) -> Optional[CurrencyRateResponse]:
        """Update a currency rate."""
        return await self.currency_rate_service.update_currency_rate(
            currency_rate_id,
            currency_rate_data,
        )
    
    async def update_currency_rate_by_code(
        self,
        currency_code: str,
        currency_rate_data: CurrencyRateUpdate,
    ) -> Optional[CurrencyRateResponse]:
        """Update a currency rate by currency code."""
        return await self.currency_rate_service.update_currency_rate_by_code(
            currency_code,
            currency_rate_data,
        )
    
    async def delete_currency_rate(self, currency_rate_id: UUID) -> bool:
        """Delete a currency rate."""
        return await self.currency_rate_service.delete_currency_rate(currency_rate_id)



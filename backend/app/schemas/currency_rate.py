"""
Currency rate Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID


class CurrencyRateBase(BaseModel):
    """Base schema for a currency rate."""
    currency_code: str = Field(..., min_length=3, max_length=3, description="ISO 4217 currency code (e.g., USD, EUR)")
    rate_to_usd: float = Field(..., gt=0, description="Conversion rate: how many units of this currency = 1 USD")


class CurrencyRateCreate(CurrencyRateBase):
    """Create schema for a currency rate."""
    pass


class CurrencyRateUpdate(BaseModel):
    """Update schema for a currency rate."""
    rate_to_usd: float = Field(..., gt=0, description="Conversion rate: how many units of this currency = 1 USD")


class CurrencyRateResponse(CurrencyRateBase):
    """Response schema for a currency rate."""
    id: UUID

    class Config:
        from_attributes = True


class CurrencyRateListResponse(BaseModel):
    """Schema for currency rate list response."""
    items: List[CurrencyRateResponse]
    total: int



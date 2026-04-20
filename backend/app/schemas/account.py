"""
Account Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, List, TYPE_CHECKING
from uuid import UUID
from datetime import datetime

from app.models.account import AccountType

if TYPE_CHECKING:
    from app.schemas.contact import ContactResponse
    from app.schemas.billing_term import BillingTermResponse


class BillingTermInfo(BaseModel):
    """Embedded billing term info for account responses."""
    id: UUID
    code: str
    name: str
    
    class Config:
        from_attributes = True


class AccountBase(BaseModel):
    """Base account schema with common fields."""
    company_name: str = Field(..., min_length=1, max_length=255)
    type: AccountType = Field(..., description="Account type is required")
    industry: Optional[str] = Field(None, max_length=100)
    street_address: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    region: Optional[str] = Field(None, max_length=100)
    country: str = Field(..., min_length=1, max_length=100, description="Country is required")
    default_currency: str = "USD"


class AccountCreate(AccountBase):
    """Schema for creating an account."""
    billing_term_id: Optional[UUID] = Field(None, description="Billing term ID is optional")

    @field_validator("billing_term_id", mode="before")
    @classmethod
    def coerce_empty_billing_term_id(cls, v: object) -> Optional[UUID]:
        """Coerce empty string to None - frontend may send "" when no billing term selected."""
        if v == "" or v is None:
            return None
        return v


class AccountUpdate(BaseModel):
    """Schema for updating an account (all fields optional)."""
    company_name: Optional[str] = Field(None, min_length=1, max_length=255)
    type: Optional[AccountType] = None
    industry: Optional[str] = Field(None, max_length=100)
    street_address: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    region: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, min_length=1, max_length=100)
    billing_term_id: Optional[UUID] = None
    default_currency: Optional[str] = None

    @field_validator("billing_term_id", mode="before")
    @classmethod
    def coerce_empty_billing_term_id(cls, v: object) -> Optional[UUID]:
        """Coerce empty string to None - frontend may send "" when no billing term selected."""
        if v == "" or v is None:
            return None
        return v


class AccountResponse(AccountBase):
    """Schema for account response."""

    model_config = ConfigDict(from_attributes=True, extra="ignore")

    id: UUID
    billing_term_id: Optional[UUID] = None
    billing_term: Optional[BillingTermInfo] = None
    created_at: datetime
    contact_count: Optional[int] = None
    opportunities_count: Optional[int] = None
    forecast_sum: Optional[float] = None  # Sum of opportunities' forecast_value_usd (for list view)
    plan_sum: Optional[float] = None  # Sum of opportunities' plan_amount (for list view)
    actuals_sum: Optional[float] = None  # Sum of opportunities' actuals_amount (for list view)
    has_locked_opportunities: Optional[bool] = None  # True if account has any locked or permanently locked opportunities (disables delete)
    has_active_engagement_today: Optional[bool] = None
    msa_original_filename: Optional[str] = None
    nda_original_filename: Optional[str] = None
    other_original_filename: Optional[str] = None


class AccountWithContactsResponse(AccountResponse):
    """Schema for account response with contacts."""
    contacts: List["ContactResponse"] = []
    
    class Config:
        from_attributes = True


class AccountListResponse(BaseModel):
    """Schema for account list response."""
    items: List[AccountResponse]
    total: int


# Import ContactResponse for forward reference resolution
from app.schemas.contact import ContactResponse
AccountWithContactsResponse.model_rebuild()










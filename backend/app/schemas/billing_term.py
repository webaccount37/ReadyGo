"""
Billing Term Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID


class BillingTermBase(BaseModel):
    """Base billing term schema with common fields."""
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    days_until_due: Optional[int] = Field(None, ge=0)
    is_active: bool = True
    sort_order: int = 0


class BillingTermCreate(BillingTermBase):
    """Schema for creating a billing term."""
    pass


class BillingTermUpdate(BaseModel):
    """Schema for updating a billing term (all fields optional)."""
    code: Optional[str] = Field(None, min_length=1, max_length=50)
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    days_until_due: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class BillingTermResponse(BillingTermBase):
    """Schema for billing term response."""
    id: UUID
    
    class Config:
        from_attributes = True


class BillingTermListResponse(BaseModel):
    """Schema for billing term list response."""
    items: List[BillingTermResponse]
    total: int










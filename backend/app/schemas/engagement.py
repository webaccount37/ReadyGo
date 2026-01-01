"""
Engagement Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date
from uuid import UUID
from decimal import Decimal

from app.models.engagement import EngagementStatus


class EngagementBase(BaseModel):
    """Base engagement schema with common fields."""
    name: str = Field(..., min_length=1, max_length=255)
    opportunity_id: UUID
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    budget: Optional[Decimal] = Field(None, ge=0)
    status: EngagementStatus = EngagementStatus.PLANNING
    billing_term_id: Optional[UUID] = None
    description: Optional[str] = Field(None, max_length=2000)
    default_currency: str = "USD"
    delivery_center_id: Optional[UUID] = None
    attributes: Optional[dict] = None


class EngagementCreate(EngagementBase):
    """Schema for creating an engagement."""
    pass


class EngagementUpdate(BaseModel):
    """Schema for updating an engagement (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    opportunity_id: Optional[UUID] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    budget: Optional[Decimal] = Field(None, ge=0)
    status: Optional[EngagementStatus] = None
    billing_term_id: Optional[UUID] = None
    description: Optional[str] = Field(None, max_length=2000)
    default_currency: Optional[str] = None
    delivery_center_id: Optional[UUID] = None
    attributes: Optional[dict] = None


class EngagementResponse(EngagementBase):
    """Schema for engagement response."""
    id: UUID
    opportunity_name: Optional[str] = None  # Opportunity name from opportunity relationship
    billing_term_name: Optional[str] = None  # Billing term name from billing_term relationship
    delivery_center_name: Optional[str] = None  # Delivery center name from delivery_center relationship
    employees: Optional[List[dict]] = None  # Employees linked to this engagement (when include_relationships=True)
    
    class Config:
        from_attributes = True


class EngagementListResponse(BaseModel):
    """Schema for engagement list response."""
    items: List[EngagementResponse]
    total: int




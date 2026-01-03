"""
Quote Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime
from uuid import UUID
from decimal import Decimal
import enum

from app.models.quote import QuoteStatus


class QuotePhaseBase(BaseModel):
    """Base schema for quote phase."""
    name: str = Field(..., min_length=1, max_length=100)
    start_date: date
    end_date: date
    color: str = Field(default="#3B82F6", pattern=r"^#[0-9A-Fa-f]{6}$", description="Hex color code")
    row_order: int = Field(default=0, ge=0)


class QuotePhaseResponse(QuotePhaseBase):
    """Response schema for quote phase."""
    id: UUID
    quote_id: UUID
    
    class Config:
        from_attributes = True


class QuoteWeeklyHoursBase(BaseModel):
    """Base schema for weekly hours."""
    week_start_date: date
    hours: Decimal = Field(..., ge=0)


class QuoteWeeklyHoursResponse(BaseModel):
    """Response schema for weekly hours."""
    id: UUID
    week_start_date: str  # ISO date string "YYYY-MM-DD"
    hours: Decimal = Field(..., ge=0)
    
    class Config:
        from_attributes = True


class QuoteLineItemResponse(BaseModel):
    """Response schema for quote line item."""
    id: UUID
    quote_id: UUID
    role_rates_id: UUID
    payable_center_id: Optional[UUID] = None
    employee_id: Optional[UUID] = None
    rate: Decimal = Field(..., ge=0)
    cost: Decimal = Field(..., ge=0)
    currency: str = Field(..., min_length=3, max_length=3)
    start_date: str  # ISO date string "YYYY-MM-DD"
    end_date: str  # ISO date string "YYYY-MM-DD"
    row_order: int = Field(default=0, ge=0)
    billable: bool = Field(default=True)
    billable_expense_percentage: Decimal = Field(default=0, ge=0, le=100)
    role_name: Optional[str] = None
    delivery_center_name: Optional[str] = None
    payable_center_name: Optional[str] = None
    employee_name: Optional[str] = None
    weekly_hours: Optional[List[QuoteWeeklyHoursResponse]] = None
    
    class Config:
        from_attributes = True


class QuoteBase(BaseModel):
    """Base quote schema with common fields."""
    engagement_id: UUID
    estimate_id: UUID
    notes: Optional[str] = Field(None, max_length=2000)


class QuoteCreate(QuoteBase):
    """Schema for creating a quote."""
    pass


class QuoteUpdate(BaseModel):
    """Schema for updating a quote (limited fields)."""
    notes: Optional[str] = Field(None, max_length=2000)


class QuoteStatusUpdate(BaseModel):
    """Schema for updating quote status."""
    status: QuoteStatus
    sent_date: Optional[date] = None


class QuoteResponse(QuoteBase):
    """Schema for quote response."""
    id: UUID
    quote_number: str
    version: int
    status: QuoteStatus
    is_active: bool
    created_at: datetime
    created_by: Optional[UUID] = None
    created_by_name: Optional[str] = None
    sent_date: Optional[date] = None
    snapshot_data: Optional[dict] = None
    engagement_name: Optional[str] = None
    estimate_name: Optional[str] = None
    
    class Config:
        from_attributes = True


class QuoteDetailResponse(QuoteResponse):
    """Detailed quote response with all relationships."""
    line_items: List[QuoteLineItemResponse]
    phases: List[QuotePhaseResponse]


class QuoteListResponse(BaseModel):
    """Schema for quote list response."""
    items: List[QuoteResponse]
    total: int


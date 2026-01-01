"""
Quote Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, Field, model_validator, field_serializer
from typing import Optional, List, Dict
from datetime import date
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


class QuotePhaseCreate(QuotePhaseBase):
    """Create schema for quote phase."""
    pass


class QuotePhaseUpdate(BaseModel):
    """Update schema for quote phase (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$", description="Hex color code")
    row_order: Optional[int] = Field(None, ge=0)


class QuotePhaseResponse(QuotePhaseBase):
    """Response schema for quote phase."""
    id: UUID
    quote_id: UUID
    
    class Config:
        from_attributes = True


class AutoFillPattern(str, enum.Enum):
    """Auto-fill pattern types."""
    UNIFORM = "uniform"
    RAMP_UP = "ramp_up"
    RAMP_DOWN = "ramp_down"
    CUSTOM = "custom"


class QuoteWeeklyHoursBase(BaseModel):
    """Base schema for weekly hours."""
    week_start_date: date
    hours: Decimal = Field(..., ge=0)


class QuoteWeeklyHoursCreate(QuoteWeeklyHoursBase):
    """Create schema for weekly hours."""
    pass


class QuoteWeeklyHoursUpdate(BaseModel):
    """Update schema for weekly hours."""
    hours: Optional[Decimal] = Field(None, ge=0)


class QuoteWeeklyHoursResponse(BaseModel):
    """Response schema for weekly hours."""
    # Don't inherit from QuoteWeeklyHoursBase to avoid date parsing issues
    # Use string for week_start_date (already serialized as ISO string)
    id: UUID
    week_start_date: str  # ISO date string "YYYY-MM-DD" (already serialized, no parsing)
    hours: Decimal = Field(..., ge=0)
    
    class Config:
        from_attributes = True


class QuoteLineItemBase(BaseModel):
    """Base schema for quote line item."""
    role_id: UUID
    delivery_center_id: UUID
    employee_id: Optional[UUID] = None
    rate: Decimal = Field(..., ge=0)
    cost: Decimal = Field(..., ge=0)
    currency: str = Field(..., min_length=3, max_length=3)
    start_date: date
    end_date: date
    row_order: int = Field(default=0, ge=0)


class QuoteLineItemCreate(QuoteLineItemBase):
    """Create schema for quote line item."""
    pass


class QuoteLineItemUpdate(BaseModel):
    """Update schema for quote line item (all fields optional)."""
    role_id: Optional[UUID] = None
    delivery_center_id: Optional[UUID] = None
    employee_id: Optional[UUID] = None
    rate: Optional[Decimal] = Field(None, ge=0)
    cost: Optional[Decimal] = Field(None, ge=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    row_order: Optional[int] = Field(None, ge=0)


class QuoteLineItemResponse(BaseModel):
    """Response schema for quote line item."""
    # Don't inherit from QuoteLineItemBase to avoid date parsing issues
    # Define all fields explicitly, using strings for dates (like Release service)
    id: UUID
    quote_id: UUID
    role_id: UUID
    delivery_center_id: UUID
    employee_id: Optional[UUID] = None
    rate: Decimal = Field(..., ge=0)
    cost: Decimal = Field(..., ge=0)
    currency: str = Field(..., min_length=3, max_length=3)
    start_date: str  # ISO date string "YYYY-MM-DD" (already serialized, no parsing)
    end_date: str  # ISO date string "YYYY-MM-DD" (already serialized, no parsing)
    row_order: int = Field(default=0, ge=0)
    role_name: Optional[str] = None
    delivery_center_name: Optional[str] = None
    employee_name: Optional[str] = None
    weekly_hours: Optional[List[QuoteWeeklyHoursResponse]] = None
    
    class Config:
        from_attributes = True


class QuoteBase(BaseModel):
    """Base quote schema with common fields."""
    engagement_id: UUID
    name: str = Field(..., min_length=1, max_length=255)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    status: QuoteStatus = QuoteStatus.DRAFT
    description: Optional[str] = Field(None, max_length=2000)
    attributes: Optional[dict] = None


class QuoteCreate(QuoteBase):
    """Schema for creating a quote."""
    pass


class QuoteUpdate(BaseModel):
    """Schema for updating a quote (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    status: Optional[QuoteStatus] = None
    description: Optional[str] = Field(None, max_length=2000)
    attributes: Optional[dict] = None


class QuoteResponse(QuoteBase):
    """Schema for quote response."""
    id: UUID
    engagement_id: UUID
    engagement_name: Optional[str] = None
    opportunity_id: Optional[UUID] = None
    opportunity_name: Optional[str] = None
    created_by: Optional[UUID] = None
    created_by_name: Optional[str] = None
    line_items: Optional[List[QuoteLineItemResponse]] = None
    phases: Optional[List[QuotePhaseResponse]] = None
    
    class Config:
        from_attributes = True


class QuoteDetailResponse(QuoteResponse):
    """Detailed quote response with all relationships."""
    line_items: List[QuoteLineItemResponse]


class QuoteListResponse(BaseModel):
    """Schema for quote list response."""
    items: List[QuoteResponse]
    total: int


# Auto-fill schemas
class AutoFillRequest(BaseModel):
    """Request schema for auto-filling hours."""
    pattern: str = Field(..., description="Pattern type: uniform, ramp_up, ramp_down, custom")
    hours_per_week: Optional[Decimal] = Field(None, ge=0, description="For uniform pattern")
    start_hours: Optional[Decimal] = Field(None, ge=0, description="For ramp patterns")
    end_hours: Optional[Decimal] = Field(None, ge=0, description="For ramp patterns")
    custom_hours: Optional[Dict[str, Decimal]] = Field(None, description="For custom pattern: {week_start_date: hours}")


# Totals schemas
class WeeklyTotal(BaseModel):
    """Weekly total calculation."""
    week_start_date: date
    total_hours: Decimal
    total_cost: Decimal
    total_revenue: Decimal


class MonthlyTotal(BaseModel):
    """Monthly total calculation."""
    year: int
    month: int
    total_hours: Decimal
    total_cost: Decimal
    total_revenue: Decimal


class RoleTotal(BaseModel):
    """Role total calculation."""
    role_id: UUID
    role_name: str
    total_hours: Decimal
    total_cost: Decimal
    total_revenue: Decimal


class QuoteTotalsResponse(BaseModel):
    """Response schema for quote totals."""
    quote_id: UUID
    weekly_totals: List[WeeklyTotal]
    monthly_totals: List[MonthlyTotal]
    role_totals: List[RoleTotal]
    overall_total_hours: Decimal
    overall_total_cost: Decimal
    overall_total_revenue: Decimal


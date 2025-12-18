"""
Estimate Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, Field, model_validator, field_serializer
from typing import Optional, List, Dict
from datetime import date
from uuid import UUID
from decimal import Decimal
import enum

from app.models.estimate import EstimateStatus


class EstimatePhaseBase(BaseModel):
    """Base schema for estimate phase."""
    name: str = Field(..., min_length=1, max_length=100)
    start_date: date
    end_date: date
    color: str = Field(default="#3B82F6", pattern=r"^#[0-9A-Fa-f]{6}$", description="Hex color code")
    row_order: int = Field(default=0, ge=0)


class EstimatePhaseCreate(EstimatePhaseBase):
    """Create schema for estimate phase."""
    pass


class EstimatePhaseUpdate(BaseModel):
    """Update schema for estimate phase (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$", description="Hex color code")
    row_order: Optional[int] = Field(None, ge=0)


class EstimatePhaseResponse(EstimatePhaseBase):
    """Response schema for estimate phase."""
    id: UUID
    quote_id: UUID  # Keep column name for database compatibility
    
    class Config:
        from_attributes = True


class AutoFillPattern(str, enum.Enum):
    """Auto-fill pattern types."""
    UNIFORM = "uniform"
    RAMP_UP = "ramp_up"
    RAMP_DOWN = "ramp_down"
    CUSTOM = "custom"


class EstimateWeeklyHoursBase(BaseModel):
    """Base schema for weekly hours."""
    week_start_date: date
    hours: Decimal = Field(..., ge=0)


class EstimateWeeklyHoursCreate(EstimateWeeklyHoursBase):
    """Create schema for weekly hours."""
    pass


class EstimateWeeklyHoursUpdate(BaseModel):
    """Update schema for weekly hours."""
    hours: Optional[Decimal] = Field(None, ge=0)


class EstimateWeeklyHoursResponse(BaseModel):
    """Response schema for weekly hours."""
    # Don't inherit from EstimateWeeklyHoursBase to avoid date parsing issues
    # Use string for week_start_date (already serialized as ISO string)
    id: UUID
    week_start_date: str  # ISO date string "YYYY-MM-DD" (already serialized, no parsing)
    hours: Decimal = Field(..., ge=0)
    
    class Config:
        from_attributes = True


class EstimateLineItemBase(BaseModel):
    """Base schema for estimate line item."""
    role_id: UUID
    delivery_center_id: UUID
    employee_id: Optional[UUID] = None
    rate: Decimal = Field(..., ge=0)
    cost: Decimal = Field(..., ge=0)
    currency: str = Field(..., min_length=3, max_length=3)
    start_date: date
    end_date: date
    row_order: int = Field(default=0, ge=0)


class EstimateLineItemCreate(EstimateLineItemBase):
    """Create schema for estimate line item."""
    pass


class EstimateLineItemUpdate(BaseModel):
    """Update schema for estimate line item (all fields optional)."""
    role_id: Optional[UUID] = None
    delivery_center_id: Optional[UUID] = None
    employee_id: Optional[UUID] = None
    rate: Optional[Decimal] = Field(None, ge=0)
    cost: Optional[Decimal] = Field(None, ge=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    row_order: Optional[int] = Field(None, ge=0)


class EstimateLineItemResponse(BaseModel):
    """Response schema for estimate line item."""
    # Don't inherit from EstimateLineItemBase to avoid date parsing issues
    # Define all fields explicitly, using strings for dates (like Release service)
    id: UUID
    quote_id: UUID  # Keep column name for database compatibility
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
    weekly_hours: Optional[List[EstimateWeeklyHoursResponse]] = None
    
    class Config:
        from_attributes = True


class EstimateBase(BaseModel):
    """Base estimate schema with common fields."""
    release_id: UUID
    name: str = Field(..., min_length=1, max_length=255)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    status: EstimateStatus = EstimateStatus.DRAFT
    description: Optional[str] = Field(None, max_length=2000)
    attributes: Optional[dict] = None


class EstimateCreate(EstimateBase):
    """Schema for creating an estimate."""
    pass


class EstimateUpdate(BaseModel):
    """Schema for updating an estimate (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    status: Optional[EstimateStatus] = None
    description: Optional[str] = Field(None, max_length=2000)
    attributes: Optional[dict] = None


class EstimateResponse(EstimateBase):
    """Schema for estimate response."""
    id: UUID
    release_id: UUID
    release_name: Optional[str] = None
    engagement_id: Optional[UUID] = None
    engagement_name: Optional[str] = None
    created_by: Optional[UUID] = None
    created_by_name: Optional[str] = None
    line_items: Optional[List[EstimateLineItemResponse]] = None
    phases: Optional[List[EstimatePhaseResponse]] = None
    
    class Config:
        from_attributes = True


class EstimateDetailResponse(EstimateResponse):
    """Detailed estimate response with all relationships."""
    line_items: List[EstimateLineItemResponse]


class EstimateListResponse(BaseModel):
    """Schema for estimate list response."""
    items: List[EstimateResponse]
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


class EstimateTotalsResponse(BaseModel):
    """Response schema for estimate totals."""
    quote_id: UUID  # Keep column name for database compatibility
    weekly_totals: List[WeeklyTotal]
    monthly_totals: List[MonthlyTotal]
    role_totals: List[RoleTotal]
    overall_total_hours: Decimal
    overall_total_cost: Decimal
    overall_total_revenue: Decimal



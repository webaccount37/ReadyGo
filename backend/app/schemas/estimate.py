"""
Estimate Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, Field, model_validator, field_serializer
from typing import Optional, List, Dict
from datetime import date
from uuid import UUID
from decimal import Decimal
import enum

# EstimateStatus enum removed - status is no longer used


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
    estimate_id: UUID
    
    class Config:
        from_attributes = True


class AutoFillPattern(str, enum.Enum):
    """Auto-fill pattern types."""
    UNIFORM = "uniform"
    RAMP_UP = "ramp_up"
    RAMP_DOWN = "ramp_down"
    RAMP_UP_DOWN = "ramp_up_down"
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
    # Accept either role_rates_id OR role_id + delivery_center_id (for backward compatibility)
    role_rates_id: Optional[UUID] = None
    role_id: Optional[UUID] = None  # For backward compatibility with frontend
    delivery_center_id: Optional[UUID] = None  # Payable Center (reference only, not used for rate calculations)
    payable_center_id: Optional[UUID] = None  # Payable Center (reference only, not used for rate calculations)
    employee_id: Optional[UUID] = None
    rate: Decimal = Field(..., ge=0)
    cost: Decimal = Field(..., ge=0)
    currency: str = Field(..., min_length=3, max_length=3)
    start_date: date
    end_date: date
    row_order: int = Field(default=0, ge=0)
    billable: bool = Field(default=True)
    billable_expense_percentage: Decimal = Field(default=0, ge=0, le=100)  # Billable expense percentage (0-100)
    
    @model_validator(mode="after")
    def validate_role_reference(self) -> "EstimateLineItemBase":
        """Ensure either role_rates_id OR (role_id + delivery_center_id) is provided."""
        if self.role_rates_id:
            return self
        if self.role_id and self.delivery_center_id:
            return self
        raise ValueError("Either role_rates_id OR (role_id + delivery_center_id) must be provided")


class EstimateLineItemCreate(EstimateLineItemBase):
    """Create schema for estimate line item."""
    pass


class EstimateLineItemUpdate(BaseModel):
    """Update schema for estimate line item (all fields optional)."""
    role_rates_id: Optional[UUID] = None
    role_id: Optional[UUID] = None  # For backward compatibility with frontend
    delivery_center_id: Optional[UUID] = None  # Payable Center (reference only, not used for rate calculations)
    payable_center_id: Optional[UUID] = None  # Payable Center (reference only, not used for rate calculations)
    employee_id: Optional[UUID] = None
    rate: Optional[Decimal] = Field(None, ge=0)
    cost: Optional[Decimal] = Field(None, ge=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    row_order: Optional[int] = Field(None, ge=0)
    billable: Optional[bool] = None
    billable_expense_percentage: Optional[Decimal] = Field(None, ge=0, le=100)  # Billable expense percentage (0-100)


class EstimateLineItemResponse(BaseModel):
    """Response schema for estimate line item."""
    # Don't inherit from EstimateLineItemBase to avoid date parsing issues
    # Define all fields explicitly, using strings for dates (like Release service)
    id: UUID
    estimate_id: UUID
    role_rates_id: UUID
    role_id: Optional[UUID] = None  # Included for backward compatibility with frontend
    delivery_center_id: Optional[UUID] = None  # Payable Center (reference only, not used for rate calculations)
    payable_center_id: Optional[UUID] = None  # Payable Center (reference only, not used for rate calculations)
    employee_id: Optional[UUID] = None
    rate: Decimal = Field(..., ge=0)
    cost: Decimal = Field(..., ge=0)
    currency: str = Field(..., min_length=3, max_length=3)
    start_date: str  # ISO date string "YYYY-MM-DD" (already serialized, no parsing)
    end_date: str  # ISO date string "YYYY-MM-DD" (already serialized, no parsing)
    row_order: int = Field(default=0, ge=0)
    billable: bool = Field(default=True)
    billable_expense_percentage: Decimal = Field(default=0, ge=0, le=100)  # Billable expense percentage (0-100)
    role_name: Optional[str] = None
    delivery_center_name: Optional[str] = None
    payable_center_name: Optional[str] = None  # Payable Center name
    employee_name: Optional[str] = None
    weekly_hours: Optional[List[EstimateWeeklyHoursResponse]] = None
    
    class Config:
        from_attributes = True


class EstimateBase(BaseModel):
    """Base estimate schema with common fields."""
    engagement_id: UUID
    name: Optional[str] = Field(None, min_length=0, max_length=255)  # Allow empty for auto-generation
    description: Optional[str] = Field(None, max_length=2000)
    active_version: bool = Field(default=False)
    attributes: Optional[dict] = None


class EstimateCreate(BaseModel):
    """Schema for creating an estimate."""
    engagement_id: UUID
    name: Optional[str] = Field(None, min_length=0, max_length=255)  # Optional for auto-generation
    description: Optional[str] = Field(None, max_length=2000)
    active_version: Optional[bool] = Field(default=False)
    attributes: Optional[dict] = None


class EstimateUpdate(BaseModel):
    """Schema for updating an estimate (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    active_version: Optional[bool] = None
    attributes: Optional[dict] = None


class EstimateResponse(EstimateBase):
    """Schema for estimate response."""
    id: UUID
    engagement_id: UUID
    engagement_name: Optional[str] = None
    opportunity_id: Optional[UUID] = None
    opportunity_name: Optional[str] = None
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
    interval_hours: Optional[Decimal] = Field(None, ge=0, description="For ramp patterns: hours to increment/decrement per week")
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
    estimate_id: UUID
    weekly_totals: List[WeeklyTotal]
    monthly_totals: List[MonthlyTotal]
    role_totals: List[RoleTotal]
    overall_total_hours: Decimal
    overall_total_cost: Decimal
    overall_total_revenue: Decimal


class EstimateExcelImportResponse(BaseModel):
    """Response schema for Excel import."""
    created: int
    updated: int
    deleted: int = 0
    errors: List[str] = []



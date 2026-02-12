"""
Engagement Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, Field, model_validator
from typing import Optional, List, Dict
from datetime import date
from uuid import UUID
from decimal import Decimal
import enum


class EngagementPhaseBase(BaseModel):
    """Base schema for engagement phase."""
    name: str = Field(..., min_length=1, max_length=100)
    start_date: date
    end_date: date
    color: str = Field(default="#3B82F6", pattern=r"^#[0-9A-Fa-f]{6}$", description="Hex color code")
    row_order: int = Field(default=0, ge=0)


class EngagementPhaseCreate(EngagementPhaseBase):
    """Create schema for engagement phase."""
    pass


class EngagementPhaseUpdate(BaseModel):
    """Update schema for engagement phase (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$", description="Hex color code")
    row_order: Optional[int] = Field(None, ge=0)


class EngagementPhaseResponse(EngagementPhaseBase):
    """Response schema for engagement phase."""
    id: UUID
    engagement_id: UUID
    
    class Config:
        from_attributes = True


class EngagementWeeklyHoursBase(BaseModel):
    """Base schema for weekly hours."""
    week_start_date: date
    hours: Decimal = Field(..., ge=0)


class EngagementWeeklyHoursCreate(EngagementWeeklyHoursBase):
    """Create schema for weekly hours."""
    pass


class EngagementWeeklyHoursUpdate(BaseModel):
    """Update schema for weekly hours."""
    hours: Optional[Decimal] = Field(None, ge=0)


class EngagementWeeklyHoursResponse(BaseModel):
    """Response schema for weekly hours."""
    id: UUID
    week_start_date: str  # ISO date string "YYYY-MM-DD"
    hours: Decimal = Field(..., ge=0)
    
    class Config:
        from_attributes = True


class EngagementLineItemBase(BaseModel):
    """Base schema for engagement line item."""
    role_rates_id: Optional[UUID] = None
    role_id: Optional[UUID] = None  # For backward compatibility with frontend
    delivery_center_id: Optional[UUID] = None  # Payable Center (reference only)
    payable_center_id: Optional[UUID] = None  # Payable Center (reference only)
    employee_id: Optional[UUID] = None
    rate: Decimal = Field(..., ge=0)
    cost: Decimal = Field(..., ge=0)
    currency: str = Field(..., min_length=3, max_length=3)
    start_date: date  # Can be any date (not tied to Opportunity)
    end_date: date  # Can be any date (not tied to Opportunity)
    row_order: int = Field(default=0, ge=0)
    billable: bool = Field(default=True)
    billable_expense_percentage: Decimal = Field(default=0, ge=0, le=100)
    
    @model_validator(mode="after")
    def validate_role_reference(self) -> "EngagementLineItemBase":
        """Ensure either role_rates_id OR (role_id + delivery_center_id) is provided."""
        if self.role_rates_id:
            return self
        if self.role_id and self.delivery_center_id:
            return self
        raise ValueError("Either role_rates_id OR (role_id + delivery_center_id) must be provided")


class EngagementLineItemCreate(EngagementLineItemBase):
    """Create schema for engagement line item."""
    pass


class EngagementLineItemUpdate(BaseModel):
    """Update schema for engagement line item (all fields optional)."""
    role_rates_id: Optional[UUID] = None
    role_id: Optional[UUID] = None
    delivery_center_id: Optional[UUID] = None
    payable_center_id: Optional[UUID] = None
    employee_id: Optional[UUID] = None
    rate: Optional[Decimal] = Field(None, ge=0)
    cost: Optional[Decimal] = Field(None, ge=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    row_order: Optional[int] = Field(None, ge=0)
    billable: Optional[bool] = None
    billable_expense_percentage: Optional[Decimal] = Field(None, ge=0, le=100)


class EngagementLineItemResponse(BaseModel):
    """Response schema for engagement line item."""
    id: UUID
    engagement_id: UUID
    role_rates_id: UUID
    role_id: Optional[UUID] = None
    delivery_center_id: Optional[UUID] = None
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
    weekly_hours: Optional[List[EngagementWeeklyHoursResponse]] = None
    
    class Config:
        from_attributes = True


class EngagementBase(BaseModel):
    """Base engagement schema with common fields."""
    quote_id: UUID
    opportunity_id: UUID
    name: Optional[str] = Field(None, min_length=0, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    attributes: Optional[dict] = None


class EngagementCreate(BaseModel):
    """Schema for creating an engagement."""
    quote_id: UUID
    opportunity_id: UUID
    name: Optional[str] = Field(None, min_length=0, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    attributes: Optional[dict] = None


class EngagementUpdate(BaseModel):
    """Schema for updating an engagement (limited fields)."""
    description: Optional[str] = Field(None, max_length=2000)
    attributes: Optional[dict] = None


class EngagementResponse(EngagementBase):
    """Schema for engagement response."""
    id: UUID
    quote_id: UUID
    opportunity_id: UUID
    opportunity_name: Optional[str] = None
    account_name: Optional[str] = None
    quote_number: Optional[str] = None
    quote_display_name: Optional[str] = None
    created_by: Optional[UUID] = None
    created_by_name: Optional[str] = None
    created_at: str  # ISO datetime string
    line_items: Optional[List[EngagementLineItemResponse]] = None
    phases: Optional[List[EngagementPhaseResponse]] = None
    
    class Config:
        from_attributes = True


class ComparativeSummary(BaseModel):
    """Comparative summary between Quote/Estimate and Resource Plan."""
    # Quote/Estimate values (from the contract)
    quote_amount: Optional[Decimal] = None
    estimate_cost: Optional[Decimal] = None
    estimate_revenue: Optional[Decimal] = None
    estimate_margin_amount: Optional[Decimal] = None
    estimate_margin_percentage: Optional[Decimal] = None
    
    # Resource Plan values (current budget)
    resource_plan_revenue: Optional[Decimal] = None
    resource_plan_cost: Optional[Decimal] = None
    resource_plan_margin_amount: Optional[Decimal] = None
    resource_plan_margin_percentage: Optional[Decimal] = None
    
    # Deviations
    revenue_deviation: Optional[Decimal] = None  # Resource Plan Revenue - Quote Amount
    revenue_deviation_percentage: Optional[Decimal] = None  # (Revenue Deviation / Quote Amount) * 100
    margin_deviation: Optional[Decimal] = None  # Resource Plan Margin % - Estimate Margin %
    
    # Currency
    currency: str = "USD"


class EngagementDetailResponse(EngagementResponse):
    """Detailed engagement response with all relationships and comparative summary."""
    line_items: List[EngagementLineItemResponse]
    comparative_summary: Optional[ComparativeSummary] = None


class EngagementListResponse(BaseModel):
    """Schema for engagement list response."""
    items: List[EngagementResponse]
    total: int


class AutoFillPattern(str, enum.Enum):
    """Auto-fill pattern types."""
    UNIFORM = "uniform"
    RAMP_UP = "ramp_up"
    RAMP_DOWN = "ramp_down"
    RAMP_UP_DOWN = "ramp_up_down"
    CUSTOM = "custom"


class AutoFillRequest(BaseModel):
    """Request schema for auto-filling hours."""
    pattern: str = Field(..., description="Pattern type: uniform, ramp_up, ramp_down, custom")
    hours_per_week: Optional[Decimal] = Field(None, ge=0, description="For uniform pattern")
    start_hours: Optional[Decimal] = Field(None, ge=0, description="For ramp patterns")
    end_hours: Optional[Decimal] = Field(None, ge=0, description="For ramp patterns")
    interval_hours: Optional[Decimal] = Field(None, ge=0, description="For ramp patterns: hours to increment/decrement per week")
    custom_hours: Optional[Dict[str, Decimal]] = Field(None, description="For custom pattern: {week_start_date: hours}")


class EngagementExcelImportResponse(BaseModel):
    """Response schema for Excel import."""
    created: int
    updated: int
    deleted: int = 0
    errors: List[str] = []

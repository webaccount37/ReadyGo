"""
Opportunity Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, Field, model_validator
from typing import Optional, List
from datetime import date
from uuid import UUID

from app.models.opportunity import (
    OpportunityStatus, 
    WinProbability, 
    Accountability, 
    StrategicImportance
)
from decimal import Decimal


class OpportunityBase(BaseModel):
    """Base opportunity schema with common fields."""
    name: str = Field(..., min_length=1, max_length=255)
    parent_opportunity_id: Optional[UUID] = None
    account_id: UUID
    start_date: date
    end_date: date
    status: OpportunityStatus = OpportunityStatus.QUALIFIED
    billing_term_id: UUID
    description: Optional[str] = Field(None, max_length=2000)
    utilization: Optional[float] = Field(None, ge=0, le=100)
    margin: Optional[float] = Field(None, ge=-100, le=100)
    default_currency: str = "USD"
    delivery_center_id: UUID
    opportunity_owner_id: Optional[UUID] = None
    invoice_customer: bool = True
    billable_expenses: bool = True
    attributes: Optional[dict] = None
    
    # New deal/forecast fields
    probability: Optional[float] = None  # Read-only, calculated from status
    win_probability: Optional[WinProbability] = None
    accountability: Optional[Accountability] = None
    strategic_importance: Optional[StrategicImportance] = None
    deal_creation_date: Optional[date] = None  # Read-only, set on creation
    deal_value: Optional[Decimal] = None  # Generic currency field
    deal_value_usd: Optional[Decimal] = None  # Calculated field
    close_date: Optional[date] = None  # Read-only, set when status is Won/Lost/Cancelled
    deal_length: Optional[int] = None  # Calculated in days
    forecast_value: Optional[Decimal] = None  # Calculated: probability * deal_value
    forecast_value_usd: Optional[Decimal] = None  # Calculated: probability * deal_value_usd


class OpportunityCreate(OpportunityBase):
    """Schema for creating an opportunity."""
    
    @model_validator(mode='before')
    def normalize_enum_values(cls, data):
        """Normalize enum values to lowercase strings before validation."""
        if isinstance(data, dict):
            # Normalize win_probability
            if 'win_probability' in data and isinstance(data['win_probability'], str):
                data['win_probability'] = data['win_probability'].lower()
            # Normalize accountability
            if 'accountability' in data and isinstance(data['accountability'], str):
                data['accountability'] = data['accountability'].lower()
            # Normalize strategic_importance
            if 'strategic_importance' in data and isinstance(data['strategic_importance'], str):
                data['strategic_importance'] = data['strategic_importance'].lower()
        return data
    
    @model_validator(mode='after')
    def validate_dates(self):
        """Validate that end_date is after start_date when both are provided."""
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError('End date must be after start date')
        return self


class OpportunityUpdate(BaseModel):
    """Schema for updating an opportunity (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    parent_opportunity_id: Optional[UUID] = None
    account_id: Optional[UUID] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None  # Note: Required on create, but optional on update to allow partial updates
    status: Optional[OpportunityStatus] = None
    billing_term_id: Optional[UUID] = None
    description: Optional[str] = Field(None, max_length=2000)
    utilization: Optional[float] = Field(None, ge=0, le=100)
    margin: Optional[float] = Field(None, ge=-100, le=100)
    default_currency: Optional[str] = None
    delivery_center_id: Optional[UUID] = None
    opportunity_owner_id: Optional[UUID] = None
    invoice_customer: Optional[bool] = None
    billable_expenses: Optional[bool] = None
    attributes: Optional[dict] = None
    
    # New deal/forecast fields (most are read-only, but allow updates for editable ones)
    accountability: Optional[Accountability] = None
    strategic_importance: Optional[StrategicImportance] = None
    deal_value: Optional[Decimal] = None  # Editable
    # Note: probability, deal_value_usd, close_date, deal_length, forecast_value, 
    # forecast_value_usd, deal_creation_date are read-only and calculated
    
    @model_validator(mode='before')
    def normalize_enum_values(cls, data):
        """Normalize enum values to lowercase strings before validation."""
        if isinstance(data, dict):
            # Normalize win_probability
            if 'win_probability' in data and isinstance(data['win_probability'], str):
                data['win_probability'] = data['win_probability'].lower()
            # Normalize accountability
            if 'accountability' in data and isinstance(data['accountability'], str):
                data['accountability'] = data['accountability'].lower()
            # Normalize strategic_importance
            if 'strategic_importance' in data and isinstance(data['strategic_importance'], str):
                data['strategic_importance'] = data['strategic_importance'].lower()
        return data
    
    @model_validator(mode='after')
    def validate_dates(self):
        """Validate that end_date is after start_date when both are provided."""
        if self.end_date is not None and self.start_date is not None:
            if self.end_date < self.start_date:
                raise ValueError('End date must be after start date')
        return self


class OpportunityResponse(OpportunityBase):
    """Schema for opportunity response."""
    id: UUID
    account_name: Optional[str] = None  # Company name from account relationship
    employees: Optional[List[dict]] = None  # Employees from active estimates
    is_locked: Optional[bool] = None  # Computed: whether opportunity is locked by an active quote
    locked_by_quote_id: Optional[UUID] = None  # ID of quote locking this opportunity if exists
    is_permanently_locked: Optional[bool] = None  # Computed: locked due to timesheet entries (cannot be undone)
    
    class Config:
        from_attributes = True


class OpportunityListResponse(BaseModel):
    """Schema for opportunity list response."""
    items: List[OpportunityResponse]
    total: int


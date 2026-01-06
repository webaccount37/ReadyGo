"""
Employee Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from typing import Optional, List
from datetime import date
from uuid import UUID

from app.models.employee import EmployeeType, EmployeeStatus


class EmployeeBase(BaseModel):
    """Base employee schema with common fields."""
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    employee_type: EmployeeType = Field(...)
    status: EmployeeStatus = Field(...)
    role_title: Optional[str] = Field(None, max_length=100)
    role_id: Optional[UUID] = None
    skills: Optional[List[str]] = None
    internal_cost_rate: float = Field(..., ge=0)
    internal_bill_rate: float = Field(..., ge=0)
    external_bill_rate: float = Field(..., ge=0)
    start_date: date = Field(...)
    end_date: Optional[date] = None
    availability_calendar_id: Optional[UUID] = None
    billable: bool = True
    default_currency: Optional[str] = Field(None, max_length=3)
    timezone: str = "UTC"
    delivery_center: Optional[str] = Field(None, description="Delivery center code")

    @model_validator(mode='after')
    def validate_dates(self) -> 'EmployeeBase':
        """Validate that end_date is after start_date if provided."""
        if self.end_date is not None and self.end_date <= self.start_date:
            raise ValueError('End date must be after start date')
        return self


class EmployeeCreate(EmployeeBase):
    """Schema for creating an employee."""
    delivery_center: str = Field(..., description="Delivery center code")


class EmployeeUpdate(BaseModel):
    """Schema for updating an employee (all fields optional)."""
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    employee_type: Optional[EmployeeType] = None
    status: Optional[EmployeeStatus] = None
    role_title: Optional[str] = Field(None, max_length=100)
    role_id: Optional[UUID] = None
    skills: Optional[List[str]] = None
    internal_cost_rate: Optional[float] = Field(None, ge=0)
    internal_bill_rate: Optional[float] = Field(None, ge=0)
    external_bill_rate: Optional[float] = Field(None, ge=0)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    availability_calendar_id: Optional[UUID] = None
    billable: Optional[bool] = None
    default_currency: Optional[str] = Field(None, max_length=3)
    timezone: Optional[str] = None
    delivery_center: Optional[str] = Field(None, description="Delivery center code")

    @model_validator(mode='after')
    def validate_dates(self) -> 'EmployeeUpdate':
        """Validate that end_date is after start_date if both are provided in the update."""
        if self.start_date is not None and self.end_date is not None:
            if self.end_date <= self.start_date:
                raise ValueError('End date must be after start date')
        return self


class OpportunityReference(BaseModel):
    """Opportunity reference with association fields from estimate line items."""
    id: UUID
    name: str
    role_id: Optional[UUID] = None
    role_name: Optional[str] = None
    start_date: Optional[str] = None  # ISO date string
    end_date: Optional[str] = None  # ISO date string
    project_rate: Optional[float] = None
    delivery_center: Optional[str] = None
    
    class Config:
        from_attributes = True


class EmployeeResponse(EmployeeBase):
    """Schema for employee response."""
    id: UUID
    opportunities: Optional[List[OpportunityReference]] = None
    
    class Config:
        from_attributes = True


class EmployeeListResponse(BaseModel):
    """Schema for employee list response."""
    items: List[EmployeeResponse]
    total: int



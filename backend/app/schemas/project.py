"""
Project Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, Field, model_validator
from typing import Optional, List
from datetime import date
from uuid import UUID

from app.models.project import ProjectStatus, ProjectType


class ProjectBase(BaseModel):
    """Base project schema with common fields."""
    name: str = Field(..., min_length=1, max_length=255)
    parent_project_id: Optional[UUID] = None
    client_id: UUID
    start_date: date
    end_date: date
    status: ProjectStatus = ProjectStatus.PLANNING
    billing_term_id: UUID
    project_type: ProjectType = ProjectType.IMPLEMENTATION
    description: Optional[str] = Field(None, max_length=2000)
    utilization: Optional[float] = Field(None, ge=0, le=100)
    margin: Optional[float] = Field(None, ge=-100, le=100)
    default_currency: str = "USD"
    delivery_center_id: UUID
    opportunity_owner_id: Optional[UUID] = None
    invoice_customer: bool = True
    billable_expenses: bool = True
    attributes: Optional[dict] = None


class ProjectCreate(ProjectBase):
    """Schema for creating a project."""
    
    @model_validator(mode='after')
    def validate_dates(self):
        """Validate that end_date is after start_date."""
        if self.end_date < self.start_date:
            raise ValueError('End date must be after start date')
        return self


class ProjectUpdate(BaseModel):
    """Schema for updating a project (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    parent_project_id: Optional[UUID] = None
    client_id: Optional[UUID] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[ProjectStatus] = None
    billing_term_id: Optional[UUID] = None
    project_type: Optional[ProjectType] = None
    description: Optional[str] = Field(None, max_length=2000)
    utilization: Optional[float] = Field(None, ge=0, le=100)
    margin: Optional[float] = Field(None, ge=-100, le=100)
    default_currency: Optional[str] = None
    delivery_center_id: Optional[UUID] = None
    opportunity_owner_id: Optional[UUID] = None
    invoice_customer: Optional[bool] = None
    billable_expenses: Optional[bool] = None
    attributes: Optional[dict] = None
    
    @model_validator(mode='after')
    def validate_dates(self):
        """Validate that end_date is after start_date when both are provided."""
        if self.end_date is not None and self.start_date is not None:
            if self.end_date < self.start_date:
                raise ValueError('End date must be after start date')
        return self


class ProjectResponse(ProjectBase):
    """Schema for project response."""
    id: UUID
    client_name: Optional[str] = None  # Company name from client relationship
    
    class Config:
        from_attributes = True


class ProjectListResponse(BaseModel):
    """Schema for project list response."""
    items: List[ProjectResponse]
    total: int




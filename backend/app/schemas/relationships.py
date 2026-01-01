"""
Schemas for relationship management (linking/unlinking entities).
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date
from uuid import UUID

# Delivery center is now a string code that will be looked up


class ReleaseLinkData(BaseModel):
    """Data for linking an employee to a release."""
    release_id: UUID
    role_id: UUID = Field(..., description="Role ID (foreign key)")
    start_date: date = Field(..., description="Start date for the association")
    end_date: date = Field(..., description="End date for the association")
    project_rate: float = Field(..., ge=0, description="Project rate")
    delivery_center: str = Field(..., description="Delivery center code (e.g., 'north-america')")


class LinkEmployeeToOpportunityRequest(BaseModel):
    """Request schema for linking an employee to an opportunity with releases."""
    releases: List[ReleaseLinkData] = Field(..., min_length=1, description="At least one release with fields is required")


class LinkEmployeeToReleaseRequest(BaseModel):
    """Request schema for linking an employee to a release with required fields."""
    role_id: UUID = Field(..., description="Role ID (foreign key)")
    start_date: date = Field(..., description="Start date for the association")
    end_date: date = Field(..., description="End date for the association")
    project_rate: float = Field(..., ge=0, description="Project rate")
    delivery_center: str = Field(..., description="Delivery center code (e.g., 'north-america')")


class LinkEmployeesToOpportunityRequest(BaseModel):
    """Request schema for linking multiple employees to an opportunity."""
    employee_ids: List[UUID]
    releases: List[ReleaseLinkData] = Field(..., min_length=1, description="At least one release with fields is required")


class LinkEmployeesToReleaseRequest(BaseModel):
    """Request schema for linking multiple employees to a release."""
    employee_ids: List[UUID]
    role_id: UUID = Field(..., description="Role ID (foreign key)")
    start_date: date = Field(..., description="Start date for the association")
    end_date: date = Field(..., description="End date for the association")
    project_rate: float = Field(..., ge=0, description="Project rate")
    delivery_center: str = Field(..., description="Delivery center code (e.g., 'north-america')")


class LinkRolesToOpportunityRequest(BaseModel):
    """Request schema for linking roles to an opportunity."""
    role_ids: List[UUID]


class LinkRolesToReleaseRequest(BaseModel):
    """Request schema for linking roles to a release."""
    role_ids: List[UUID]


class UnlinkRequest(BaseModel):
    """Request schema for unlinking entities."""
    ids: List[UUID]


class OpportunityAssociationResponse(BaseModel):
    """Response schema for opportunity association with additional fields."""
    opportunity_id: UUID
    opportunity_name: str
    role_id: UUID
    role_name: str
    start_date: date
    end_date: date
    project_rate: float
    delivery_center: str
    
    class Config:
        from_attributes = True


class ReleaseAssociationResponse(BaseModel):
    """Response schema for release association with additional fields."""
    release_id: UUID
    release_name: str
    role_id: UUID
    role_name: str
    start_date: date
    end_date: date
    project_rate: float
    delivery_center: str
    
    class Config:
        from_attributes = True

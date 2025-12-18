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


class LinkEmployeeToEngagementRequest(BaseModel):
    """Request schema for linking an employee to an engagement with releases."""
    releases: List[ReleaseLinkData] = Field(..., min_length=1, description="At least one release with fields is required")


class LinkEmployeeToReleaseRequest(BaseModel):
    """Request schema for linking an employee to a release with required fields."""
    role_id: UUID = Field(..., description="Role ID (foreign key)")
    start_date: date = Field(..., description="Start date for the association")
    end_date: date = Field(..., description="End date for the association")
    project_rate: float = Field(..., ge=0, description="Project rate")
    delivery_center: str = Field(..., description="Delivery center code (e.g., 'north-america')")


class LinkEmployeesToEngagementRequest(BaseModel):
    """Request schema for linking multiple employees to an engagement."""
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


class LinkRolesToEngagementRequest(BaseModel):
    """Request schema for linking roles to an engagement."""
    role_ids: List[UUID]


class LinkRolesToReleaseRequest(BaseModel):
    """Request schema for linking roles to a release."""
    role_ids: List[UUID]


class UnlinkRequest(BaseModel):
    """Request schema for unlinking entities."""
    ids: List[UUID]


class EngagementAssociationResponse(BaseModel):
    """Response schema for engagement association with additional fields."""
    engagement_id: UUID
    engagement_name: str
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

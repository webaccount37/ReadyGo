"""
Schemas for relationship management (linking/unlinking entities).
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date
from uuid import UUID

# Delivery center is now a string code that will be looked up


class LinkEmployeeToOpportunityRequest(BaseModel):
    """Request schema for linking an employee to an opportunity."""
    role_id: UUID = Field(..., description="Role ID (foreign key)")
    start_date: date = Field(..., description="Start date for the association")
    end_date: date = Field(..., description="End date for the association")
    project_rate: float = Field(..., ge=0, description="Project rate")
    project_cost: Optional[float] = Field(None, ge=0, description="Project cost (optional, auto-filled from role or employee)")
    delivery_center: str = Field(..., description="Payable Center code (e.g., 'north-america') - reference only, not used for rate calculations")


class LinkEmployeesToOpportunityRequest(BaseModel):
    """Request schema for linking multiple employees to an opportunity."""
    employee_ids: List[UUID]
    role_id: UUID = Field(..., description="Role ID (foreign key)")
    start_date: date = Field(..., description="Start date for the association")
    end_date: date = Field(..., description="End date for the association")
    project_rate: float = Field(..., ge=0, description="Project rate")
    project_cost: Optional[float] = Field(None, ge=0, description="Project cost (optional, auto-filled from role or employee)")
    delivery_center: str = Field(..., description="Payable Center code (e.g., 'north-america') - reference only, not used for rate calculations")


class LinkRolesToOpportunityRequest(BaseModel):
    """Request schema for linking roles to an opportunity."""
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



"""
Delivery Center Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional
from uuid import UUID


class DeliveryCenterBase(BaseModel):
    """Base delivery center schema with common fields."""
    name: str = Field(..., min_length=1, max_length=50)
    code: str = Field(..., min_length=1, max_length=50)
    country_code: Optional[str] = Field(None, min_length=2, max_length=2)
    default_currency: str = Field(default="USD", min_length=3, max_length=3)


class DeliveryCenterCreate(DeliveryCenterBase):
    """Schema for creating a delivery center."""
    pass


class DeliveryCenterUpdate(BaseModel):
    """Schema for updating a delivery center."""
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    code: Optional[str] = Field(None, min_length=1, max_length=50)
    country_code: Optional[str] = Field(None, min_length=2, max_length=2)
    default_currency: Optional[str] = Field(None, min_length=3, max_length=3)


class EmployeeApproverSummary(BaseModel):
    """Summary schema for employee approver."""
    id: UUID
    first_name: str
    last_name: str
    email: str
    
    class Config:
        from_attributes = True


class DeliveryCenterApproverResponse(BaseModel):
    """Schema for delivery center approver response."""
    delivery_center_id: UUID
    employee_id: UUID
    employee: EmployeeApproverSummary
    
    class Config:
        from_attributes = True


class DeliveryCenterResponse(DeliveryCenterBase):
    """Schema for delivery center response."""
    model_config = ConfigDict(from_attributes=False)

    id: UUID
    approvers: Optional[List[EmployeeApproverSummary]] = None
    opportunities_count: int = 0
    employees_count: int = 0


class DeliveryCenterListResponse(BaseModel):
    """Schema for delivery center list response."""
    items: List[DeliveryCenterResponse]
    total: int


class DeliveryCenterApproverCreate(BaseModel):
    """Schema for creating a delivery center approver."""
    employee_id: UUID


class DeliveryCenterApproverListResponse(BaseModel):
    """Schema for delivery center approver list response."""
    items: List[DeliveryCenterApproverResponse]
    total: int










"""
Delivery Center Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, Field
from typing import List
from uuid import UUID


class DeliveryCenterBase(BaseModel):
    """Base delivery center schema with common fields."""
    name: str = Field(..., min_length=1, max_length=50)
    code: str = Field(..., min_length=1, max_length=50)


class DeliveryCenterResponse(DeliveryCenterBase):
    """Schema for delivery center response."""
    id: UUID
    
    class Config:
        from_attributes = True


class DeliveryCenterListResponse(BaseModel):
    """Schema for delivery center list response."""
    items: List[DeliveryCenterResponse]
    total: int








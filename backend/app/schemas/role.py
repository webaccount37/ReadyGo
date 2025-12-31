"""
Role Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, Field, model_validator
from typing import Optional, List
from uuid import UUID

from app.models.role import RoleStatus


class RoleRateBase(BaseModel):
    """Base schema for a role rate tied to delivery center + currency."""
    delivery_center_code: str = Field(..., min_length=1, max_length=50)
    default_currency: str = Field(..., min_length=1, max_length=3)
    internal_cost_rate: float = Field(..., ge=0)
    external_rate: float = Field(..., ge=0)


class RoleRateCreate(RoleRateBase):
    """Create schema for a role rate."""
    pass


class RoleRateResponse(RoleRateBase):
    """Response schema for a role rate."""
    id: UUID
    delivery_center_id: Optional[UUID] = None

    class Config:
        from_attributes = True

    @model_validator(mode="after")
    def fill_delivery_center_code(self) -> "RoleRateResponse":
        if not self.delivery_center_code and hasattr(self, "delivery_center"):
            dc = getattr(self, "delivery_center")
            code = getattr(dc, "code", None)
            if code:
                object.__setattr__(self, "delivery_center_code", code)
        return self


class RoleBase(BaseModel):
    """Base role schema with common fields."""
    role_name: str = Field(..., min_length=1, max_length=100)
    status: RoleStatus = RoleStatus.ACTIVE
    role_rates: List[RoleRateCreate] = Field(..., min_length=1)

    @model_validator(mode="after")
    def ensure_rates_present(self) -> "RoleBase":
        if not self.role_rates or len(self.role_rates) == 0:
            raise ValueError("At least one delivery center rate is required.")
        return self


class RoleCreate(RoleBase):
    """Schema for creating a role."""
    pass


class RoleUpdate(BaseModel):
    """Schema for updating a role."""
    role_name: Optional[str] = Field(None, min_length=1, max_length=100)
    status: Optional[RoleStatus] = None
    role_rates: Optional[List[RoleRateCreate]] = Field(None, min_length=1)


class RoleResponse(RoleBase):
    """Schema for role response."""
    id: UUID
    role_rates: List[RoleRateResponse]
    
    class Config:
        from_attributes = True


class RoleListResponse(BaseModel):
    """Schema for role list response."""
    items: List[RoleResponse]
    total: int




"""
Client Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, TYPE_CHECKING
from uuid import UUID

from app.models.client import ClientStatus

if TYPE_CHECKING:
    from app.schemas.contact import ContactResponse
    from app.schemas.billing_term import BillingTermResponse


class BillingTermInfo(BaseModel):
    """Embedded billing term info for client responses."""
    id: UUID
    code: str
    name: str
    
    class Config:
        from_attributes = True


class ClientBase(BaseModel):
    """Base client schema with common fields."""
    company_name: str = Field(..., min_length=1, max_length=255)
    industry: Optional[str] = Field(None, max_length=100)
    street_address: str = Field(..., min_length=1, max_length=255, description="Street address is required")
    city: str = Field(..., min_length=1, max_length=100, description="City is required")
    region: str = Field(..., min_length=1, max_length=100, description="Region is required")
    country: str = Field(..., min_length=1, max_length=100, description="Country is required")
    status: ClientStatus = ClientStatus.ACTIVE
    default_currency: str = "USD"


class ClientCreate(ClientBase):
    """Schema for creating a client."""
    billing_term_id: UUID = Field(..., description="Billing term ID is required")


class ClientUpdate(BaseModel):
    """Schema for updating a client (all fields optional)."""
    company_name: Optional[str] = Field(None, min_length=1, max_length=255)
    industry: Optional[str] = Field(None, max_length=100)
    street_address: Optional[str] = Field(None, min_length=1, max_length=255)
    city: Optional[str] = Field(None, min_length=1, max_length=100)
    region: Optional[str] = Field(None, min_length=1, max_length=100)
    country: Optional[str] = Field(None, min_length=1, max_length=100)
    status: Optional[ClientStatus] = None
    billing_term_id: Optional[UUID] = None
    default_currency: Optional[str] = None


class ClientResponse(ClientBase):
    """Schema for client response."""
    id: UUID
    billing_term_id: UUID
    billing_term: Optional[BillingTermInfo] = None
    
    class Config:
        from_attributes = True


class ClientWithContactsResponse(ClientResponse):
    """Schema for client response with contacts."""
    contacts: List["ContactResponse"] = []
    
    class Config:
        from_attributes = True


class ClientListResponse(BaseModel):
    """Schema for client list response."""
    items: List[ClientResponse]
    total: int


# Import ContactResponse for forward reference resolution
from app.schemas.contact import ContactResponse
ClientWithContactsResponse.model_rebuild()




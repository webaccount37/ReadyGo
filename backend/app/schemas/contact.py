"""
Contact Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from uuid import UUID


class ContactBase(BaseModel):
    """Base contact schema with common fields."""
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    job_title: Optional[str] = Field(None, max_length=100)
    is_primary: bool = False
    is_billing: bool = False


class ContactCreate(ContactBase):
    """Schema for creating a contact."""
    account_id: UUID


class ContactUpdate(BaseModel):
    """Schema for updating a contact (all fields optional)."""
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    job_title: Optional[str] = Field(None, max_length=100)
    is_primary: Optional[bool] = None
    is_billing: Optional[bool] = None


class ContactResponse(ContactBase):
    """Schema for contact response."""
    id: UUID
    account_id: UUID
    account_name: Optional[str] = None  # Company name from account relationship
    account_type: Optional[str] = None  # Account type from account relationship
    
    class Config:
        from_attributes = True


class ContactListResponse(BaseModel):
    """Schema for contact list response."""
    items: List[ContactResponse]
    total: int


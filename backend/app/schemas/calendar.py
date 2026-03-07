"""
Calendar Pydantic schemas for request/response validation.
"""

from datetime import date
from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID


class CalendarBase(BaseModel):
    """Base calendar schema with common fields."""
    date: date
    name: str = Field(..., max_length=255)
    country_code: str = Field(..., min_length=2, max_length=2)
    hours: float = Field(8.0, ge=0, le=24)
    year: int = Field(..., ge=2000, le=2100)
    delivery_center_id: UUID


class CalendarCreate(CalendarBase):
    """Schema for creating a calendar entry."""
    pass


class CalendarUpdate(BaseModel):
    """Schema for updating a calendar entry (all fields optional)."""
    date: Optional[date] = None
    name: Optional[str] = Field(None, max_length=255)
    country_code: Optional[str] = Field(None, min_length=2, max_length=2)
    hours: Optional[float] = Field(None, ge=0, le=24)
    year: Optional[int] = Field(None, ge=2000, le=2100)
    delivery_center_id: Optional[UUID] = None


class CalendarResponse(CalendarBase):
    """Schema for calendar response."""
    id: UUID

    class Config:
        from_attributes = True


class CalendarListResponse(BaseModel):
    """Schema for calendar list response."""
    items: List[CalendarResponse]
    total: int


class ImportPublicHolidaysRequest(BaseModel):
    """Schema for import public holidays request."""
    year: int = Field(..., ge=2000, le=2100)
    delivery_center_id: UUID

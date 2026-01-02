"""
Calendar Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID


class CalendarBase(BaseModel):
    """Base calendar schema with common fields."""
    year: int = Field(..., ge=2000, le=2100)
    month: int = Field(..., ge=1, le=12)
    day: int = Field(..., ge=1, le=31)
    is_holiday: bool = False
    holiday_name: Optional[str] = Field(None, max_length=255)
    financial_period: Optional[str] = Field(None, max_length=50)
    working_hours: float = Field(8.0, ge=0, le=24)
    notes: Optional[str] = Field(None, max_length=1000)


class CalendarCreate(CalendarBase):
    """Schema for creating a calendar entry."""
    pass


class CalendarUpdate(BaseModel):
    """Schema for updating a calendar entry (all fields optional)."""
    year: Optional[int] = Field(None, ge=2000, le=2100)
    month: Optional[int] = Field(None, ge=1, le=12)
    day: Optional[int] = Field(None, ge=1, le=31)
    is_holiday: Optional[bool] = None
    holiday_name: Optional[str] = Field(None, max_length=255)
    financial_period: Optional[str] = Field(None, max_length=50)
    working_hours: Optional[float] = Field(None, ge=0, le=24)
    notes: Optional[str] = Field(None, max_length=1000)


class CalendarResponse(CalendarBase):
    """Schema for calendar response."""
    id: UUID
    
    class Config:
        from_attributes = True


class CalendarListResponse(BaseModel):
    """Schema for calendar list response."""
    items: List[CalendarResponse]
    total: int












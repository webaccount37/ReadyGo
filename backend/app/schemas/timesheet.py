"""
Timesheet Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date
from uuid import UUID
from decimal import Decimal
from enum import Enum


class TimesheetStatusEnum(str, Enum):
    """Timesheet status values."""
    NOT_SUBMITTED = "NOT_SUBMITTED"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REOPENED = "REOPENED"
    INVOICED = "INVOICED"


class TimesheetEntryTypeEnum(str, Enum):
    """Timesheet entry type values."""
    ENGAGEMENT = "ENGAGEMENT"
    SALES = "SALES"


# Day-of-week hours
class TimesheetDayHours(BaseModel):
    """Hours for each day of the week."""
    sun_hours: Decimal = Field(default=0, ge=0)
    mon_hours: Decimal = Field(default=0, ge=0)
    tue_hours: Decimal = Field(default=0, ge=0)
    wed_hours: Decimal = Field(default=0, ge=0)
    thu_hours: Decimal = Field(default=0, ge=0)
    fri_hours: Decimal = Field(default=0, ge=0)
    sat_hours: Decimal = Field(default=0, ge=0)


class TimesheetDayNoteCreate(BaseModel):
    """Create schema for day note."""
    day_of_week: int = Field(..., ge=0, le=6)
    note: Optional[str] = Field(None, max_length=2000)


class TimesheetEntryBase(TimesheetDayHours):
    """Base schema for timesheet entry."""
    entry_type: TimesheetEntryTypeEnum = TimesheetEntryTypeEnum.ENGAGEMENT
    account_id: UUID = Field(...)
    engagement_id: Optional[UUID] = None
    opportunity_id: Optional[UUID] = None
    engagement_line_item_id: Optional[UUID] = None
    engagement_phase_id: Optional[UUID] = None
    billable: bool = True
    row_order: int = Field(default=0, ge=0)
    day_notes: Optional[List[TimesheetDayNoteCreate]] = None


class TimesheetEntryCreate(TimesheetEntryBase):
    """Create schema for timesheet entry."""
    pass


class TimesheetEntryUpsert(BaseModel):
    """Create or update schema for timesheet entry (id present = update)."""
    id: Optional[UUID] = None
    entry_type: Optional[TimesheetEntryTypeEnum] = None
    account_id: Optional[UUID] = None
    engagement_id: Optional[UUID] = None
    opportunity_id: Optional[UUID] = None
    engagement_line_item_id: Optional[UUID] = None
    engagement_phase_id: Optional[UUID] = None
    billable: Optional[bool] = None
    row_order: Optional[int] = Field(None, ge=0)
    sun_hours: Optional[Decimal] = Field(None, ge=0)
    mon_hours: Optional[Decimal] = Field(None, ge=0)
    tue_hours: Optional[Decimal] = Field(None, ge=0)
    wed_hours: Optional[Decimal] = Field(None, ge=0)
    thu_hours: Optional[Decimal] = Field(None, ge=0)
    fri_hours: Optional[Decimal] = Field(None, ge=0)
    sat_hours: Optional[Decimal] = Field(None, ge=0)
    day_notes: Optional[List[TimesheetDayNoteCreate]] = None


class TimesheetEntryUpdate(BaseModel):
    """Update schema for timesheet entry."""
    entry_type: Optional[TimesheetEntryTypeEnum] = None
    account_id: Optional[UUID] = None
    engagement_id: Optional[UUID] = None
    opportunity_id: Optional[UUID] = None
    engagement_line_item_id: Optional[UUID] = None
    engagement_phase_id: Optional[UUID] = None
    billable: Optional[bool] = None
    row_order: Optional[int] = Field(None, ge=0)
    sun_hours: Optional[Decimal] = Field(None, ge=0)
    mon_hours: Optional[Decimal] = Field(None, ge=0)
    tue_hours: Optional[Decimal] = Field(None, ge=0)
    wed_hours: Optional[Decimal] = Field(None, ge=0)
    thu_hours: Optional[Decimal] = Field(None, ge=0)
    fri_hours: Optional[Decimal] = Field(None, ge=0)
    sat_hours: Optional[Decimal] = Field(None, ge=0)
    day_notes: Optional[List[TimesheetDayNoteCreate]] = None


class TimesheetDayNoteResponse(BaseModel):
    """Response schema for day note."""
    id: UUID
    timesheet_entry_id: UUID
    day_of_week: int
    note: Optional[str] = None

    class Config:
        from_attributes = True


class TimesheetEntryResponse(TimesheetDayHours):
    """Response schema for timesheet entry."""
    id: UUID
    timesheet_id: UUID
    row_order: int
    entry_type: str
    account_id: UUID
    engagement_id: Optional[UUID] = None
    opportunity_id: Optional[UUID] = None
    engagement_line_item_id: Optional[UUID] = None
    engagement_phase_id: Optional[UUID] = None
    billable: bool
    total_hours: Decimal = Field(default=0)
    account_name: Optional[str] = None
    engagement_name: Optional[str] = None
    opportunity_name: Optional[str] = None
    phase_name: Optional[str] = None
    plan_hours: Optional[Decimal] = None  # From resource plan for comparison
    day_notes: Optional[List[TimesheetDayNoteResponse]] = None
    requires_notes: bool = False  # True when Quote invoice_detail = EMPLOYEE_WITH_DESCRIPTIONS

    class Config:
        from_attributes = True


class TimesheetResponse(BaseModel):
    """Response schema for timesheet."""
    id: UUID
    employee_id: UUID
    week_start_date: str
    status: str
    created_at: str
    updated_at: str
    employee_name: Optional[str] = None
    total_hours: Decimal = Field(default=0)
    entries: Optional[List[TimesheetEntryResponse]] = None

    class Config:
        from_attributes = True


class TimesheetListResponse(BaseModel):
    """Schema for timesheet list response."""
    items: List[TimesheetResponse]
    total: int


class TimesheetSubmitRequest(BaseModel):
    """Request schema for submitting timesheet."""
    force: bool = Field(default=False, description="Force submit despite plan vs actual warning")


class TimesheetStatusHistoryResponse(BaseModel):
    """Response schema for status history entry."""
    id: UUID
    timesheet_id: UUID
    from_status: Optional[str] = None
    to_status: str
    changed_by_employee_id: Optional[UUID] = None
    changed_by_name: Optional[str] = None
    changed_at: str

    class Config:
        from_attributes = True


# Approval-specific
class TimesheetApprovalSummary(BaseModel):
    """Summary of timesheet for approval list."""
    id: UUID
    employee_id: UUID
    employee_name: str
    week_start_date: str
    status: str
    total_hours: Decimal
    engagement_names: List[str] = []


class TimesheetApprovalListResponse(BaseModel):
    """Response for list of timesheets pending approval."""
    items: List[TimesheetApprovalSummary]
    total: int


class TimesheetMassApproveRequest(BaseModel):
    """Request for mass approving timesheets."""
    timesheet_ids: List[UUID] = Field(..., min_length=1)

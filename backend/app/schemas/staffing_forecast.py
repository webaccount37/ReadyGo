"""
Pydantic schemas for staffing forecast API.
"""

from datetime import date
from typing import Optional, Any
from pydantic import BaseModel, Field


class StaffingForecastSourceItem(BaseModel):
    """Single source contribution to a cell."""
    source_type: str  # "estimate" | "engagement"
    opportunity_id: str
    opportunity_name: str
    estimate_id: Optional[str] = None
    engagement_id: Optional[str] = None
    hours: float
    rate: float
    cost: float
    label: str  # "Plan" | "Actuals"


class StaffingForecastCell(BaseModel):
    """Cell value for a row/week or row/month intersection."""
    hours: Optional[float] = None  # null when employee week is outside tenure (employee rows)
    revenue: Optional[float] = None
    cost: Optional[float] = None
    margin_pct: Optional[float] = None
    billable_utilization_pct: Optional[float] = None
    billable_hours: Optional[float] = None  # For employee rows in utilization scope; enables correct aggregation
    available_hours: Optional[float] = None  # 40 - holiday - PTO
    sources: list[StaffingForecastSourceItem] = Field(default_factory=list)


class StaffingForecastWeek(BaseModel):
    """Week definition."""
    week_start: str
    year: int
    week_number: int


class StaffingForecastMonth(BaseModel):
    """Month definition (financial reporting / calendar month)."""
    month_start: str
    year: int
    month: int


class StaffingForecastRow(BaseModel):
    """Row definition for vertical axis."""
    row_key: str
    role_id: Optional[str] = None
    role_name: Optional[str] = None
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    delivery_center_id: Optional[str] = None
    delivery_center_name: Optional[str] = None
    opportunity_id: Optional[str] = None
    opportunity_name: Optional[str] = None


class StaffingForecastResponse(BaseModel):
    """Full staffing forecast response."""
    period: str  # "weekly" | "monthly"
    weeks: Optional[list[StaffingForecastWeek]] = None
    months: Optional[list[StaffingForecastMonth]] = None
    rows: list[StaffingForecastRow]
    cells: dict[str, dict[str, Any]]  # row_key -> week_key|month_key -> cell
    rollup_mode: str

    model_config = {"extra": "allow"}  # Allow weeks/months from response

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
    """Cell value for a row/week intersection."""
    hours: float
    revenue: float
    cost: float
    margin_pct: Optional[float] = None
    sources: list[StaffingForecastSourceItem] = Field(default_factory=list)


class StaffingForecastWeek(BaseModel):
    """Week definition."""
    week_start: str
    year: int
    week_number: int


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
    weeks: list[StaffingForecastWeek]
    rows: list[StaffingForecastRow]
    cells: dict[str, dict[str, Any]]  # row_key -> week_key -> cell
    rollup_mode: str

"""Pydantic schemas for Financial Forecast API."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class FinancialForecastCell(BaseModel):
    value: float
    auto_value: Optional[float] = None
    is_manual: bool = False
    source: Literal["auto", "override", "manual_expense"] = "auto"


class FinancialForecastMonthMeta(BaseModel):
    month_key: str
    month_start: str
    year: int
    month: int
    composition: Literal["actuals_only", "mixed", "forecast_only"]


class FinancialForecastRowOut(BaseModel):
    row_key: str
    label: str
    kind: str
    parent_row_key: Optional[str] = None
    auto_row: bool = False
    manual_expense: bool = False
    expense_line_id: Optional[str] = None


class FinancialForecastResponse(BaseModel):
    model_config = {"extra": "allow"}

    definition_version: int
    currency: str
    metric: str
    delivery_center_id: str
    range_start: str
    range_end: str
    months: list[dict[str, Any]]
    rows: list[dict[str, Any]]
    cells: dict[str, dict[str, Any]]


class FinancialForecastDefinitionResponse(BaseModel):
    version: int
    rows: list[dict[str, Any]]
    allowed_expense_parent_group_codes: list[str]


class ExpenseLineCreate(BaseModel):
    parent_group_code: str
    name: str


class ExpenseLineRename(BaseModel):
    name: str


class ExpenseCellPatch(BaseModel):
    line_id: UUID
    month_start_date: date
    amount: Optional[float] = None


class OverridePatch(BaseModel):
    row_key: str
    month_start_date: date
    amount: Optional[float] = None  # None clears override


class FinancialForecastBulkPatch(BaseModel):
    expense_cells: list[ExpenseCellPatch] = Field(default_factory=list)
    overrides: list[OverridePatch] = Field(default_factory=list)
    correlation_id: Optional[str] = None


class ChangeEventOut(BaseModel):
    id: UUID
    action: str
    payload: dict[str, Any]
    created_at: datetime
    employee_id: Optional[UUID] = None


class FinancialForecastHistoryResponse(BaseModel):
    items: list[ChangeEventOut]
    total: int

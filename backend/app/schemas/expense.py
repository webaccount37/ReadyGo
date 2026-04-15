"""Expense sheet / line schemas."""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date
from uuid import UUID
from decimal import Decimal
from enum import Enum


class ExpenseEntryTypeEnum(str, Enum):
    ENGAGEMENT = "ENGAGEMENT"
    SALES = "SALES"


class ExpenseReceiptResponse(BaseModel):
    id: UUID
    expense_line_id: UUID
    original_filename: Optional[str] = None
    content_type: Optional[str] = None
    size_bytes: int = 0
    created_at: str

    class Config:
        from_attributes = True


class ExpenseLineUpsert(BaseModel):
    id: Optional[UUID] = None
    entry_type: Optional[ExpenseEntryTypeEnum] = None
    account_id: Optional[UUID] = None
    engagement_id: Optional[UUID] = None
    opportunity_id: Optional[UUID] = None
    engagement_line_item_id: Optional[UUID] = None
    engagement_phase_id: Optional[UUID] = None
    billable: Optional[bool] = None
    reimburse: Optional[bool] = None
    date_incurred: Optional[date] = None
    expense_category_id: Optional[int] = None
    description: Optional[str] = None
    line_currency: Optional[str] = Field(None, max_length=3)
    amount: Optional[Decimal] = None
    row_order: Optional[int] = Field(None, ge=0)


class ExpenseSheetSaveRequest(BaseModel):
    entries: List[ExpenseLineUpsert] = Field(default_factory=list)
    reimbursement_currency: Optional[str] = Field(None, max_length=3)


class ExpenseLineResponse(BaseModel):
    id: UUID
    expense_sheet_id: UUID
    row_order: int
    entry_type: str
    account_id: Optional[UUID] = None
    engagement_id: Optional[UUID] = None
    opportunity_id: Optional[UUID] = None
    engagement_line_item_id: Optional[UUID] = None
    engagement_phase_id: Optional[UUID] = None
    billable: bool
    reimburse: bool
    date_incurred: Optional[str] = None
    expense_category_id: Optional[int] = None
    category_name: Optional[str] = None
    description: Optional[str] = None
    line_currency: str
    amount: Decimal
    account_name: Optional[str] = None
    engagement_name: Optional[str] = None
    opportunity_name: Optional[str] = None
    phase_name: Optional[str] = None
    receipts: Optional[List[ExpenseReceiptResponse]] = None

    class Config:
        from_attributes = True


class ExpenseStatusHistoryResponse(BaseModel):
    id: UUID
    expense_sheet_id: UUID
    from_status: Optional[str] = None
    to_status: str
    changed_by_employee_id: Optional[UUID] = None
    changed_by_name: Optional[str] = None
    changed_at: str
    note: Optional[str] = None

    class Config:
        from_attributes = True


class ExpenseSheetResponse(BaseModel):
    id: UUID
    employee_id: UUID
    week_start_date: str
    status: str
    reimbursement_currency: str
    created_at: str
    updated_at: str
    employee_name: Optional[str] = None
    total_reimbursement: Decimal = Decimal("0")
    total_billable: Decimal = Decimal("0")
    total_amount: Decimal = Decimal("0")
    lines: Optional[List[ExpenseLineResponse]] = None
    rejection_note: Optional[str] = None
    status_history: Optional[List[ExpenseStatusHistoryResponse]] = None

    class Config:
        from_attributes = True


class ExpenseApprovalSummary(BaseModel):
    id: UUID
    employee_id: UUID
    employee_name: str
    week_start_date: str
    status: str
    reimbursement_currency: str
    total_amount: Decimal
    total_billable: Decimal = Decimal("0")
    total_reimbursement: Decimal = Decimal("0")
    labels: List[str] = []


class ExpenseApprovalListResponse(BaseModel):
    items: List[ExpenseApprovalSummary]
    total: int


class RejectExpenseRequest(BaseModel):
    note: str = Field(..., min_length=1, max_length=2000)


class ManageableEmployeeSummary(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    email: str

    class Config:
        from_attributes = True


class ManageableEmployeesResponse(BaseModel):
    items: List[ManageableEmployeeSummary]
    total: int

"""Expense sheet API (parallel to timesheets)."""

from datetime import date, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.api.v1.middleware import require_authentication
from app.models.employee import Employee
from app.controllers.expense_controller import ExpenseController
from app.schemas.expense import (
    ExpenseSheetResponse,
    ExpenseSheetSaveRequest,
    ExpenseApprovalListResponse,
    RejectExpenseRequest,
    ManageableEmployeesResponse,
    ExpenseReceiptResponse,
)

router = APIRouter()


def _normalize_to_sunday(d: date) -> date:
    days_since_sunday = (d.weekday() + 1) % 7
    return d - timedelta(days=days_since_sunday)


def _week_start_from_str(s: str) -> date:
    return _normalize_to_sunday(date.fromisoformat(s))


def _current_week_start() -> date:
    from datetime import datetime

    d = datetime.utcnow().date()
    days_since_sunday = (d.weekday() + 1) % 7
    return d - timedelta(days=days_since_sunday)


@router.get("/me", response_model=ExpenseSheetResponse)
async def get_my_expense_sheet(
    week: Optional[str] = Query(None, description="Week start YYYY-MM-DD (Sunday)"),
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    week_start = _week_start_from_str(week) if week else _current_week_start()
    controller = ExpenseController(db)
    return await controller.get_or_create_my_sheet(current_employee.id, week_start)


@router.get("/me/week-statuses")
async def get_my_expense_week_statuses(
    past_weeks: int = Query(52, ge=1, le=104),
    future_weeks: int = Query(12, ge=0, le=52),
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    controller = ExpenseController(db)
    return await controller.get_week_statuses(current_employee.id, past_weeks, future_weeks)


@router.get("/by-employee", response_model=ExpenseSheetResponse)
async def get_expense_sheet_by_employee(
    employee_id: UUID = Query(...),
    week: str = Query(..., description="Week start YYYY-MM-DD (Sunday)"),
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    week_start = _week_start_from_str(week)
    controller = ExpenseController(db)
    result = await controller.get_sheet_for_week(employee_id, week_start, current_employee.id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense sheet not found or access denied")
    return result


@router.get("/approvals/pending", response_model=ExpenseApprovalListResponse)
async def list_expense_pending_approvals(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    controller = ExpenseController(db)
    return await controller.list_pending_approvals(current_employee.id, skip=skip, limit=limit)


@router.get("/approvals/list", response_model=ExpenseApprovalListResponse)
async def list_approvable_expenses(
    status: Optional[str] = Query(None),
    employee_id: Optional[UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    controller = ExpenseController(db)
    return await controller.list_approvable(
        current_employee.id, status=status, employee_id=employee_id, skip=skip, limit=limit
    )


@router.get("/approvals/employees", response_model=ManageableEmployeesResponse)
async def list_expense_manageable_employees(
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    controller = ExpenseController(db)
    return await controller.list_manageable_employees(current_employee.id)


@router.post("/lines/{line_id}/receipts", response_model=ExpenseReceiptResponse, status_code=status.HTTP_201_CREATED)
async def upload_expense_receipt(
    line_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    from app.services.expense_receipt_service import ExpenseReceiptService

    data = await file.read()
    try:
        rec = await ExpenseReceiptService(db).upload(
            line_id,
            current_employee.id,
            file.filename or "receipt",
            file.content_type,
            data,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return ExpenseReceiptResponse(
        id=rec.id,
        expense_line_id=rec.expense_line_id,
        original_filename=rec.original_filename,
        content_type=rec.content_type,
        size_bytes=rec.size_bytes or 0,
        created_at=rec.created_at.isoformat() if rec.created_at else "",
    )


@router.get("/lines/{line_id}/receipts/{receipt_id}/download")
async def download_expense_receipt(
    line_id: UUID,
    receipt_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    from app.services.expense_receipt_service import ExpenseReceiptService

    try:
        data, content_type, filename = await ExpenseReceiptService(db).download(
            line_id, receipt_id, current_employee.id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    headers = {}
    if filename:
        headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return StreamingResponse(
        iter([data]),
        media_type=content_type or "application/octet-stream",
        headers=headers,
    )


@router.delete("/lines/{line_id}/receipts/{receipt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense_receipt(
    line_id: UUID,
    receipt_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    from app.services.expense_receipt_service import ExpenseReceiptService

    try:
        await ExpenseReceiptService(db).delete(line_id, receipt_id, current_employee.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{sheet_id}", response_model=ExpenseSheetResponse)
async def get_expense_sheet(
    sheet_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    controller = ExpenseController(db)
    result = await controller.get_sheet(sheet_id, current_employee.id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense sheet not found")
    return result


@router.put("/{sheet_id}/entries", response_model=ExpenseSheetResponse)
async def save_expense_entries(
    sheet_id: UUID,
    body: ExpenseSheetSaveRequest,
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    controller = ExpenseController(db)
    try:
        return await controller.save_entries(
            sheet_id,
            body.entries,
            current_employee.id,
            reimbursement_currency=body.reimbursement_currency,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{sheet_id}/submit", response_model=ExpenseSheetResponse)
async def submit_expense_sheet(
    sheet_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    controller = ExpenseController(db)
    try:
        return await controller.submit_sheet(sheet_id, current_employee.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{sheet_id}/approve", response_model=ExpenseSheetResponse)
async def approve_expense_sheet(
    sheet_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    controller = ExpenseController(db)
    try:
        return await controller.approve_sheet(sheet_id, current_employee.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{sheet_id}/reject", response_model=ExpenseSheetResponse)
async def reject_expense_sheet(
    sheet_id: UUID,
    body: RejectExpenseRequest,
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    controller = ExpenseController(db)
    try:
        return await controller.reject_sheet(sheet_id, current_employee.id, body.note)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{sheet_id}/reopen", response_model=ExpenseSheetResponse)
async def reopen_expense_sheet(
    sheet_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    controller = ExpenseController(db)
    try:
        return await controller.reopen_sheet(sheet_id, current_employee.id, is_approver=True)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{sheet_id}/mark-invoiced", response_model=ExpenseSheetResponse)
async def mark_expense_invoiced(
    sheet_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    controller = ExpenseController(db)
    try:
        return await controller.mark_invoiced(sheet_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

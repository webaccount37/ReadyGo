"""
Timesheet API endpoints.
"""

from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.db.session import get_db
from app.api.v1.middleware import require_authentication
from app.controllers.timesheet_controller import TimesheetController
from app.models.employee import Employee
from app.schemas.timesheet import (
    TimesheetResponse,
    TimesheetEntryUpsert,
    TimesheetSubmitRequest,
    TimesheetApprovalListResponse,
)

router = APIRouter()


def _week_start_from_str(s: str) -> date:
    """Parse YYYY-MM-DD to date."""
    return date.fromisoformat(s)


@router.get("/me", response_model=TimesheetResponse)
async def get_my_timesheet_for_week(
    week: Optional[str] = Query(None, description="Week start date YYYY-MM-DD (Sunday)"),
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    """Get or create timesheet for current employee and week. Defaults to current week."""
    week_start = _week_start_from_str(week) if week else _get_current_week_start()
    controller = TimesheetController(db)
    return await controller.get_or_create_timesheet(current_employee.id, week_start)


def _get_current_week_start() -> date:
    from datetime import datetime, timedelta
    d = datetime.utcnow().date()
    days_since_sunday = (d.weekday() + 1) % 7
    return d - timedelta(days=days_since_sunday)


@router.get("/me/incomplete-count")
async def get_my_incomplete_count(
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    """Count of past weeks with NOT_SUBMITTED or REOPENED status."""
    controller = TimesheetController(db)
    return {"count": await controller.count_incomplete_past_weeks(current_employee.id)}


@router.get("/me/incomplete-weeks")
async def get_my_incomplete_weeks(
    limit: int = Query(52, ge=1, le=52),
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    """List week_start_date for past weeks with NOT_SUBMITTED or REOPENED status."""
    controller = TimesheetController(db)
    weeks = await controller.list_incomplete_past_weeks(current_employee.id, limit)
    return {"count": len(weeks), "weeks": [w.isoformat() for w in weeks]}


@router.get("/{timesheet_id}", response_model=TimesheetResponse)
async def get_timesheet(
    timesheet_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    """Get timesheet by ID."""
    controller = TimesheetController(db)
    result = await controller.get_timesheet(timesheet_id, current_employee.id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Timesheet not found")
    return result


@router.put("/{timesheet_id}/entries", response_model=TimesheetResponse)
async def save_timesheet_entries(
    timesheet_id: UUID,
    entries: List[TimesheetEntryUpsert],
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    """Save timesheet entries."""
    controller = TimesheetController(db)
    try:
        return await controller.save_entries(timesheet_id, entries, current_employee.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{timesheet_id}/submit", response_model=TimesheetResponse)
async def submit_timesheet(
    timesheet_id: UUID,
    body: Optional[TimesheetSubmitRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    """Submit timesheet for approval."""
    controller = TimesheetController(db)
    force = body.force if body else False
    try:
        result, warning = await controller.submit_timesheet(
            timesheet_id, current_employee.id, force
        )
        if warning:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"message": warning, "requires_force": True, "timesheet": result.model_dump()},
            )
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{timesheet_id}/approve", response_model=TimesheetResponse)
async def approve_timesheet(
    timesheet_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    """Approve timesheet."""
    controller = TimesheetController(db)
    try:
        return await controller.approve_timesheet(timesheet_id, current_employee.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{timesheet_id}/reject", response_model=TimesheetResponse)
async def reject_timesheet(
    timesheet_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    """Reject timesheet (status becomes REOPENED)."""
    controller = TimesheetController(db)
    try:
        return await controller.reject_timesheet(timesheet_id, current_employee.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{timesheet_id}/reopen", response_model=TimesheetResponse)
async def reopen_timesheet(
    timesheet_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    """Reopen timesheet for editing."""
    controller = TimesheetController(db)
    # TODO: determine is_approver from _can_approve
    try:
        return await controller.reopen_timesheet(
            timesheet_id, current_employee.id, is_approver=True
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{timesheet_id}/mark-invoiced", response_model=TimesheetResponse)
async def mark_invoiced(
    timesheet_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    """Mark timesheet as invoiced (for integrations). Idempotent."""
    controller = TimesheetController(db)
    try:
        return await controller.mark_invoiced(timesheet_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/approvals/pending", response_model=TimesheetApprovalListResponse)
async def list_pending_approvals(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_employee: Employee = Depends(require_authentication),
):
    """List timesheets pending approval for current user."""
    controller = TimesheetController(db)
    return await controller.list_pending_approvals(
        current_employee.id, skip=skip, limit=limit
    )

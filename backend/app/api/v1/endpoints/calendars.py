"""
Calendar API endpoints.
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.db.session import get_db
from app.controllers.calendar_controller import CalendarController
from app.schemas.calendar import (
    CalendarCreate,
    CalendarUpdate,
    CalendarResponse,
    CalendarListResponse,
)

router = APIRouter()


@router.post("", response_model=CalendarResponse, status_code=status.HTTP_201_CREATED)
async def create_calendar_entry(
    calendar_data: CalendarCreate,
    db: AsyncSession = Depends(get_db),
) -> CalendarResponse:
    """Create a new calendar entry."""
    controller = CalendarController(db)
    return await controller.create_calendar_entry(calendar_data)


@router.get("", response_model=CalendarListResponse)
async def list_calendar_entries(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    year: int = Query(None, ge=2000, le=2100),
    month: int = Query(None, ge=1, le=12),
    is_holiday: bool = Query(None),
    financial_period: str = Query(None),
    db: AsyncSession = Depends(get_db),
) -> CalendarListResponse:
    """List calendar entries with optional filters."""
    controller = CalendarController(db)
    return await controller.list_calendar_entries(
        skip=skip,
        limit=limit,
        year=year,
        month=month,
        is_holiday=is_holiday,
        financial_period=financial_period,
    )


@router.get("/{calendar_id}", response_model=CalendarResponse)
async def get_calendar_entry(
    calendar_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> CalendarResponse:
    """Get calendar entry by ID."""
    controller = CalendarController(db)
    calendar = await controller.get_calendar_entry(calendar_id)
    if not calendar:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar entry not found",
        )
    return calendar


@router.get("/date/{year}/{month}/{day}", response_model=CalendarResponse)
async def get_calendar_by_date(
    year: int,
    month: int,
    day: int,
    db: AsyncSession = Depends(get_db),
) -> CalendarResponse:
    """Get calendar entry by date."""
    controller = CalendarController(db)
    calendar = await controller.get_by_date(year, month, day)
    if not calendar:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar entry not found",
        )
    return calendar


@router.put("/{calendar_id}", response_model=CalendarResponse)
async def update_calendar_entry(
    calendar_id: UUID,
    calendar_data: CalendarUpdate,
    db: AsyncSession = Depends(get_db),
) -> CalendarResponse:
    """Update a calendar entry."""
    controller = CalendarController(db)
    calendar = await controller.update_calendar_entry(calendar_id, calendar_data)
    if not calendar:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar entry not found",
        )
    return calendar


@router.delete("/{calendar_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_calendar_entry(
    calendar_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a calendar entry."""
    controller = CalendarController(db)
    deleted = await controller.delete_calendar_entry(calendar_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar entry not found",
        )











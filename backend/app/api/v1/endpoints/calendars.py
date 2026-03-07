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
    ImportPublicHolidaysRequest,
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
    year: int = Query(..., ge=2000, le=2100, description="Year"),
    delivery_center_id: UUID = Query(..., description="Delivery center ID"),
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> CalendarListResponse:
    """List calendar entries for a year and delivery center."""
    controller = CalendarController(db)
    return await controller.list_calendar_entries(
        year=year,
        delivery_center_id=delivery_center_id,
        skip=skip,
        limit=limit,
    )


@router.post("/import-public-holidays")
async def import_public_holidays(
    body: ImportPublicHolidaysRequest,
    db: AsyncSession = Depends(get_db),
):
    """Import public holidays from date.nager.at API for the given year and delivery center."""
    controller = CalendarController(db)
    try:
        count = await controller.import_public_holidays(body.year, body.delivery_center_id)
        return {"imported": count}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


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












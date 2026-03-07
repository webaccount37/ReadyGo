"""
Calendar controller.
"""

from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.base_controller import BaseController
from app.services.calendar_service import CalendarService
from app.schemas.calendar import CalendarCreate, CalendarUpdate, CalendarResponse, CalendarListResponse


class CalendarController(BaseController):
    """Controller for calendar operations."""

    def __init__(self, session: AsyncSession):
        self.calendar_service = CalendarService(session)

    async def create_calendar_entry(self, calendar_data: CalendarCreate) -> CalendarResponse:
        """Create a new calendar entry."""
        return await self.calendar_service.create_calendar_entry(calendar_data)

    async def get_calendar_entry(self, calendar_id: UUID) -> Optional[CalendarResponse]:
        """Get calendar entry by ID."""
        return await self.calendar_service.get_calendar_entry(calendar_id)

    async def list_calendar_entries(
        self,
        year: int,
        delivery_center_id: UUID,
        skip: int = 0,
        limit: int = 500,
    ) -> CalendarListResponse:
        """List calendar entries for a year and delivery center."""
        calendars, total = await self.calendar_service.list_calendar_entries(
            year=year,
            delivery_center_id=delivery_center_id,
            skip=skip,
            limit=limit,
        )
        return CalendarListResponse(items=calendars, total=total)

    async def update_calendar_entry(
        self,
        calendar_id: UUID,
        calendar_data: CalendarUpdate,
    ) -> Optional[CalendarResponse]:
        """Update a calendar entry."""
        return await self.calendar_service.update_calendar_entry(calendar_id, calendar_data)

    async def delete_calendar_entry(self, calendar_id: UUID) -> bool:
        """Delete a calendar entry."""
        return await self.calendar_service.delete_calendar_entry(calendar_id)

    async def import_public_holidays(self, year: int, delivery_center_id: UUID) -> int:
        """Import public holidays from date.nager.at API."""
        return await self.calendar_service.import_public_holidays(year, delivery_center_id)












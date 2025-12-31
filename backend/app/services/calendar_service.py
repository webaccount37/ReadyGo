"""
Calendar service with business logic.
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.db.repositories.calendar_repository import CalendarRepository
from app.schemas.calendar import CalendarCreate, CalendarUpdate, CalendarResponse


class CalendarService(BaseService):
    """Service for calendar operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.calendar_repo = CalendarRepository(session)
    
    async def create_calendar_entry(self, calendar_data: CalendarCreate) -> CalendarResponse:
        """Create a new calendar entry."""
        calendar_dict = calendar_data.model_dump(exclude_unset=True)
        calendar = await self.calendar_repo.create(**calendar_dict)
        await self.session.commit()
        await self.session.refresh(calendar)
        return CalendarResponse.model_validate(calendar)
    
    async def get_calendar_entry(self, calendar_id: UUID) -> Optional[CalendarResponse]:
        """Get calendar entry by ID."""
        calendar = await self.calendar_repo.get(calendar_id)
        if not calendar:
            return None
        return CalendarResponse.model_validate(calendar)
    
    async def get_by_date(
        self,
        year: int,
        month: int,
        day: int,
    ) -> Optional[CalendarResponse]:
        """Get calendar entry by date."""
        calendar = await self.calendar_repo.get_by_date(year, month, day)
        if not calendar:
            return None
        return CalendarResponse.model_validate(calendar)
    
    async def list_calendar_entries(
        self,
        skip: int = 0,
        limit: int = 100,
        year: Optional[int] = None,
        month: Optional[int] = None,
        is_holiday: Optional[bool] = None,
        financial_period: Optional[str] = None,
    ) -> tuple[List[CalendarResponse], int]:
        """List calendar entries with optional filters."""
        if year and month:
            calendars = await self.calendar_repo.list_by_year_month(year, month)
        elif is_holiday:
            calendars = await self.calendar_repo.list_holidays(year, skip, limit)
        elif financial_period:
            calendars = await self.calendar_repo.list_by_financial_period(financial_period)
        else:
            calendars = await self.calendar_repo.list(skip=skip, limit=limit)
        
        total = len(calendars)
        return [CalendarResponse.model_validate(cal) for cal in calendars], total
    
    async def update_calendar_entry(
        self,
        calendar_id: UUID,
        calendar_data: CalendarUpdate,
    ) -> Optional[CalendarResponse]:
        """Update a calendar entry."""
        calendar = await self.calendar_repo.get(calendar_id)
        if not calendar:
            return None
        
        update_dict = calendar_data.model_dump(exclude_unset=True)
        updated = await self.calendar_repo.update(calendar_id, **update_dict)
        await self.session.commit()
        await self.session.refresh(updated)
        return CalendarResponse.model_validate(updated)
    
    async def delete_calendar_entry(self, calendar_id: UUID) -> bool:
        """Delete a calendar entry."""
        deleted = await self.calendar_repo.delete(calendar_id)
        await self.session.commit()
        return deleted











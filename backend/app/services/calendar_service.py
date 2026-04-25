"""
Calendar service with business logic.
"""

from datetime import date
from decimal import Decimal
from typing import List, Optional, Tuple
from uuid import UUID
import httpx
from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.calendar import Calendar
from app.services.base_service import BaseService
from app.db.repositories.calendar_repository import CalendarRepository
from app.db.repositories.delivery_center_repository import DeliveryCenterRepository
from app.schemas.calendar import CalendarCreate, CalendarUpdate, CalendarResponse


NAGER_API_BASE = "https://date.nager.at/api/v3"
DEFAULT_HOLIDAY_HOURS = Decimal("8")


class CalendarService(BaseService):
    """Service for calendar operations."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.calendar_repo = CalendarRepository(session)
        self.delivery_center_repo = DeliveryCenterRepository(session)

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

    async def list_calendar_entries(
        self,
        year: int,
        delivery_center_id: UUID,
        skip: int = 0,
        limit: int = 500,
    ) -> tuple[List[CalendarResponse], int]:
        """List calendar entries for a year and delivery center."""
        calendars, total = await self.calendar_repo.list_by_year_and_delivery_center(
            year=year,
            delivery_center_id=delivery_center_id,
            skip=skip,
            limit=limit,
        )
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

    async def import_public_holidays(self, year: int, delivery_center_id: UUID) -> int:
        """
        Import public holidays from date.nager.at API and merge into calendar.
        Returns the number of entries created or updated.
        """
        dc = await self.delivery_center_repo.get(delivery_center_id)
        if not dc or not dc.country_code:
            raise ValueError("Delivery center not found or has no country_code configured")

        url = f"{NAGER_API_BASE}/PublicHolidays/{year}/{dc.country_code}"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()

        count = 0
        for item in data:
            event_date = date.fromisoformat(item["date"])
            name = item.get("localName", item.get("name", "Holiday"))
            country_code = item.get("countryCode", dc.country_code)

            existing = await self.calendar_repo.get_by_date_and_delivery_center(
                event_date=event_date,
                delivery_center_id=delivery_center_id,
            )
            if existing:
                await self.calendar_repo.update(
                    existing.id,
                    name=name,
                    country_code=country_code,
                    hours=DEFAULT_HOLIDAY_HOURS,
                )
            else:
                await self.calendar_repo.create(
                    date=event_date,
                    name=name,
                    country_code=country_code,
                    hours=DEFAULT_HOLIDAY_HOURS,
                    year=year,
                    delivery_center_id=delivery_center_id,
                )
            count += 1

        await self.session.commit()
        return count

    async def sync_delivery_center_from_named_rows(
        self,
        delivery_center_id: UUID,
        rows: List[Tuple[str, date, Decimal]],
    ) -> dict:
        """
        Replace calendar data for a delivery center from spreadsheet rows (NAME, DATE, HOURS).

        Upserts by (delivery_center_id, date). Deletes existing rows for the same delivery center
        whose year appears in the file but whose date is not in the file (per-year cleanup within
        the years present in the upload).

        After DB changes, refreshes system holiday rows on NOT_SUBMITTED/REOPENED timesheets for
        employees at this delivery center for weeks overlapping the file's date range.
        """
        if not rows:
            raise ValueError("No calendar rows to sync")

        dc = await self.delivery_center_repo.get(delivery_center_id)
        if not dc:
            raise ValueError("Delivery center not found")
        if not dc.country_code:
            raise ValueError(
                f"Delivery center {dc.code!r} has no country_code; set it before syncing calendars"
            )

        by_date: dict[date, tuple[str, Decimal]] = {}
        for name, event_date, hours in rows:
            if hours < 0 or hours > Decimal("24"):
                raise ValueError(f"Invalid hours for {event_date}: {hours}")
            by_date[event_date] = (name.strip(), hours)

        years_in_file = {d.year for d in by_date}
        date_keys = list(by_date.keys())
        removed_dates_result = await self.session.execute(
            select(Calendar.date).where(
                and_(
                    Calendar.delivery_center_id == delivery_center_id,
                    Calendar.year.in_(years_in_file),
                    Calendar.date.notin_(date_keys),
                )
            )
        )
        removed_dates = list(removed_dates_result.scalars().all())

        created = 0
        updated = 0

        for event_date, (name, hours) in by_date.items():
            year = event_date.year
            existing = await self.calendar_repo.get_by_date_and_delivery_center(
                event_date=event_date,
                delivery_center_id=delivery_center_id,
            )
            if existing:
                await self.calendar_repo.update(
                    existing.id,
                    name=name,
                    hours=hours,
                    year=year,
                    country_code=dc.country_code,
                )
                updated += 1
            else:
                await self.calendar_repo.create(
                    date=event_date,
                    name=name,
                    country_code=dc.country_code,
                    hours=hours,
                    year=year,
                    delivery_center_id=delivery_center_id,
                )
                created += 1

        del_result = await self.session.execute(
            delete(Calendar).where(
                and_(
                    Calendar.delivery_center_id == delivery_center_id,
                    Calendar.year.in_(years_in_file),
                    Calendar.date.notin_(date_keys),
                )
            )
        )
        deleted = del_result.rowcount or 0

        await self.session.flush()

        from app.services.timesheet_service import TimesheetService, _get_week_start

        affected_weeks = {_get_week_start(d) for d in by_date} | {_get_week_start(d) for d in removed_dates}
        week_list = sorted(affected_weeks)

        ts_svc = TimesheetService(self.session)
        timesheets_touched = await ts_svc.refresh_open_timesheet_holiday_rows_for_delivery_center_weeks(
            delivery_center_id, week_list
        )

        await self.session.commit()
        return {
            "created": created,
            "updated": updated,
            "deleted": deleted,
            "rows_in_file": len(by_date),
            "open_timesheets_holiday_refreshed": timesheets_touched,
        }






"""
Timesheet repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.db.repositories.base_repository import BaseRepository
from app.models.timesheet import Timesheet, TimesheetStatus


class TimesheetRepository(BaseRepository[Timesheet]):
    """Repository for timesheet operations."""

    def __init__(self, session: AsyncSession):
        super().__init__(Timesheet, session)

    async def get(self, id: UUID) -> Optional[Timesheet]:
        """Get timesheet by ID."""
        from sqlalchemy.orm import selectinload
        from app.models.timesheet import TimesheetEntry

        result = await self.session.execute(
            select(Timesheet)
            .options(
                selectinload(Timesheet.employee),
                selectinload(Timesheet.entries).selectinload(TimesheetEntry.account),
                selectinload(Timesheet.entries).selectinload(TimesheetEntry.engagement),
                selectinload(Timesheet.entries).selectinload(TimesheetEntry.opportunity),
                selectinload(Timesheet.entries).selectinload(TimesheetEntry.engagement_phase),
                selectinload(Timesheet.entries).selectinload(TimesheetEntry.day_notes),
            )
            .where(Timesheet.id == id)
        )
        return result.scalar_one_or_none()

    async def get_by_employee_and_week(
        self,
        employee_id: UUID,
        week_start_date: date,
    ) -> Optional[Timesheet]:
        """Get timesheet by employee and week."""
        from sqlalchemy.orm import selectinload
        from app.models.timesheet import TimesheetEntry

        result = await self.session.execute(
            select(Timesheet)
            .options(
                selectinload(Timesheet.employee),
                selectinload(Timesheet.entries).selectinload(TimesheetEntry.account),
                selectinload(Timesheet.entries).selectinload(TimesheetEntry.engagement),
                selectinload(Timesheet.entries).selectinload(TimesheetEntry.opportunity),
                selectinload(Timesheet.entries).selectinload(TimesheetEntry.engagement_phase),
                selectinload(Timesheet.entries).selectinload(TimesheetEntry.engagement_line_item),
                selectinload(Timesheet.entries).selectinload(TimesheetEntry.day_notes),
            )
            .where(
                Timesheet.employee_id == employee_id,
                Timesheet.week_start_date == week_start_date,
            )
        )
        return result.scalar_one_or_none()

    async def get_or_create(
        self,
        employee_id: UUID,
        week_start_date: date,
    ) -> Timesheet:
        """Get existing timesheet or create new one."""
        existing = await self.get_by_employee_and_week(employee_id, week_start_date)
        if existing:
            return existing
        timesheet = await self.create(
            employee_id=employee_id,
            week_start_date=week_start_date,
            status=TimesheetStatus.NOT_SUBMITTED,
        )
        await self.session.refresh(timesheet)
        return timesheet

    async def create(self, **kwargs) -> Timesheet:
        """Create a new timesheet."""
        instance = Timesheet(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def count_incomplete_weeks(self, employee_id: UUID, today: date, lookback_weeks: int = 52) -> int:
        """Count weeks (that have started) where employee has no timesheet OR timesheet is NOT_SUBMITTED/REOPENED."""
        from datetime import timedelta

        def _sunday_of(d: date) -> date:
            days_back = (d.weekday() + 1) % 7
            return d - timedelta(days=days_back)

        current_sunday = _sunday_of(today)
        oldest_sunday = current_sunday - timedelta(days=7 * lookback_weeks)

        result = await self.session.execute(
            select(Timesheet.week_start_date, Timesheet.status)
            .where(
                Timesheet.employee_id == employee_id,
                Timesheet.week_start_date >= oldest_sunday,
                Timesheet.week_start_date <= current_sunday,
            )
        )
        submitted_weeks = {
            row[0] for row in result.fetchall()
            if row[1] not in (TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED)
        }

        incomplete = 0
        cursor = current_sunday
        for _ in range(lookback_weeks + 1):
            if cursor > today:
                break
            if cursor not in submitted_weeks:
                incomplete += 1
            cursor -= timedelta(days=7)
        return incomplete

    async def list_incomplete_weeks(self, employee_id: UUID, today: date, limit: int = 52) -> List[date]:
        """List week_start_date for incomplete weeks, earliest first (asc)."""
        from datetime import timedelta

        def _sunday_of(d: date) -> date:
            days_back = (d.weekday() + 1) % 7
            return d - timedelta(days=days_back)

        current_sunday = _sunday_of(today)
        oldest_sunday = current_sunday - timedelta(days=7 * limit)

        result = await self.session.execute(
            select(Timesheet.week_start_date, Timesheet.status)
            .where(
                Timesheet.employee_id == employee_id,
                Timesheet.week_start_date >= oldest_sunday,
                Timesheet.week_start_date <= current_sunday,
            )
        )
        submitted_weeks = {
            row[0] for row in result.fetchall()
            if row[1] not in (TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED)
        }

        weeks: List[date] = []
        cursor = current_sunday
        for _ in range(limit + 1):
            if cursor > today:
                break
            if cursor not in submitted_weeks:
                weeks.append(cursor)
            cursor -= timedelta(days=7)
        weeks.reverse()
        return weeks  # return all incomplete weeks to match count_incomplete_weeks

    async def count_incomplete_past_weeks(self, employee_id: UUID, today: date) -> int:
        """Legacy: Count weeks with NOT_SUBMITTED or REOPENED. Use count_incomplete_weeks for accurate pre-visit count."""
        return await self.count_incomplete_weeks(employee_id, today)

    async def list_incomplete_past_weeks(self, employee_id: UUID, today: date, limit: int = 20) -> List[date]:
        """List week_start_date for incomplete weeks, earliest first."""
        return await self.list_incomplete_weeks(employee_id, today, limit)

    async def list_pending_approvals_for_approver(
        self,
        approver_employee_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Timesheet]:
        """List timesheets pending approval for the given approver.
        Approver can be: engagement-level approver or delivery center approver.
        """
        from sqlalchemy.orm import selectinload
        from sqlalchemy import or_, union_all
        from app.models.timesheet import TimesheetEntry
        from app.models.engagement_timesheet_approver import EngagementTimesheetApprover
        from app.models.delivery_center_approver import DeliveryCenterApprover
        from app.models.engagement import Engagement
        from app.models.opportunity import Opportunity

        # Subquery: engagement IDs where this employee can approve
        eng_approver_subq = select(EngagementTimesheetApprover.engagement_id).where(
            EngagementTimesheetApprover.employee_id == approver_employee_id
        )
        dc_approver_subq = (
            select(Engagement.id.label("engagement_id"))
            .select_from(Engagement)
            .join(Opportunity, Engagement.opportunity_id == Opportunity.id)
            .join(DeliveryCenterApprover, Opportunity.delivery_center_id == DeliveryCenterApprover.delivery_center_id)
            .where(DeliveryCenterApprover.employee_id == approver_employee_id)
        )
        approver_engagement_ids = union_all(eng_approver_subq, dc_approver_subq).subquery()

        result = await self.session.execute(
            select(Timesheet)
            .join(TimesheetEntry, Timesheet.id == TimesheetEntry.timesheet_id)
            .where(
                Timesheet.status == TimesheetStatus.SUBMITTED,
                TimesheetEntry.engagement_id.in_(select(approver_engagement_ids.c.engagement_id)),
            )
            .distinct()
            .options(
                selectinload(Timesheet.employee),
                selectinload(Timesheet.entries).selectinload(TimesheetEntry.engagement),
            )
            .order_by(Timesheet.week_start_date.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

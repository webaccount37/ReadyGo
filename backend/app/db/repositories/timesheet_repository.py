"""
Timesheet repository for database operations.
"""

from typing import Optional, List, Dict, Tuple, Sequence, NamedTuple, Any
from uuid import UUID
from datetime import date, timedelta, datetime
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, tuple_, union_all

from app.db.repositories.base_repository import BaseRepository
from app.models.timesheet import Timesheet, TimesheetStatus, TimesheetStatusHistory


class ApprovableTimesheetSummary(NamedTuple):
    """Slim row for approver list (no ORM timesheet graph)."""

    id: UUID
    employee_id: UUID
    week_start_date: date
    status: TimesheetStatus
    employee_first_name: Optional[str]
    employee_last_name: Optional[str]
    total_hours: Decimal


def _build_approvable_union_subquery(
    approver_employee_id: UUID,
    status_filter: Optional[TimesheetStatus],
    employee_id_filter: Optional[UUID],
):
    """
    Subquery of timesheet ids: engagement entries, engagement line items, employee delivery center,
    or entries tied to an opportunity the approver can approve via that opportunity's invoice DC
    (e.g. SALES rows without an engagement_id).
    Must match list_approvable_timesheets_for_approver and TimesheetApprovalService._can_approve_async.
    """
    from app.models.timesheet import TimesheetEntry
    from app.models.engagement_timesheet_approver import EngagementTimesheetApprover
    from app.models.delivery_center_approver import DeliveryCenterApprover
    from app.models.engagement import Engagement, EngagementLineItem
    from app.models.opportunity import Opportunity
    from app.models.employee import Employee

    status_val = status_filter.value if status_filter else None
    eng_approver_subq = select(EngagementTimesheetApprover.engagement_id).where(
        EngagementTimesheetApprover.employee_id == approver_employee_id
    )
    dc_approver_subq = (
        select(Engagement.id.label("engagement_id"))
        .select_from(Engagement)
        .join(Opportunity, Engagement.opportunity_id == Opportunity.id)
        .join(
            DeliveryCenterApprover,
            Opportunity.delivery_center_id == DeliveryCenterApprover.delivery_center_id,
        )
        .where(DeliveryCenterApprover.employee_id == approver_employee_id)
    )
    approver_engagement_ids = union_all(eng_approver_subq, dc_approver_subq).subquery()
    approver_dc_ids = select(DeliveryCenterApprover.delivery_center_id).where(
        DeliveryCenterApprover.employee_id == approver_employee_id
    )

    engagement_based = (
        select(Timesheet.id)
        .join(TimesheetEntry, Timesheet.id == TimesheetEntry.timesheet_id)
        .where(TimesheetEntry.engagement_id.in_(select(approver_engagement_ids.c.engagement_id)))
        .distinct()
    )
    if status_val:
        engagement_based = engagement_based.where(Timesheet.status == status_filter)
    if employee_id_filter:
        engagement_based = engagement_based.where(Timesheet.employee_id == employee_id_filter)

    engagement_line_item_based = (
        select(Timesheet.id)
        .where(
            Timesheet.employee_id.in_(
                select(EngagementLineItem.employee_id)
                .where(
                    EngagementLineItem.engagement_id.in_(select(approver_engagement_ids.c.engagement_id)),
                    EngagementLineItem.employee_id.isnot(None),
                )
            )
        )
    )
    if status_val:
        engagement_line_item_based = engagement_line_item_based.where(Timesheet.status == status_filter)
    if employee_id_filter:
        engagement_line_item_based = engagement_line_item_based.where(
            Timesheet.employee_id == employee_id_filter
        )

    employee_dc_based = (
        select(Timesheet.id)
        .join(Employee, Timesheet.employee_id == Employee.id)
        .where(Employee.delivery_center_id.in_(approver_dc_ids))
    )
    if status_val:
        employee_dc_based = employee_dc_based.where(Timesheet.status == status_filter)
    if employee_id_filter:
        employee_dc_based = employee_dc_based.where(Timesheet.employee_id == employee_id_filter)

    # Timesheet has an entry with opportunity_id and approver is DC for that opportunity's center
    opportunity_entry_based = (
        select(Timesheet.id)
        .join(TimesheetEntry, Timesheet.id == TimesheetEntry.timesheet_id)
        .join(
            Opportunity,
            TimesheetEntry.opportunity_id == Opportunity.id,
        )
        .join(
            DeliveryCenterApprover,
            and_(
                Opportunity.delivery_center_id == DeliveryCenterApprover.delivery_center_id,
                DeliveryCenterApprover.employee_id == approver_employee_id,
            ),
        )
        .distinct()
    )
    if status_val:
        opportunity_entry_based = opportunity_entry_based.where(Timesheet.status == status_filter)
    if employee_id_filter:
        opportunity_entry_based = opportunity_entry_based.where(
            Timesheet.employee_id == employee_id_filter
        )

    return union_all(
        union_all(engagement_based, engagement_line_item_based),
        employee_dc_based,
        opportunity_entry_based,
    ).subquery()


def _approvable_list_outer_predicates():
    """exclude_future and sunday_only for timesheets in the approver list (same for all list paths)."""

    def _sunday_of(d: date) -> date:
        days_back = (d.weekday() + 1) % 7
        return d - timedelta(days=days_back)

    today = date.today()
    end_of_current_week = _sunday_of(today) + timedelta(days=6)
    exclude_future = or_(
        ~Timesheet.status.in_([TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED]),
        Timesheet.week_start_date <= end_of_current_week,
    )
    sunday_only = func.extract("dow", Timesheet.week_start_date) == 0
    return exclude_future, sunday_only


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
                selectinload(Timesheet.status_history).selectinload(TimesheetStatusHistory.changed_by_employee),
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
                selectinload(Timesheet.status_history).selectinload(TimesheetStatusHistory.changed_by_employee),
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

    async def list_by_employee_week_keys(
        self,
        keys: Sequence[Tuple[UUID, date]],
    ) -> List[Timesheet]:
        """All timesheets matching (employee_id, week_start_date) pairs (one query, no entry eager load)."""
        if not keys:
            return []
        result = await self.session.execute(
            select(Timesheet).where(
                tuple_(Timesheet.employee_id, Timesheet.week_start_date).in_(list(keys))
            )
        )
        return list(result.scalars().all())

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

    async def list_open_by_delivery_center_and_week_starts(
        self,
        delivery_center_id: UUID,
        week_starts: List[date],
    ) -> List[Timesheet]:
        """NOT_SUBMITTED/REOPENED timesheets whose week_start_date is in week_starts for employees at DC."""
        if not week_starts:
            return []
        from app.models.employee import Employee

        result = await self.session.execute(
            select(Timesheet).where(
                Timesheet.status.in_((TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED)),
                Timesheet.week_start_date.in_(week_starts),
                Timesheet.employee_id.in_(
                    select(Employee.id).where(Employee.delivery_center_id == delivery_center_id)
                ),
            )
        )
        return list(result.scalars().all())

    async def create(self, **kwargs) -> Timesheet:
        """Create a new timesheet."""
        instance = Timesheet(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def count_incomplete_weeks(
        self, employee_id: UUID, today: date, employee_start_date: date, lookback_weeks: int = 52
    ) -> int:
        """Count weeks (that have started, on/after employee start_date) where employee has no timesheet OR timesheet is NOT_SUBMITTED/REOPENED."""
        from datetime import timedelta

        def _sunday_of(d: date) -> date:
            days_back = (d.weekday() + 1) % 7
            return d - timedelta(days=days_back)

        current_sunday = _sunday_of(today)
        oldest_sunday = current_sunday - timedelta(days=7 * lookback_weeks)
        first_required_week_start = _sunday_of(employee_start_date)

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
                cursor -= timedelta(days=7)
                continue
            if cursor < first_required_week_start:
                cursor -= timedelta(days=7)
                continue
            if cursor not in submitted_weeks:
                incomplete += 1
            cursor -= timedelta(days=7)
        return incomplete

    async def list_incomplete_weeks(
        self,
        employee_id: UUID,
        today: date,
        employee_start_date: date,
        limit: int = 52,
    ) -> List[date]:
        """List week_start_date for incomplete weeks (on or after employee start_date), earliest first (asc)."""
        from datetime import timedelta

        def _sunday_of(d: date) -> date:
            days_back = (d.weekday() + 1) % 7
            return d - timedelta(days=days_back)

        current_sunday = _sunday_of(today)
        oldest_sunday = current_sunday - timedelta(days=7 * limit)
        first_required_week_start = _sunday_of(employee_start_date)

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
                cursor -= timedelta(days=7)
                continue
            if cursor < first_required_week_start:
                cursor -= timedelta(days=7)
                continue
            if cursor not in submitted_weeks:
                weeks.append(cursor)
            cursor -= timedelta(days=7)
        weeks.reverse()
        return weeks  # return all incomplete weeks to match count_incomplete_weeks

    async def count_incomplete_past_weeks(
        self, employee_id: UUID, today: date, employee_start_date: date
    ) -> int:
        """Legacy: Count weeks with NOT_SUBMITTED or REOPENED. Use count_incomplete_weeks for accurate pre-visit count."""
        return await self.count_incomplete_weeks(
            employee_id, today, employee_start_date
        )

    async def list_incomplete_past_weeks(
        self, employee_id: UUID, today: date, employee_start_date: date, limit: int = 20
    ) -> List[date]:
        """List week_start_date for incomplete weeks, earliest first."""
        return await self.list_incomplete_weeks(
            employee_id, today, employee_start_date, limit
        )

    async def incomplete_past_weeks_snapshot(
        self,
        employee_id: UUID,
        today: date,
        employee_start_date: date,
        lookback_weeks: int = 52,
    ) -> Tuple[int, List[date]]:
        """Single-query snapshot: incomplete week count and list (earliest first) for backlog links.

        Matches ``count_incomplete_weeks`` + ``list_incomplete_weeks`` for the same ``lookback_weeks``,
        using one SELECT and one backward walk over Sundays.
        """
        from datetime import timedelta

        def _sunday_of(d: date) -> date:
            days_back = (d.weekday() + 1) % 7
            return d - timedelta(days=days_back)

        current_sunday = _sunday_of(today)
        walk_weeks = lookback_weeks
        oldest_sunday = current_sunday - timedelta(days=7 * walk_weeks)
        first_required_week_start = _sunday_of(employee_start_date)

        result = await self.session.execute(
            select(Timesheet.week_start_date, Timesheet.status)
            .where(
                Timesheet.employee_id == employee_id,
                Timesheet.week_start_date >= oldest_sunday,
                Timesheet.week_start_date <= current_sunday,
            )
        )
        submitted_weeks = {
            row[0]
            for row in result.fetchall()
            if row[1] not in (TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED)
        }

        incomplete_newest_first: List[date] = []
        cursor = current_sunday
        for _ in range(walk_weeks + 1):
            if cursor > today:
                cursor -= timedelta(days=7)
                continue
            if cursor < first_required_week_start:
                cursor -= timedelta(days=7)
                continue
            if cursor not in submitted_weeks:
                incomplete_newest_first.append(cursor)
            cursor -= timedelta(days=7)

        count_in_window = len(incomplete_newest_first)
        weeks_asc = list(reversed(incomplete_newest_first))
        return count_in_window, weeks_asc

    async def get_week_statuses(
        self,
        employee_id: UUID,
        start_date: date,
        end_date: date,
    ) -> Dict[str, str]:
        """Get timesheet status by week_start_date for employee in range. Returns {week_iso: status}."""
        result = await self.session.execute(
            select(Timesheet.week_start_date, Timesheet.status)
            .where(
                Timesheet.employee_id == employee_id,
                Timesheet.week_start_date >= start_date,
                Timesheet.week_start_date <= end_date,
            )
        )
        return {row[0].isoformat(): row[1].value for row in result.fetchall()}

    async def list_pending_approvals_for_approver(
        self,
        approver_employee_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Timesheet]:
        """List timesheets pending approval for the given approver.
        Approver can be: (1) engagement-level approver, (2) DC approver for opp invoice center,
        (3) DC approver for employee's delivery center (entire timesheet).
        """
        from sqlalchemy.orm import selectinload
        from sqlalchemy import or_, union_all, and_
        from app.models.timesheet import TimesheetEntry
        from app.models.engagement_timesheet_approver import EngagementTimesheetApprover
        from app.models.delivery_center_approver import DeliveryCenterApprover
        from app.models.engagement import Engagement
        from app.models.opportunity import Opportunity
        from app.models.employee import Employee

        # Subquery: engagement IDs where this employee can approve (paths 1 & 2)
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

        # Path 3: DCs where approver is a DC approver
        approver_dc_ids = select(DeliveryCenterApprover.delivery_center_id).where(
            DeliveryCenterApprover.employee_id == approver_employee_id
        )

        # Path 1: Timesheets with entries linking to engagements
        engagement_based = (
            select(Timesheet.id)
            .join(TimesheetEntry, Timesheet.id == TimesheetEntry.timesheet_id)
            .where(
                Timesheet.status == TimesheetStatus.SUBMITTED,
                TimesheetEntry.engagement_id.in_(select(approver_engagement_ids.c.engagement_id)),
            )
            .distinct()
        )
        # Path 2: Timesheets for employees on engagement line items (resource plan)
        from app.models.engagement import EngagementLineItem
        engagement_line_item_based = (
            select(Timesheet.id)
            .where(
                Timesheet.status == TimesheetStatus.SUBMITTED,
                Timesheet.employee_id.in_(
                    select(EngagementLineItem.employee_id)
                    .where(
                        EngagementLineItem.engagement_id.in_(select(approver_engagement_ids.c.engagement_id)),
                        EngagementLineItem.employee_id.isnot(None),
                    )
                )
            )
        )
        # Path 3: Timesheets for employees in approver's delivery centers
        employee_dc_based = (
            select(Timesheet.id)
            .join(Employee, Timesheet.employee_id == Employee.id)
            .where(
                Timesheet.status == TimesheetStatus.SUBMITTED,
                Employee.delivery_center_id.in_(approver_dc_ids),
            )
        )
        # Path 4: Entry with opportunity_id; approver is DC for that opportunity's invoice center
        opportunity_entry_based = (
            select(Timesheet.id)
            .join(TimesheetEntry, Timesheet.id == TimesheetEntry.timesheet_id)
            .join(Opportunity, TimesheetEntry.opportunity_id == Opportunity.id)
            .join(
                DeliveryCenterApprover,
                and_(
                    Opportunity.delivery_center_id == DeliveryCenterApprover.delivery_center_id,
                    DeliveryCenterApprover.employee_id == approver_employee_id,
                ),
            )
            .where(Timesheet.status == TimesheetStatus.SUBMITTED)
            .distinct()
        )
        union_ids = union_all(
            union_all(engagement_based, engagement_line_item_based),
            employee_dc_based,
            opportunity_entry_based,
        ).subquery()

        # Only include timesheets with Sunday week_start_date (valid period)
        sunday_only = func.extract("dow", Timesheet.week_start_date) == 0
        result = await self.session.execute(
            select(Timesheet)
            .where(and_(Timesheet.id.in_(select(union_ids.c.id)), sunday_only))
            .options(
                selectinload(Timesheet.employee),
                selectinload(Timesheet.entries).options(
                    selectinload(TimesheetEntry.engagement),
                    selectinload(TimesheetEntry.account),
                    selectinload(TimesheetEntry.opportunity),
                ),
            )
            .order_by(Timesheet.week_start_date.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_pending_approvals_for_approver(
        self, approver_employee_id: UUID
    ) -> int:
        """Count timesheets with status SUBMITTED that the approver can approve."""
        from sqlalchemy import union_all, and_
        from app.models.timesheet import TimesheetEntry
        from app.models.engagement_timesheet_approver import EngagementTimesheetApprover
        from app.models.delivery_center_approver import DeliveryCenterApprover
        from app.models.engagement import Engagement, EngagementLineItem
        from app.models.opportunity import Opportunity
        from app.models.employee import Employee

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
        approver_dc_ids = select(DeliveryCenterApprover.delivery_center_id).where(
            DeliveryCenterApprover.employee_id == approver_employee_id
        )

        sunday_only = func.extract("dow", Timesheet.week_start_date) == 0
        engagement_based = (
            select(Timesheet.id)
            .join(TimesheetEntry, Timesheet.id == TimesheetEntry.timesheet_id)
            .where(
                Timesheet.status == TimesheetStatus.SUBMITTED,
                sunday_only,
                TimesheetEntry.engagement_id.in_(select(approver_engagement_ids.c.engagement_id)),
            )
            .distinct()
        )
        engagement_line_item_based = (
            select(Timesheet.id)
            .where(
                Timesheet.status == TimesheetStatus.SUBMITTED,
                sunday_only,
                Timesheet.employee_id.in_(
                    select(EngagementLineItem.employee_id)
                    .where(
                        EngagementLineItem.engagement_id.in_(select(approver_engagement_ids.c.engagement_id)),
                        EngagementLineItem.employee_id.isnot(None),
                    )
                )
            )
        )
        employee_dc_based = (
            select(Timesheet.id)
            .join(Employee, Timesheet.employee_id == Employee.id)
            .where(
                Timesheet.status == TimesheetStatus.SUBMITTED,
                sunday_only,
                Employee.delivery_center_id.in_(approver_dc_ids),
            )
        )
        opportunity_entry_based = (
            select(Timesheet.id)
            .join(TimesheetEntry, Timesheet.id == TimesheetEntry.timesheet_id)
            .join(Opportunity, TimesheetEntry.opportunity_id == Opportunity.id)
            .join(
                DeliveryCenterApprover,
                and_(
                    Opportunity.delivery_center_id == DeliveryCenterApprover.delivery_center_id,
                    DeliveryCenterApprover.employee_id == approver_employee_id,
                ),
            )
            .where(
                Timesheet.status == TimesheetStatus.SUBMITTED,
                sunday_only,
            )
            .distinct()
        )
        union_ids = union_all(
            union_all(engagement_based, engagement_line_item_based),
            employee_dc_based,
            opportunity_entry_based,
        ).subquery()

        from sqlalchemy import distinct

        result = await self.session.execute(
            select(func.count(distinct(union_ids.c.id))).select_from(union_ids)
        )
        return result.scalar_one_or_none() or 0

    async def list_approvable_timesheets_for_approver(
        self,
        approver_employee_id: UUID,
        status_filter: Optional[TimesheetStatus] = None,
        employee_id_filter: Optional[UUID] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Timesheet]:
        """List timesheets the approver can manage, with optional status and employee filters."""
        from sqlalchemy.orm import selectinload
        from app.models.timesheet import TimesheetEntry

        union_ids = _build_approvable_union_subquery(
            approver_employee_id, status_filter, employee_id_filter
        )
        exclude_future, sunday_only = _approvable_list_outer_predicates()
        q = (
            select(Timesheet)
            .where(and_(Timesheet.id.in_(select(union_ids.c.id)), exclude_future, sunday_only))
            .options(
                selectinload(Timesheet.employee),
                selectinload(Timesheet.entries).options(
                    selectinload(TimesheetEntry.engagement),
                    selectinload(TimesheetEntry.account),
                    selectinload(TimesheetEntry.opportunity),
                ),
            )
            .order_by(Timesheet.week_start_date.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(q)
        return list(result.scalars().all())

    async def list_approvable_timesheet_summaries_for_approver(
        self,
        approver_employee_id: UUID,
        status_filter: Optional[TimesheetStatus] = None,
        employee_id_filter: Optional[UUID] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[ApprovableTimesheetSummary]:
        """Approvable timesheet list without loading full entry ORM graphs; total hours from SQL."""
        from app.models.timesheet import TimesheetEntry
        from app.models.employee import Employee

        union_ids = _build_approvable_union_subquery(
            approver_employee_id, status_filter, employee_id_filter
        )
        exclude_future, sunday_only = _approvable_list_outer_predicates()

        entry_day_sum = (
            func.coalesce(TimesheetEntry.sun_hours, 0)
            + func.coalesce(TimesheetEntry.mon_hours, 0)
            + func.coalesce(TimesheetEntry.tue_hours, 0)
            + func.coalesce(TimesheetEntry.wed_hours, 0)
            + func.coalesce(TimesheetEntry.thu_hours, 0)
            + func.coalesce(TimesheetEntry.fri_hours, 0)
            + func.coalesce(TimesheetEntry.sat_hours, 0)
        )
        entry_totals = (
            select(
                TimesheetEntry.timesheet_id.label("tid"),
                func.coalesce(func.sum(entry_day_sum), 0).label("total_hours"),
            ).group_by(TimesheetEntry.timesheet_id)
        ).subquery()

        q = (
            select(
                Timesheet.id,
                Timesheet.employee_id,
                Timesheet.week_start_date,
                Timesheet.status,
                Employee.first_name,
                Employee.last_name,
                func.coalesce(entry_totals.c.total_hours, 0).label("total_hours"),
            )
            .join(Employee, Timesheet.employee_id == Employee.id)
            .outerjoin(entry_totals, Timesheet.id == entry_totals.c.tid)
            .where(and_(Timesheet.id.in_(select(union_ids.c.id)), exclude_future, sunday_only))
            .order_by(Timesheet.week_start_date.desc())
            .offset(skip)
            .limit(limit)
        )
        r = await self.session.execute(q)
        out: List[ApprovableTimesheetSummary] = []
        for row in r.mappings().all():
            th = row["total_hours"]
            if th is not None and not isinstance(th, Decimal):
                th = Decimal(str(th))
            elif th is None:
                th = Decimal("0")
            out.append(
                ApprovableTimesheetSummary(
                    id=row["id"],
                    employee_id=row["employee_id"],
                    week_start_date=row["week_start_date"],
                    status=row["status"],
                    employee_first_name=row["first_name"],
                    employee_last_name=row["last_name"],
                    total_hours=th,
                )
            )
        return out

    async def count_approvable_timesheets_for_approver(
        self,
        approver_employee_id: UUID,
        status_filter: Optional[TimesheetStatus] = None,
        employee_id_filter: Optional[UUID] = None,
    ) -> int:
        """Count timesheets the approver can manage (same scope as list_approvable_timesheet_summaries)."""
        from sqlalchemy import distinct

        union_ids = _build_approvable_union_subquery(
            approver_employee_id, status_filter, employee_id_filter
        )
        exclude_future, sunday_only = _approvable_list_outer_predicates()
        result = await self.session.execute(
            select(func.count(distinct(Timesheet.id)))
            .where(and_(Timesheet.id.in_(select(union_ids.c.id)), exclude_future, sunday_only))
        )
        return int(result.scalar_one() or 0)

    async def fetch_timesheet_entry_label_rows(
        self, timesheet_ids: List[UUID]
    ) -> List[Tuple[UUID, Any, Any, Any, Any, Any, Any]]:
        """One query of entry fields + joined names for approval list labels; callers build label strings."""
        if not timesheet_ids:
            return []
        from app.models.timesheet import TimesheetEntry
        from app.models.engagement import Engagement
        from app.models.opportunity import Opportunity
        from app.models.account import Account

        out: List[Tuple[UUID, Any, Any, Any, Any, Any, Any]] = []
        chunk = 500
        for i in range(0, len(timesheet_ids), chunk):
            part = timesheet_ids[i : i + chunk]
            r = await self.session.execute(
                select(
                    TimesheetEntry.timesheet_id,
                    TimesheetEntry.entry_type,
                    Engagement.name,
                    Account.company_name,
                    Opportunity.name,
                    TimesheetEntry.engagement_display_name,
                    TimesheetEntry.account_display_name,
                )
                .select_from(TimesheetEntry)
                .outerjoin(Engagement, TimesheetEntry.engagement_id == Engagement.id)
                .outerjoin(Account, TimesheetEntry.account_id == Account.id)
                .outerjoin(Opportunity, TimesheetEntry.opportunity_id == Opportunity.id)
                .where(TimesheetEntry.timesheet_id.in_(part))
            )
            for row in r.all():
                out.append(
                    (
                        row[0],
                        row[1],
                        row[2],
                        row[3],
                        row[4],
                        row[5],
                        row[6],
                    )
                )
        return out

    async def list_approvable_employee_ids_for_approver(
        self, approver_employee_id: UUID
    ) -> List[UUID]:
        """Distinct employee_ids for timesheets in approver scope (same filters as approvable list)."""
        union_ids = _build_approvable_union_subquery(
            approver_employee_id, status_filter=None, employee_id_filter=None
        )
        exclude_future, sunday_only = _approvable_list_outer_predicates()
        result = await self.session.execute(
            select(Timesheet.employee_id)
            .where(
                and_(
                    Timesheet.id.in_(select(union_ids.c.id)),
                    exclude_future,
                    sunday_only,
                    Timesheet.employee_id.isnot(None),
                )
            )
            .distinct()
        )
        return [r[0] for r in result.fetchall() if r[0]]

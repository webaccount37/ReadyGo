"""Compile-time checks for bulk timesheet / engagement list queries (no DB)."""

from datetime import date, timedelta
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from app.models.engagement import Engagement, EngagementLineItem, EngagementWeeklyHours
from app.models.opportunity import Opportunity
from app.models.quote import Quote


def test_weekly_hours_bulk_week_filter_compiles():
    ids = [uuid4(), uuid4()]
    week = date(2025, 6, 1)
    q = select(EngagementWeeklyHours).where(
        EngagementWeeklyHours.engagement_line_item_id.in_(ids),
        EngagementWeeklyHours.week_start_date == week,
    )
    sql = str(q.compile(dialect=postgresql.dialect()))
    assert "engagement_weekly_hours" in sql
    assert "engagement_line_item_id" in sql


def test_engagement_list_by_employee_query_compiles():
    """list_by_employee_on_resource_plan-style options (smoke: ORM builds a statement)."""
    from sqlalchemy.orm import selectinload, with_loader_criteria
    from sqlalchemy import and_

    employee_id = uuid4()
    week_start = date(2025, 6, 1)
    week_end = week_start + timedelta(days=6)
    li_criteria = and_(
        EngagementLineItem.employee_id == employee_id,
        EngagementLineItem.start_date <= week_end,
        EngagementLineItem.end_date >= week_start,
    )
    subq = (
        select(Engagement.id)
        .join(EngagementLineItem, Engagement.id == EngagementLineItem.engagement_id)
        .where(li_criteria)
        .distinct()
    )
    q = select(Engagement).options(
        selectinload(Engagement.opportunity).selectinload(Opportunity.account),
        selectinload(Engagement.quote).selectinload(Quote.opportunity),
        selectinload(Engagement.phases),
        with_loader_criteria(EngagementLineItem, li_criteria, include_aliases=True),
        selectinload(Engagement.line_items),
    ).where(Engagement.id.in_(subq))
    sql = str(q.compile(dialect=postgresql.dialect()))
    assert "engagements" in sql
    assert "engagement_line_items" in sql

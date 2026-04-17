"""Dashboard opportunity aggregate queries compile on PostgreSQL."""

from sqlalchemy import cast, extract, func, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.types import Integer, Numeric

from app.models.delivery_center import DeliveryCenter
from app.models.opportunity import Opportunity, OpportunityStatus


def test_dashboard_repository_queries_compile_postgres():
    """Smoke-compile SQL for all dashboard aggregate shapes."""
    dialect = postgresql.dialect()

    create_or_start = func.coalesce(Opportunity.deal_creation_date, Opportunity.start_date)
    days_to_close = Opportunity.close_date - create_or_start
    won_pred = Opportunity.status == OpportunityStatus.WON

    q1 = select(func.avg(cast(days_to_close, Numeric))).where(
        won_pred,
        Opportunity.close_date.isnot(None),
        create_or_start.isnot(None),
    )
    assert "avg" in str(q1.compile(dialect=dialect)).lower()

    year_part = extract("year", Opportunity.close_date)
    q2 = (
        select(
            cast(year_part, Integer),
            Opportunity.delivery_center_id,
            DeliveryCenter.name,
            func.coalesce(func.sum(func.coalesce(Opportunity.forecast_value_usd, 0)), 0),
        )
        .join(DeliveryCenter, DeliveryCenter.id == Opportunity.delivery_center_id)
        .where(Opportunity.status == OpportunityStatus.WON, Opportunity.close_date.isnot(None))
        .group_by(year_part, Opportunity.delivery_center_id, DeliveryCenter.name)
    )
    s2 = str(q2.compile(dialect=dialect))
    assert "year" in s2.lower()
    assert "delivery_center" in s2.lower()

    ym = func.to_char(Opportunity.close_date, "YYYY-MM")
    q3 = (
        select(ym, func.count())
        .where(Opportunity.status == OpportunityStatus.WON, Opportunity.close_date.isnot(None))
        .group_by(ym)
    )
    assert "to_char" in str(q3.compile(dialect=dialect)).lower()

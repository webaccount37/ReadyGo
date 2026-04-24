"""Bulk billable=False updates for line items when invoice_customer is false compile and reference expected tables."""

from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.dialects import postgresql

from app.models.estimate import Estimate, EstimateLineItem
from app.models.engagement import Engagement, EngagementLineItem


def test_cascade_billable_false_for_opportunity_compiles():
    opportunity_id = uuid4()
    est_subq = select(Estimate.id).where(Estimate.opportunity_id == opportunity_id)
    eng_subq = select(Engagement.id).where(Engagement.opportunity_id == opportunity_id)
    stmt_est = update(EstimateLineItem).where(EstimateLineItem.estimate_id.in_(est_subq)).values(billable=False)
    stmt_eng = update(EngagementLineItem).where(EngagementLineItem.engagement_id.in_(eng_subq)).values(
        billable=False
    )
    sql_e = str(stmt_est.compile(dialect=postgresql.dialect()))
    sql_g = str(stmt_eng.compile(dialect=postgresql.dialect()))
    assert "estimate_line_items" in sql_e
    assert "estimates" in sql_e
    assert "opportunity" in sql_e
    assert "engagement_line_items" in sql_g
    assert "engagements" in sql_g
    assert "billable" in sql_e.lower()
    assert "billable" in sql_g.lower()

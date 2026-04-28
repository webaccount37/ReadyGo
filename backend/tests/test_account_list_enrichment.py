"""Unit tests for account list forecast math and batch query compilation."""

from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.dialects import postgresql

from app.models.contact import Contact
from app.models.opportunity import Opportunity
from app.services.account_list_forecast import forecast_contribution_from_opportunity_row


def test_forecast_contribution_positive_forecast_usd():
    raw = SimpleNamespace(
        forecast_value_usd=Decimal("100"),
        deal_value_usd=Decimal("500"),
        probability=50.0,
    )
    assert forecast_contribution_from_opportunity_row(raw) == Decimal("100")


def test_forecast_contribution_zero_forecast_falls_back_to_weighted_deal():
    raw = SimpleNamespace(
        forecast_value_usd=Decimal("0"),
        deal_value_usd=Decimal("200"),
        probability=25.0,
    )
    assert forecast_contribution_from_opportunity_row(raw) == Decimal("50")


def test_forecast_contribution_none_forecast_positive_deal():
    raw = SimpleNamespace(
        forecast_value_usd=None,
        deal_value_usd=Decimal("400"),
        probability=10.0,
    )
    assert forecast_contribution_from_opportunity_row(raw) == Decimal("40")


def test_forecast_contribution_no_probability():
    raw = SimpleNamespace(
        forecast_value_usd=None,
        deal_value_usd=Decimal("400"),
        probability=None,
    )
    assert forecast_contribution_from_opportunity_row(raw) == Decimal("0")


def test_contact_count_by_accounts_query_compiles():
    dialect = postgresql.dialect()
    aids = [uuid4(), uuid4()]
    stmt = (
        select(Contact.account_id, func.count(Contact.id))
        .where(Contact.account_id.in_(aids))
        .group_by(Contact.account_id)
    )
    sql = str(stmt.compile(dialect=dialect))
    assert "contact" in sql.lower()
    assert "group by" in sql.lower()


def test_opportunity_list_by_account_ids_compiles():
    dialect = postgresql.dialect()
    aids = [uuid4()]
    stmt = select(Opportunity).where(Opportunity.account_id.in_(aids))
    sql = str(stmt.compile(dialect=dialect))
    assert "opportunity" in sql.lower()


def test_aggregate_sort_key_missing_sorts_after_present():
    """Mirrors list_accounts aggregate tuple (missing last when ascending)."""
    a = uuid4()
    b = uuid4()
    c = uuid4()
    enrich = {
        a: {"forecast_sum": None},
        b: {"forecast_sum": 5.0},
        c: {"forecast_sum": 20.0},
    }
    sort_by = "forecast_sum"

    def _agg_sort_key(aid):
        row = enrich.get(aid, {})
        v = row.get(sort_by)
        missing = v is None
        val = float(v) if v is not None else 0.0
        return (1 if missing else 0, val)

    ids = [a, b, c]
    assert sorted(ids, key=_agg_sort_key, reverse=False) == [b, c, a]

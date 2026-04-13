"""Regression: financial forecast SQL predicates compile and include engagement linkage."""

from datetime import date, timedelta
from uuid import uuid4

from sqlalchemy import exists, func, select
from sqlalchemy.dialects import postgresql

from app.db.repositories.financial_forecast_repository import (
    _opportunity_has_accepted_quote,
    _opportunity_has_active_engagement_quote,
    _opportunity_has_quotable_quote,
    _timesheet_entry_belongs_to_opportunity,
    _timesheet_entry_opportunity_in,
)
from app.models.employee import Employee, EmployeeType
from app.models.opportunity import Opportunity, OpportunityStatus
from app.models.timesheet import Timesheet, TimesheetApprovedSnapshot, TimesheetEntry, TimesheetStatus


def test_timesheet_entry_opportunity_in_includes_engagement_subquery():
    opp_ids = [uuid4(), uuid4()]
    q = select(TimesheetEntry.id).where(_timesheet_entry_opportunity_in(opp_ids))
    sql = str(q.compile(dialect=postgresql.dialect()))
    assert "engagement" in sql.lower()
    assert "opportunity_id" in sql.lower()


def test_timesheet_entry_belongs_to_opportunity_used_in_exists_compiles():
    has_ts = exists(
        select(1)
        .select_from(TimesheetApprovedSnapshot)
        .join(TimesheetEntry, TimesheetApprovedSnapshot.timesheet_entry_id == TimesheetEntry.id)
        .join(Timesheet, TimesheetEntry.timesheet_id == Timesheet.id)
        .where(
            _timesheet_entry_belongs_to_opportunity(Opportunity.id),
            TimesheetEntry.engagement_line_item_id.isnot(None),
            Timesheet.status.in_([TimesheetStatus.APPROVED, TimesheetStatus.INVOICED]),
        )
    )
    q = select(Opportunity.id).where(
        Opportunity.status.notin_([OpportunityStatus.LOST, OpportunityStatus.CANCELLED]),
        has_ts,
    )
    sql = str(q.compile(dialect=postgresql.dialect()))
    assert "engagement" in sql.lower()


def test_quotable_quote_is_union_of_active_engagement_quote_and_accepted():
    q = select(Opportunity.id).where(_opportunity_has_quotable_quote())
    sql = str(q.compile(dialect=postgresql.dialect()))
    assert sql.count("EXISTS") >= 2 or " OR " in sql.upper()

    q_active = select(Opportunity.id).where(_opportunity_has_active_engagement_quote())
    assert "is_active" in str(q_active.compile(dialect=postgresql.dialect())).lower()

    q_acc = select(Opportunity.id).where(_opportunity_has_accepted_quote())
    acc_sql = str(q_acc.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
    assert "ACCEPTED" in acc_sql.upper()


def test_cogs_subcontract_actuals_query_shape_matches_repository():
    """Mirror _cogs_cost_slice actuals branch for cogs_subcontract (contract + forecast DC)."""
    forecast_dc_id = uuid4()
    opp_ids = [uuid4()]
    range_start = date(2026, 1, 4)
    range_end = date(2026, 1, 31)
    ts_dc_pred = Employee.delivery_center_id == forecast_dc_id
    ts_type_pred = Employee.employee_type == EmployeeType.CONTRACT

    q_act = (
        select(
            Timesheet.week_start_date.label("ws"),
            TimesheetEntry.engagement_line_item_id.label("eli"),
            TimesheetApprovedSnapshot.invoice_currency.label("inv_cur"),
            func.sum(TimesheetApprovedSnapshot.hours * TimesheetApprovedSnapshot.invoice_cost).label(
                "cost_amt"
            ),
        )
        .select_from(TimesheetApprovedSnapshot)
        .join(TimesheetEntry, TimesheetApprovedSnapshot.timesheet_entry_id == TimesheetEntry.id)
        .join(Timesheet, TimesheetEntry.timesheet_id == Timesheet.id)
        .join(Employee, Timesheet.employee_id == Employee.id)
        .where(
            _timesheet_entry_opportunity_in(opp_ids),
            TimesheetEntry.engagement_line_item_id.isnot(None),
            Timesheet.status.in_([TimesheetStatus.APPROVED, TimesheetStatus.INVOICED]),
            ts_dc_pred,
            ts_type_pred,
            Timesheet.week_start_date >= range_start - timedelta(days=6),
            Timesheet.week_start_date <= range_end,
        )
        .group_by(
            Timesheet.week_start_date,
            TimesheetEntry.engagement_line_item_id,
            TimesheetApprovedSnapshot.invoice_currency,
        )
    )
    sql = str(q_act.compile(dialect=postgresql.dialect()))
    assert "employees" in sql.lower()
    assert "employee_type" in sql.lower()
    assert "engagement" in sql.lower()

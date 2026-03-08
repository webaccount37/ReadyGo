"""
Staffing forecast service - aggregates estimate and engagement data for the forecast grid.
"""

from datetime import date, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories.staffing_forecast_repository import StaffingForecastRepository


def _get_week_start(d: date) -> date:
    """Get the Sunday (week start) for a given date."""
    days_since_sunday = (d.weekday() + 1) % 7
    return d - timedelta(days=days_since_sunday)


DURATION_WEEKS = {3: 13, 6: 26, 12: 52}


class StaffingForecastService:
    """Service for building staffing forecast data."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = StaffingForecastRepository(session)

    async def get_forecast(
        self,
        start_week: Optional[date] = None,
        delivery_center_id: Optional[UUID] = None,
        employee_id: Optional[UUID] = None,
        billable: Optional[str] = "both",
        duration_months: int = 6,
    ) -> dict:
        """
        Build staffing forecast response. Always uses Resource + DC (granular) rollup.
        billable: "true" | "false" | "both"
        duration_months: 3, 6, or 12
        """
        if start_week is None:
            start_week = _get_week_start(date.today())
        else:
            start_week = _get_week_start(start_week) if start_week else _get_week_start(date.today())

        num_weeks = DURATION_WEEKS.get(duration_months, 26)
        end_week = start_week + timedelta(days=7 * (num_weeks - 1))

        billable_filter = None
        if billable == "true":
            billable_filter = True
        elif billable == "false":
            billable_filter = False

        # Fetch both data sources
        estimate_data = await self.repo.fetch_estimate_weekly_data(
            start_week=start_week,
            end_week=end_week,
            delivery_center_id=delivery_center_id,
            employee_id=employee_id,
            billable_filter=billable_filter,
        )

        plan_data = await self.repo.fetch_engagement_plan_weekly_data(
            start_week=start_week,
            end_week=end_week,
            delivery_center_id=delivery_center_id,
            employee_id=employee_id,
            billable_filter=billable_filter,
        )

        actuals_data = await self.repo.fetch_engagement_actuals_weekly_data(
            start_week=start_week,
            end_week=end_week,
            delivery_center_id=delivery_center_id,
            employee_id=employee_id,
            billable_filter=billable_filter,
        )

        # Merge engagement: actuals override plan per (engagement_line_item_id, week)
        actuals_keys = {(r["engagement_line_item_id"], r["week_start"].isoformat()) for r in actuals_data}
        engagement_merged = list(actuals_data)
        for r in plan_data:
            key = (r.get("engagement_line_item_id"), r["week_start"].isoformat())
            if key not in actuals_keys:
                engagement_merged.append(r)

        # Combine estimate + engagement
        all_rows = estimate_data + engagement_merged

        # Fetch all active employees (start_date >= start_week) to ensure they appear even with no assignments
        active_employees = await self.repo.fetch_active_employees_for_forecast(
            start_week=start_week,
            delivery_center_id=delivery_center_id,
            employee_id=employee_id,
        )

        # Build weeks list
        weeks = []
        current = start_week
        while current <= end_week:
            weeks.append({
                "week_start": current.isoformat(),
                "year": current.year,
                "week_number": current.isocalendar()[1],
            })
            current += timedelta(days=7)

        # Aggregate by (Employee, DC) when employee exists, else (Role, DC) for unassigned roles
        # Each raw row: opportunity_id, opportunity_name, delivery_center_id, delivery_center_name,
        # role_id, role_name, employee_id, employee_name, week_start, hours_weighted, rate, cost, sources
        # For estimate: revenue = hours*rate, cost_amount = hours*cost
        # For engagement actuals: we have revenue and cost_amount already
        # For engagement plan: revenue = hours*rate, cost_amount = hours*cost

        def make_source_entry(row: dict) -> dict:
            hours = row.get("hours_weighted", 0)
            rate = row.get("rate", 0)
            cost = row.get("cost", 0)
            if "revenue" in row and "cost_amount" in row:
                rev, cst = row["revenue"], row["cost_amount"]
            else:
                rev = hours * rate if isinstance(rate, (int, float)) else float(rate or 0) * hours
                cst = hours * cost if isinstance(cost, (int, float)) else float(cost or 0) * hours
            return {
                "source_type": row["source_type"],
                "opportunity_id": row["opportunity_id"],
                "opportunity_name": row["opportunity_name"],
                "estimate_id": row.get("estimate_id"),
                "engagement_id": row.get("engagement_id"),
                "hours": round(hours, 2),
                "rate": round(rate, 2) if isinstance(rate, (int, float)) else rate,
                "cost": round(cost, 2) if isinstance(cost, (int, float)) else cost,
                "label": row.get("source_label", "Plan"),
            }

        cells: dict = {}
        row_defs: dict = {}
        dc_names: dict = {}
        opp_names: dict = {}

        for row in all_rows:
            dc_id = row.get("delivery_center_id") or ""
            dc_name = row.get("delivery_center_name") or dc_names.get(dc_id, dc_id)
            opp_id = row.get("opportunity_id") or ""
            opp_name = row.get("opportunity_name") or opp_names.get(opp_id, opp_id)
            dc_names[dc_id] = dc_name
            opp_names[opp_id] = opp_name

            role_id = row.get("role_id") or ""
            role_name = row.get("role_name") or ""
            emp_id = row.get("employee_id") or ""
            emp_name = row.get("employee_name") or ""

            # Group by (Employee, DC) when employee exists, else (Role, DC) for unassigned
            if emp_id and emp_name:
                row_key = f"emp|{emp_id}|{emp_name}|{dc_id}"
            else:
                row_key = f"role|{role_id}|{role_name}|{dc_id}"
            row_def = {
                "role_id": role_id,
                "role_name": role_name,
                "employee_id": emp_id or None,
                "employee_name": emp_name or None,
                "delivery_center_id": dc_id or None,
                "delivery_center_name": dc_name or None,
                "opportunity_id": None,
                "opportunity_name": None,
            }

            row_defs[row_key] = row_def

            week_key = row["week_start"].isoformat() if hasattr(row["week_start"], "isoformat") else str(row["week_start"])
            hours_val = row.get("hours_weighted", 0)
            if "revenue" in row and "cost_amount" in row:
                revenue_val = row["revenue"]
                cost_val = row["cost_amount"]
            else:
                rate_val = float(row.get("rate", 0) or 0)
                cost_rate = float(row.get("cost", 0) or 0)
                revenue_val = hours_val * rate_val
                cost_val = hours_val * cost_rate

            source_entry = make_source_entry(row)

            if row_key not in cells:
                cells[row_key] = {}
            if week_key not in cells[row_key]:
                cells[row_key][week_key] = {
                    "hours": 0,
                    "revenue": 0,
                    "cost": 0,
                    "sources": [],
                }

            cell = cells[row_key][week_key]
            cell["hours"] += hours_val
            cell["revenue"] += revenue_val
            cell["cost"] += cost_val
            cell["sources"].append(source_entry)

        # Compute margin_pct and build final cells structure
        for rk, week_cells in cells.items():
            for wk, c in week_cells.items():
                rev = c["revenue"]
                marg = (rev - c["cost"]) / rev * 100 if rev and rev > 0 else None
                c["margin_pct"] = round(marg, 1) if marg is not None else None

        # Add rows for active employees who have no estimate/engagement data (all 0 hours)
        dc_name_by_id = {str(k): v for k, v in dc_names.items()}
        for emp in active_employees:
            emp_id = emp.get("employee_id") or ""
            emp_name = emp.get("employee_name") or ""
            dc_id = emp.get("delivery_center_id") or ""
            dc_name = emp.get("delivery_center_name") or dc_name_by_id.get(dc_id, "") or ""
            row_key = f"emp|{emp_id}|{emp_name}|{dc_id}"
            if row_key not in row_defs:
                row_defs[row_key] = {
                    "role_id": None,
                    "role_name": None,
                    "employee_id": emp_id or None,
                    "employee_name": emp_name or None,
                    "delivery_center_id": dc_id or None,
                    "delivery_center_name": dc_name or None,
                    "opportunity_id": None,
                    "opportunity_name": None,
                }
                # Ensure cells exist for all weeks with 0
                if row_key not in cells:
                    cells[row_key] = {}
                for w in weeks:
                    wk = w["week_start"]
                    if wk not in cells[row_key]:
                        cells[row_key][wk] = {
                            "hours": 0,
                            "revenue": 0,
                            "cost": 0,
                            "sources": [],
                            "margin_pct": None,
                        }

        # Build rows list (ordered: by delivery_center_name, then employee/role name)
        def sort_key(rk: str) -> tuple:
            rd = row_defs.get(rk, {})
            dc = (rd.get("delivery_center_name") or "") or "—"
            name = (rd.get("employee_name") or rd.get("role_name") or "") or "—"
            return (dc, name)

        rows_out = []
        for rk in sorted(row_defs.keys(), key=sort_key):
            rows_out.append({"row_key": rk, **row_defs[rk]})

        return {
            "weeks": weeks,
            "rows": rows_out,
            "cells": cells,
            "rollup_mode": "granular",
        }

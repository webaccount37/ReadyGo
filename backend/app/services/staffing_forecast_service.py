"""
Staffing forecast service - aggregates estimate and engagement data for the forecast grid.
"""

from datetime import date, timedelta
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories.staffing_forecast_repository import StaffingForecastRepository


def _get_week_start(d: date) -> date:
    """Get the Sunday (week start) for a given date."""
    days_since_sunday = (d.weekday() + 1) % 7
    return d - timedelta(days=days_since_sunday)


DURATION_WEEKS = {1: 4, 3: 13, 6: 26, 12: 52, 13: 56}


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
        period: str = "weekly",
    ) -> dict:
        """
        Build staffing forecast response. Always uses Resource + DC (granular) rollup.
        billable: "true" | "false" | "both"
        duration_months: 3, 6, or 12
        period: "weekly" | "monthly" - weekly shows weeks, monthly aggregates by calendar month
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

        # Fetch billable actuals, holiday/PTO, and utilization date ranges
        billable_actuals = await self.repo.fetch_billable_actuals_weekly_data(
            start_week=start_week,
            end_week=end_week,
            delivery_center_id=delivery_center_id,
            employee_id=employee_id,
        )
        utilization_ranges = await self.repo.fetch_utilization_date_ranges(
            delivery_center_id=delivery_center_id,
            employee_id=employee_id,
        )
        holiday_by_dc_week, pto_by_emp_week = await self.repo.fetch_holiday_and_pto_hours(
            start_week=start_week,
            end_week=end_week,
            delivery_center_id=delivery_center_id,
            employee_id=employee_id,
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
            # For role rows, preserve role_name when merging (don't overwrite with empty)
            existing_role_name = (row_defs.get(row_key) or {}).get("role_name") or ""
            effective_role_name = role_name or existing_role_name
            row_def = {
                "role_id": role_id,
                "role_name": effective_role_name,
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

        # Build billable actuals lookup: (emp_id, dc_id, week_iso) -> hours
        billable_lookup: dict[tuple[str, str, str], float] = {}
        for r in billable_actuals:
            week_iso = r["week_start"].isoformat() if hasattr(r["week_start"], "isoformat") else str(r["week_start"])
            key = (r["employee_id"], r["delivery_center_id"], week_iso)
            billable_lookup[key] = r["billable_hours"]

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
            # Ensure cells exist for all weeks (Hours + Billable Utilization need full coverage
            # regardless of timesheet/plan data, like the Hours metric fix)
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
                        "billable_utilization_pct": None,
                    }

        # Ensure ALL employee rows have cells for every week (like Hours metric).
        # This allows Billable Utilization % to show 0% for in-scope weeks even when no timesheet exists.
        for rk in list(cells.keys()):
            if rk.startswith("emp|"):
                for w in weeks:
                    wk = w["week_start"]
                    if wk not in cells[rk]:
                        cells[rk][wk] = {
                            "hours": 0,
                            "revenue": 0,
                            "cost": 0,
                            "sources": [],
                            "margin_pct": None,
                            "billable_utilization_pct": None,
                        }

        # Compute billable_utilization_pct only for weeks in scope (employee or engagement/estimate date range)
        def _week_in_utilization_scope(week_date: date, ranges: dict) -> bool:
            emp_start = ranges.get("emp_start")
            emp_end = ranges.get("emp_end")
            line_ranges = ranges.get("line_item_ranges", [])
            if emp_start and week_date >= emp_start and (emp_end is None or week_date <= emp_end):
                return True
            for (s, e) in line_ranges:
                if week_date >= s and week_date <= e:
                    return True
            return False

        AVAILABLE_PER_WEEK = 40.0
        for rk, week_cells in cells.items():
            if not rk.startswith("emp|"):
                for c in week_cells.values():
                    c["billable_utilization_pct"] = None
                continue
            parts = rk.split("|")
            if len(parts) < 4:
                for c in week_cells.values():
                    c["billable_utilization_pct"] = None
                continue
            emp_id, dc_id = parts[1], parts[3]
            ranges = utilization_ranges.get(emp_id, {})
            for wk, c in week_cells.items():
                week_date = date.fromisoformat(wk)
                if not _week_in_utilization_scope(week_date, ranges):
                    c["billable_utilization_pct"] = None
                    continue
                billable_hours = billable_lookup.get((emp_id, dc_id, wk), 0.0)
                holiday_hours = holiday_by_dc_week.get((dc_id, wk), 0.0)
                pto_hours = pto_by_emp_week.get((emp_id, wk), 0.0)
                available = AVAILABLE_PER_WEEK - holiday_hours - pto_hours
                c["billable_hours"] = round(billable_hours, 2)
                c["available_hours"] = round(available, 2)
                if available > 0:
                    pct = (billable_hours / available) * 100
                    c["billable_utilization_pct"] = round(pct, 1)
                else:
                    c["billable_utilization_pct"] = None

        # Build rows list (ordered: by delivery_center_name, then employee/role name)
        def sort_key(rk: str) -> tuple:
            rd = row_defs.get(rk, {})
            dc = (rd.get("delivery_center_name") or "") or "—"
            name = (rd.get("employee_name") or rd.get("role_name") or "") or "—"
            return (dc, name)

        rows_out = []
        for rk in sorted(row_defs.keys(), key=sort_key):
            rows_out.append({"row_key": rk, **row_defs[rk]})

        # Monthly aggregation when period is "monthly"
        if period == "monthly":
            from calendar import monthrange

            months: list[dict] = []
            months_seen: set[tuple[int, int]] = set()
            current = start_week
            while current <= end_week:
                ym = (current.year, current.month)
                if ym not in months_seen:
                    months_seen.add(ym)
                    first_of_month = date(current.year, current.month, 1)
                    last_day = monthrange(current.year, current.month)[1]
                    last_of_month = date(current.year, current.month, last_day)
                    months.append({
                        "month_start": first_of_month.isoformat(),
                        "year": current.year,
                        "month": current.month,
                    })
                current += timedelta(days=7)

            month_cells: dict = {}
            for rk, week_cells in cells.items():
                month_cells[rk] = {}
                for wk, c in week_cells.items():
                    d = date.fromisoformat(wk)
                    month_key = f"{d.year}-{d.month:02d}"
                    if month_key not in month_cells[rk]:
                        month_cells[rk][month_key] = {
                            "hours": 0,
                            "revenue": 0,
                            "cost": 0,
                            "margin_pct": None,
                            "billable_utilization_pct": None,
                            "billable_hours_sum": 0.0,
                            "available_hours_sum": 0.0,
                        }
                    mc = month_cells[rk][month_key]
                    mc["hours"] += c["hours"]
                    mc["revenue"] += c["revenue"]
                    mc["cost"] += c["cost"]
                    if c.get("margin_pct") is not None and mc["revenue"] > 0:
                        mc["margin_pct"] = round((mc["revenue"] - mc["cost"]) / mc["revenue"] * 100, 1)

                    if rk.startswith("emp|"):
                        parts = rk.split("|")
                        if len(parts) >= 4:
                            emp_id, dc_id = parts[1], parts[3]
                            ranges = utilization_ranges.get(emp_id, {})
                            week_date = date.fromisoformat(wk)
                            if _week_in_utilization_scope(week_date, ranges):
                                billable_h = billable_lookup.get((emp_id, dc_id, wk), 0.0)
                                holiday_h = holiday_by_dc_week.get((dc_id, wk), 0.0)
                                pto_h = pto_by_emp_week.get((emp_id, wk), 0.0)
                                available = 40.0 - holiday_h - pto_h
                                mc["billable_hours_sum"] += billable_h
                                mc["available_hours_sum"] += available

                for mc in month_cells[rk].values():
                    mc["billable_hours"] = round(mc["billable_hours_sum"], 2)
                    mc["available_hours"] = round(mc["available_hours_sum"], 2)
                    if mc["available_hours_sum"] > 0:
                        mc["billable_utilization_pct"] = round(
                            (mc["billable_hours_sum"] / mc["available_hours_sum"]) * 100, 1
                        )
                    del mc["billable_hours_sum"]
                    del mc["available_hours_sum"]

            return {
                "period": "monthly",
                "months": months,
                "rows": rows_out,
                "cells": month_cells,
                "rollup_mode": "granular",
            }

        return {
            "period": "weekly",
            "weeks": weeks,
            "rows": rows_out,
            "cells": cells,
            "rollup_mode": "granular",
        }

    async def get_employee_utilization(
        self,
        delivery_center_id: Optional[UUID] = None,
    ) -> dict[str, dict]:
        """
        Get MTD and YTD billable utilization % per employee, using the same logic as
        the staffing forecast (billable_hours / available_hours, with holiday/PTO adjustments).
        Returns: { employee_id: { "mtd_utilization_pct": float|None, "ytd_utilization_pct": float|None } }
        """
        today = date.today()
        current_year, current_month = today.year, today.month

        # MTD: current month only
        first_of_month = date(current_year, current_month, 1)
        mtd_start = _get_week_start(first_of_month)
        mtd_forecast = await self.get_forecast(
            start_week=mtd_start,
            delivery_center_id=delivery_center_id,
            employee_id=None,
            billable="both",
            duration_months=2,  # Cover current month (may start in prev month)
            period="monthly",
        )
        mtd_month_key = f"{current_year}-{current_month:02d}"

        # YTD: current month + previous 12 months (13 months total)
        start_year = current_year
        start_month = current_month - 12
        while start_month <= 0:
            start_month += 12
            start_year -= 1
        first_of_ytd = date(start_year, start_month, 1)
        ytd_start = _get_week_start(first_of_ytd)
        ytd_forecast = await self.get_forecast(
            start_week=ytd_start,
            delivery_center_id=delivery_center_id,
            employee_id=None,
            billable="both",
            duration_months=13,
            period="monthly",
        )

        def _aggregate_by_employee(forecast: dict, month_keys: list[str]) -> dict[str, tuple[float, float]]:
            """Returns { emp_id: (billable_hours_sum, available_hours_sum) }"""
            cells = forecast.get("cells", {})
            out: dict[str, tuple[float, float]] = {}
            for rk, period_cells in cells.items():
                if not rk.startswith("emp|"):
                    continue
                parts = rk.split("|")
                if len(parts) < 4:
                    continue
                emp_id = parts[1]
                billable_sum = 0.0
                available_sum = 0.0
                for pk in month_keys:
                    c = period_cells.get(pk)
                    if not c:
                        continue
                    billable_sum += c.get("billable_hours") or 0.0
                    available_sum += c.get("available_hours") or 0.0
                if available_sum > 0 or billable_sum > 0:
                    prev_b, prev_a = out.get(emp_id, (0.0, 0.0))
                    out[emp_id] = (prev_b + billable_sum, prev_a + available_sum)
            return out

        mtd_month_keys = [mtd_month_key]

        ytd_month_keys: list[str] = []
        if ytd_forecast.get("months"):
            ytd_month_keys = [f"{m['year']}-{m['month']:02d}" for m in ytd_forecast["months"]]

        mtd_agg = _aggregate_by_employee(mtd_forecast, mtd_month_keys)
        ytd_agg = _aggregate_by_employee(ytd_forecast, ytd_month_keys)

        # Build result: all employee IDs from either aggregation
        all_emp_ids = set(mtd_agg.keys()) | set(ytd_agg.keys())
        result: dict[str, dict] = {}
        for emp_id in all_emp_ids:
            mtd_b, mtd_a = mtd_agg.get(emp_id, (0.0, 0.0))
            ytd_b, ytd_a = ytd_agg.get(emp_id, (0.0, 0.0))
            mtd_pct = round((mtd_b / mtd_a) * 100, 1) if mtd_a > 0 else None
            ytd_pct = round((ytd_b / ytd_a) * 100, 1) if ytd_a > 0 else None
            result[emp_id] = {
                "mtd_utilization_pct": mtd_pct,
                "ytd_utilization_pct": ytd_pct,
            }
        return result

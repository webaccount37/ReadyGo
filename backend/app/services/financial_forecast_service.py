"""Financial Forecast orchestration: SQL aggregates, overrides, formulas, month metadata."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Iterable
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories.financial_forecast_repository import FinancialForecastRepository, MonthBucket
from app.financial_forecast.definition import (
    FINANCIAL_FORECAST_DEFINITION_VERSION,
    build_static_row_definitions,
    definition_response,
    get_formula_sum_keys_for_total_expenses,
)
from app.models.financial_forecast import (
    FinancialForecastChangeEvent,
    FinancialForecastExpenseCell,
    FinancialForecastExpenseLine,
    FinancialForecastLineOverride,
)
def _week_start(d: date) -> date:
    days_since_sunday = (d.weekday() + 1) % 7
    return d - timedelta(days=days_since_sunday)


def _month_key(d: date) -> str:
    return f"{d.year}-{d.month:02d}"


def _iter_month_starts(range_start: date, range_end: date) -> list[date]:
    out: list[date] = []
    d = date(range_start.year, range_start.month, 1)
    end_m = date(range_end.year, range_end.month, 1)
    while d <= end_m:
        out.append(d)
        if d.month == 12:
            d = date(d.year + 1, 1, 1)
        else:
            d = date(d.year, d.month + 1, 1)
    return out


class FinancialForecastService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = FinancialForecastRepository(session)

    async def get_definition(self) -> dict[str, Any]:
        return definition_response()

    async def get_forecast(
        self,
        *,
        delivery_center_id: UUID,
        start_week: date,
        end_week: date,
        metric: str,
    ) -> dict[str, Any]:
        start_week = _week_start(start_week)
        end_week = _week_start(end_week)
        if end_week < start_week:
            start_week, end_week = end_week, start_week

        range_start = start_week
        range_end = end_week + timedelta(days=6)

        static_defs = build_static_row_definitions()
        auto_row_keys = {r["row_key"] for r in static_defs if r.get("auto_row")}
        manual_static_keys = {r["row_key"] for r in static_defs if r.get("manual_expense")}

        await self._ensure_static_expense_lines(delivery_center_id, manual_static_keys, static_defs)

        dc_currency = await self.repo.get_delivery_center_currency(delivery_center_id) or "USD"

        raw = await self.repo.fetch_auto_grid(delivery_center_id, range_start, range_end, metric)
        month_starts = _iter_month_starts(range_start, range_end)
        month_keys = [_month_key(m) for m in month_starts]

        overrides = await self.repo.fetch_overrides(delivery_center_id, month_starts)

        expense_lines = await self.repo.fetch_expense_lines(delivery_center_id)
        line_ids = [ln.id for ln in expense_lines]
        exp_cells = await self.repo.fetch_expense_cells(delivery_center_id, line_ids, month_starts) if line_ids else {}

        # month composition from auto buckets
        comp_a: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
        comp_f: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
        for rk, months in raw.items():
            if rk not in auto_row_keys:
                continue
            for mk, b in months.items():
                comp_a[mk] += b.actuals_weight
                comp_f[mk] += b.forecast_weight

        months_out = []
        for ms in month_starts:
            mk = _month_key(ms)
            a, f = comp_a[mk], comp_f[mk]
            if a > 0 and f > 0:
                comp = "mixed"
            elif a > 0:
                comp = "actuals_only"
            else:
                comp = "forecast_only"
            months_out.append(
                {
                    "month_key": mk,
                    "month_start": ms.isoformat(),
                    "year": ms.year,
                    "month": ms.month,
                    "composition": comp,
                }
            )

        cells: dict[str, dict[str, dict[str, Any]]] = defaultdict(lambda: defaultdict(dict))

        # Auto values + overrides
        for rk in auto_row_keys:
            for ms in month_starts:
                mk = _month_key(ms)
                b = raw.get(rk, {}).get(mk) or MonthBucket()
                auto_val = float(b.amount)
                okey = (rk, ms)
                ov = overrides.get(okey)
                if ov is not None:
                    cells[rk][mk] = {
                        "value": float(ov),
                        "auto_value": auto_val,
                        "is_manual": True,
                        "source": "override",
                    }
                else:
                    cells[rk][mk] = {
                        "value": auto_val,
                        "auto_value": auto_val,
                        "is_manual": False,
                        "source": "auto",
                    }

        # Static manual expense rows (stored as synthetic expense lines with row_key mapping)
        # Persist static keys in financial_forecast_expense_lines with parent_group_code matching row_key
        for rk in manual_static_keys:
            line = next((ln for ln in expense_lines if ln.name == f"__static__:{rk}"), None)
            for ms in month_starts:
                mk = _month_key(ms)
                amt = 0.0
                if line is not None:
                    amt = float(exp_cells.get((line.id, ms), 0) or 0)
                cells[rk][mk] = {
                    "value": amt,
                    "auto_value": None,
                    "is_manual": True,
                    "source": "manual_expense",
                }

        # Custom expense lines (user-created)
        rows_out: list[dict[str, Any]] = []
        for rd in static_defs:
            eid = None
            if rd.get("manual_expense"):
                sln = next((ln for ln in expense_lines if ln.name == f"__static__:{rd['row_key']}"), None)
                if sln is not None:
                    eid = str(sln.id)
            rows_out.append(
                {
                    "row_key": rd["row_key"],
                    "label": rd["label"],
                    "kind": rd["kind"],
                    "parent_row_key": rd.get("parent_row_key"),
                    "auto_row": rd.get("auto_row", False),
                    "manual_expense": rd.get("manual_expense", False),
                    "expense_line_id": eid,
                }
            )

        for ln in expense_lines:
            if ln.name.startswith("__static__:"):
                continue
            rk = f"expense:{ln.id}"
            rows_out.append(
                {
                    "row_key": rk,
                    "label": ln.name,
                    "kind": "line",
                    "parent_row_key": ln.parent_group_code,
                    "auto_row": False,
                    "manual_expense": True,
                    "expense_line_id": str(ln.id),
                }
            )
            for ms in month_starts:
                mk = _month_key(ms)
                amt = float(exp_cells.get((ln.id, ms), 0) or 0)
                cells[rk][mk] = {
                    "value": amt,
                    "auto_value": None,
                    "is_manual": True,
                    "source": "manual_expense",
                }

        # Formulas
        self._apply_formulas(cells, month_keys, expense_lines)

        return {
            "definition_version": FINANCIAL_FORECAST_DEFINITION_VERSION,
            "currency": dc_currency,
            "metric": metric,
            "delivery_center_id": str(delivery_center_id),
            "range_start": range_start.isoformat(),
            "range_end": range_end.isoformat(),
            "months": months_out,
            "rows": rows_out,
            "cells": {k: dict(v) for k, v in cells.items()},
        }

    def _cell_val(self, cells: dict, rk: str, mk: str) -> float:
        return float(cells.get(rk, {}).get(mk, {}).get("value", 0) or 0)

    def _apply_formulas(
        self,
        cells: dict[str, dict[str, dict[str, Any]]],
        month_keys: list[str],
        expense_lines: list[FinancialForecastExpenseLine],
    ) -> None:
        static_defs = build_static_row_definitions()
        te_keys = list(get_formula_sum_keys_for_total_expenses(static_defs))
        custom_expense_rks = [f"expense:{ln.id}" for ln in expense_lines if not ln.name.startswith("__static__:")]
        total_expense_keys = te_keys + custom_expense_rks

        for mk in month_keys:

            def s(keys: Iterable[str]) -> float:
                return sum(self._cell_val(cells, k, mk) for k in keys)

            cells["total_income"][mk] = {
                "value": s(["consulting_fee", "consulting_fee_expenses", "consulting_fee_intercompany"]),
                "auto_value": None,
                "is_manual": False,
                "source": "auto",
            }
            cells["total_cogs"][mk] = {
                "value": s(["cogs_delivery", "cogs_intercompany_labor", "cogs_subcontract"]),
                "auto_value": None,
                "is_manual": False,
                "source": "auto",
            }
            ti, tc = self._cell_val(cells, "total_income", mk), self._cell_val(cells, "total_cogs", mk)
            cells["gross_profit"][mk] = {
                "value": ti - tc,
                "auto_value": None,
                "is_manual": False,
                "source": "auto",
            }
            cells["gross_profit_pct"][mk] = {
                "value": round((ti - tc) / ti * 100, 2) if ti else 0.0,
                "auto_value": None,
                "is_manual": False,
                "source": "auto",
            }

            cells["expense_total_general_business"][mk] = {
                "value": s(["expense_bank_fees", "expense_memberships"]),
                "auto_value": None,
                "is_manual": False,
                "source": "auto",
            }
            cells["expense_total_interest_paid"][mk] = {
                "value": s(["expense_business_loan_interest"]),
                "auto_value": None,
                "is_manual": False,
                "source": "auto",
            }
            cells["expense_total_legal_accounting"][mk] = {
                "value": s(["expense_legal_fees", "expense_accounting_fees"]),
                "auto_value": None,
                "is_manual": False,
                "source": "auto",
            }
            cells["expense_total_office"][mk] = {
                "value": s(["expense_software"]),
                "auto_value": None,
                "is_manual": False,
                "source": "auto",
            }
            cells["expense_total_payroll"][mk] = {
                "value": s(
                    [
                        "expense_allocated_cogs_delivery",
                        "expense_401k",
                        "expense_superannuation",
                        "expense_ph_retirement",
                        "expense_insurance",
                        "expense_salaries_wages",
                    ]
                ),
                "auto_value": None,
                "is_manual": False,
                "source": "auto",
            }
            cells["expense_total_employee"][mk] = {
                "value": s(
                    [
                        "expense_airfare",
                        "expense_hotels",
                        "expense_taxis",
                        "expense_meals",
                        "expense_vehicle_gas",
                        "expense_vehicle_rental",
                    ]
                ),
                "auto_value": None,
                "is_manual": False,
                "source": "auto",
            }

            cells["total_expenses"][mk] = {
                "value": s(total_expense_keys),
                "auto_value": None,
                "is_manual": False,
                "source": "auto",
            }
            gp = self._cell_val(cells, "gross_profit", mk)
            te = self._cell_val(cells, "total_expenses", mk)
            cells["net_operating_income"][mk] = {
                "value": gp - te,
                "auto_value": None,
                "is_manual": False,
                "source": "auto",
            }
            cells["total_other_income"][mk] = {
                "value": s(["other_interest_earned"]),
                "auto_value": None,
                "is_manual": False,
                "source": "auto",
            }
            noi = self._cell_val(cells, "net_operating_income", mk)
            toi = self._cell_val(cells, "total_other_income", mk)
            cells["net_income"][mk] = {
                "value": noi + toi,
                "auto_value": None,
                "is_manual": False,
                "source": "auto",
            }
            ni, ti2 = self._cell_val(cells, "net_income", mk), self._cell_val(cells, "total_income", mk)
            cells["net_income_pct"][mk] = {
                "value": round(ni / ti2 * 100, 2) if ti2 else 0.0,
                "auto_value": None,
                "is_manual": False,
                "source": "auto",
            }

    async def apply_bulk_patch(
        self,
        *,
        delivery_center_id: UUID,
        employee_id: UUID,
        body: dict[str, Any],
    ) -> None:
        from app.schemas.financial_forecast import FinancialForecastBulkPatch

        patch = FinancialForecastBulkPatch.model_validate(body)
        corr = patch.correlation_id

        for oc in patch.expense_cells:
            q = select(FinancialForecastExpenseLine).where(
                FinancialForecastExpenseLine.id == oc.line_id,
                FinancialForecastExpenseLine.delivery_center_id == delivery_center_id,
            )
            line = (await self.session.execute(q)).scalar_one_or_none()
            if not line:
                continue
            if oc.amount is None:
                continue
            q2 = select(FinancialForecastExpenseCell).where(
                FinancialForecastExpenseCell.line_id == oc.line_id,
                FinancialForecastExpenseCell.month_start_date == oc.month_start_date,
            )
            cell = (await self.session.execute(q2)).scalar_one_or_none()
            old = float(cell.amount) if cell else None
            if cell:
                cell.amount = oc.amount
            else:
                self.session.add(
                    FinancialForecastExpenseCell(
                        line_id=oc.line_id,
                        month_start_date=oc.month_start_date,
                        amount=oc.amount,
                        updated_by_employee_id=employee_id,
                    )
                )
            self.session.add(
                FinancialForecastChangeEvent(
                    delivery_center_id=delivery_center_id,
                    employee_id=employee_id,
                    action="expense_cell",
                    payload={"line_id": str(oc.line_id), "month": oc.month_start_date.isoformat(), "old": old, "new": oc.amount},
                    correlation_id=corr,
                )
            )

        for ov in patch.overrides:
            if ov.amount is None:
                q = select(FinancialForecastLineOverride).where(
                    FinancialForecastLineOverride.delivery_center_id == delivery_center_id,
                    FinancialForecastLineOverride.row_key == ov.row_key,
                    FinancialForecastLineOverride.month_start_date == ov.month_start_date,
                )
                existing = (await self.session.execute(q)).scalar_one_or_none()
                if existing:
                    await self.session.delete(existing)
                self.session.add(
                    FinancialForecastChangeEvent(
                        delivery_center_id=delivery_center_id,
                        employee_id=employee_id,
                        action="override_clear",
                        payload={"row_key": ov.row_key, "month": ov.month_start_date.isoformat()},
                        correlation_id=corr,
                    )
                )
            else:
                q = select(FinancialForecastLineOverride).where(
                    FinancialForecastLineOverride.delivery_center_id == delivery_center_id,
                    FinancialForecastLineOverride.row_key == ov.row_key,
                    FinancialForecastLineOverride.month_start_date == ov.month_start_date,
                )
                existing = (await self.session.execute(q)).scalar_one_or_none()
                if existing:
                    old = float(existing.amount)
                    existing.amount = ov.amount
                    existing.updated_by_employee_id = employee_id
                else:
                    self.session.add(
                        FinancialForecastLineOverride(
                            delivery_center_id=delivery_center_id,
                            row_key=ov.row_key,
                            month_start_date=ov.month_start_date,
                            amount=ov.amount,
                            created_by_employee_id=employee_id,
                            updated_by_employee_id=employee_id,
                        )
                    )
                    old = None
                self.session.add(
                    FinancialForecastChangeEvent(
                        delivery_center_id=delivery_center_id,
                        employee_id=employee_id,
                        action="override_set",
                        payload={"row_key": ov.row_key, "month": ov.month_start_date.isoformat(), "old": old, "new": ov.amount},
                        correlation_id=corr,
                    )
                )

        await self.session.commit()

    async def create_expense_line(
        self,
        *,
        delivery_center_id: UUID,
        employee_id: UUID,
        parent_group_code: str,
        name: str,
    ) -> FinancialForecastExpenseLine:
        from app.financial_forecast.definition import ALLOWED_EXPENSE_PARENT_GROUP_CODES

        if parent_group_code not in ALLOWED_EXPENSE_PARENT_GROUP_CODES:
            raise ValueError("Invalid parent_group_code")
        max_sort = await self.session.scalar(
            select(func.max(FinancialForecastExpenseLine.sort_order)).where(
                FinancialForecastExpenseLine.delivery_center_id == delivery_center_id,
                FinancialForecastExpenseLine.parent_group_code == parent_group_code,
            )
        )
        ln = FinancialForecastExpenseLine(
            delivery_center_id=delivery_center_id,
            parent_group_code=parent_group_code,
            name=name,
            sort_order=(max_sort or 0) + 1,
            created_by_employee_id=employee_id,
        )
        self.session.add(ln)
        self.session.add(
            FinancialForecastChangeEvent(
                delivery_center_id=delivery_center_id,
                employee_id=employee_id,
                action="line_create",
                payload={"parent_group_code": parent_group_code, "name": name},
            )
        )
        await self.session.commit()
        await self.session.refresh(ln)
        return ln

    async def rename_expense_line(
        self,
        *,
        delivery_center_id: UUID,
        employee_id: UUID,
        line_id: UUID,
        name: str,
    ) -> None:
        q = select(FinancialForecastExpenseLine).where(
            FinancialForecastExpenseLine.id == line_id,
            FinancialForecastExpenseLine.delivery_center_id == delivery_center_id,
        )
        ln = (await self.session.execute(q)).scalar_one_or_none()
        if not ln or ln.name.startswith("__static__:"):
            raise ValueError("Line not found")
        old = ln.name
        ln.name = name
        self.session.add(
            FinancialForecastChangeEvent(
                delivery_center_id=delivery_center_id,
                employee_id=employee_id,
                action="line_rename",
                payload={"line_id": str(line_id), "old": old, "new": name},
            )
        )
        await self.session.commit()

    async def _ensure_static_expense_lines(
        self,
        delivery_center_id: UUID,
        manual_static_keys: set[str],
        static_defs: list[dict[str, Any]],
    ) -> None:
        row_by_key = {r["row_key"]: r for r in static_defs}
        existing = await self.repo.fetch_expense_lines(delivery_center_id)
        existing_static = {ln.name for ln in existing if ln.name.startswith("__static__:")}
        for rk in manual_static_keys:
            name = f"__static__:{rk}"
            if name in existing_static:
                continue
            pg = (row_by_key.get(rk) or {}).get("parent_group_code") or "expense"
            self.session.add(
                FinancialForecastExpenseLine(
                    delivery_center_id=delivery_center_id,
                    parent_group_code=pg,
                    name=name,
                    sort_order=0,
                )
            )
        await self.session.flush()

    async def list_history(
        self,
        *,
        delivery_center_id: UUID,
        skip: int,
        limit: int,
    ) -> tuple[list[FinancialForecastChangeEvent], int]:
        total = await self.session.scalar(
            select(func.count(FinancialForecastChangeEvent.id)).where(
                FinancialForecastChangeEvent.delivery_center_id == delivery_center_id
            )
        )
        q = (
            select(FinancialForecastChangeEvent)
            .where(FinancialForecastChangeEvent.delivery_center_id == delivery_center_id)
            .order_by(FinancialForecastChangeEvent.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        rows = list((await self.session.execute(q)).scalars().all())
        return rows, int(total or 0)

"""
Canonical Financial Forecast P&L row tree (versioned).
Single source of truth for API /definition, UI, and Excel layout.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal, TypedDict


FINANCIAL_FORECAST_DEFINITION_VERSION = 1


class RowKind(str, Enum):
    GROUP = "group"
    LINE = "line"  # data line (auto-calculated or manual expense)
    TOTAL = "total"
    PERCENT = "percent"


class RowDef(TypedDict, total=False):
    row_key: str
    label: str
    kind: str
    parent_row_key: str | None
    """For expense custom lines, parent_group_code is the anchor under Expenses."""
    parent_group_code: str | None
    auto_row: bool  # True if backend SQL supplies value (may be overridden by user)
    manual_expense: bool  # True if user must type all months (custom or static manual)
    formula: Literal["sum", "gross_profit", "gross_profit_pct", "net_operating_income", "net_income", "net_income_pct"] | None
    sum_of: list[str]  # row_keys for formula sum


def _g(
    row_key: str,
    label: str,
    *,
    parent: str | None = None,
    kind: RowKind = RowKind.GROUP,
    parent_group_code: str | None = None,
) -> RowDef:
    return {
        "row_key": row_key,
        "label": label,
        "kind": kind.value,
        "parent_row_key": parent,
        "parent_group_code": parent_group_code,
        "auto_row": False,
        "manual_expense": False,
        "formula": None,
    }


def _a(row_key: str, label: str, *, parent: str, parent_group_code: str | None = None) -> RowDef:
    return {
        "row_key": row_key,
        "label": label,
        "kind": RowKind.LINE.value,
        "parent_row_key": parent,
        "parent_group_code": parent_group_code,
        "auto_row": True,
        "manual_expense": False,
        "formula": None,
    }


def _m(row_key: str, label: str, *, parent: str, parent_group_code: str) -> RowDef:
    """Static manual expense line (user enters amounts)."""
    return {
        "row_key": row_key,
        "label": label,
        "kind": RowKind.LINE.value,
        "parent_row_key": parent,
        "parent_group_code": parent_group_code,
        "auto_row": False,
        "manual_expense": True,
        "formula": None,
    }


def _t(row_key: str, label: str, formula: str, sum_of: list[str], *, parent: str | None = None) -> RowDef:
    return {
        "row_key": row_key,
        "label": label,
        "kind": RowKind.TOTAL.value if formula != "gross_profit_pct" and formula != "net_income_pct" else RowKind.PERCENT.value,
        "parent_row_key": parent,
        "parent_group_code": None,
        "auto_row": False,
        "manual_expense": False,
        "formula": formula,
        "sum_of": sum_of,
    }


# Parent group codes allowed for user-created expense lines (must match parent_row_key's expense_* codes)
ALLOWED_EXPENSE_PARENT_GROUP_CODES: frozenset[str] = frozenset(
    {
        "expense",
        "expense_general_business",
        "expense_interest_paid",
        "expense_legal_accounting",
        "expense_office",
        "expense_payroll",
        "expense_employee",
    }
)


def build_static_row_definitions() -> list[RowDef]:
    rows: list[RowDef] = []

    # Income
    rows.append(_g("income", "Income"))
    rows.append(_a("consulting_fee", "Consulting Fee", parent="income"))
    rows.append(_a("consulting_fee_expenses", "Consulting Fee (Expenses)", parent="income"))
    rows.append(_a("consulting_fee_intercompany", "Consulting Fee (Intercompany)", parent="income"))
    rows.append(
        _t(
            "total_income",
            "Total Income",
            "sum",
            ["consulting_fee", "consulting_fee_expenses", "consulting_fee_intercompany"],
            parent="income",
        )
    )

    # COGS
    rows.append(_g("cogs", "Cost of Goods Sold"))
    rows.append(_a("cogs_delivery", "Cost of Goods Sold (Delivery)", parent="cogs"))
    rows.append(_a("cogs_intercompany_labor", "Cost of Labor (Intercompany)", parent="cogs"))
    rows.append(_a("cogs_subcontract", "Cost of Labor (Subcontract)", parent="cogs"))
    rows.append(
        _t(
            "total_cogs",
            "Total Cost of Goods Sold",
            "sum",
            ["cogs_delivery", "cogs_intercompany_labor", "cogs_subcontract"],
            parent="cogs",
        )
    )
    rows.append(_t("gross_profit", "Gross Profit", "gross_profit", ["total_income", "total_cogs"], parent="cogs"))
    rows.append(_t("gross_profit_pct", "Gross Profit %", "gross_profit_pct", ["gross_profit", "total_income"], parent="cogs"))

    # Expenses (manual lines — user enters; totals are formulas)
    rows.append(_g("expense", "Expenses", parent_group_code="expense"))
    rows.append(_m("expense_entertainment", "Entertainment", parent="expense", parent_group_code="expense"))

    rows.append(_g("expense_general_business", "General Business Expenses", parent="expense", parent_group_code="expense_general_business"))
    rows.append(_m("expense_bank_fees", "Bank Fees & Service Charges", parent="expense_general_business", parent_group_code="expense_general_business"))
    rows.append(_m("expense_memberships", "Memberships & Subscriptions", parent="expense_general_business", parent_group_code="expense_general_business"))
    rows.append(
        _t(
            "expense_total_general_business",
            "Total General Business Expenses",
            "sum",
            ["expense_bank_fees", "expense_memberships"],
            parent="expense_general_business",
        )
    )

    rows.append(_g("expense_interest_paid", "Iterest Paid", parent="expense", parent_group_code="expense_interest_paid"))
    rows.append(_m("expense_business_loan_interest", "Business Load Interest", parent="expense_interest_paid", parent_group_code="expense_interest_paid"))
    rows.append(
        _t(
            "expense_total_interest_paid",
            "Total Interest Paid",
            "sum",
            ["expense_business_loan_interest"],
            parent="expense_interest_paid",
        )
    )

    rows.append(_g("expense_legal_accounting", "Legal & Accounting Services", parent="expense", parent_group_code="expense_legal_accounting"))
    rows.append(_m("expense_legal_fees", "Legal Fees", parent="expense_legal_accounting", parent_group_code="expense_legal_accounting"))
    rows.append(_m("expense_accounting_fees", "Accounting Fees", parent="expense_legal_accounting", parent_group_code="expense_legal_accounting"))
    rows.append(
        _t(
            "expense_total_legal_accounting",
            "Total Legal & Accounting Services",
            "sum",
            ["expense_legal_fees", "expense_accounting_fees"],
            parent="expense_legal_accounting",
        )
    )

    rows.append(_g("expense_office", "Office Expenses", parent="expense", parent_group_code="expense_office"))
    rows.append(_m("expense_software", "Software & Applications", parent="expense_office", parent_group_code="expense_office"))
    rows.append(
        _t(
            "expense_total_office",
            "Total Office Expenses",
            "sum",
            ["expense_software"],
            parent="expense_office",
        )
    )

    rows.append(_m("expense_general_admin", "General Administrative Expenses", parent="expense", parent_group_code="expense"))

    rows.append(_g("expense_payroll", "Payroll Expenses", parent="expense", parent_group_code="expense_payroll"))
    rows.append(_m("expense_allocated_cogs_delivery", "Allocated COGS (Delivery)", parent="expense_payroll", parent_group_code="expense_payroll"))
    rows.append(_m("expense_401k", "401K Match", parent="expense_payroll", parent_group_code="expense_payroll"))
    rows.append(_m("expense_superannuation", "Superannuation", parent="expense_payroll", parent_group_code="expense_payroll"))
    rows.append(_m("expense_ph_retirement", "PH Retirement", parent="expense_payroll", parent_group_code="expense_payroll"))
    rows.append(_m("expense_insurance", "Insurance", parent="expense_payroll", parent_group_code="expense_payroll"))
    rows.append(_m("expense_salaries_wages", "Salaries & Wages", parent="expense_payroll", parent_group_code="expense_payroll"))
    rows.append(
        _t(
            "expense_total_payroll",
            "Total Payroll Expenses",
            "sum",
            [
                "expense_allocated_cogs_delivery",
                "expense_401k",
                "expense_superannuation",
                "expense_ph_retirement",
                "expense_insurance",
                "expense_salaries_wages",
            ],
            parent="expense_payroll",
        )
    )

    rows.append(_m("expense_sales_marketing", "Sales & Marketing", parent="expense", parent_group_code="expense"))

    rows.append(_g("expense_employee", "Employee Expenses", parent="expense", parent_group_code="expense_employee"))
    rows.append(_m("expense_airfare", "Airfare", parent="expense_employee", parent_group_code="expense_employee"))
    rows.append(_m("expense_hotels", "Hotels", parent="expense_employee", parent_group_code="expense_employee"))
    rows.append(_m("expense_taxis", "Taxis or Shared Rides", parent="expense_employee", parent_group_code="expense_employee"))
    rows.append(_m("expense_meals", "Meals", parent="expense_employee", parent_group_code="expense_employee"))
    rows.append(_m("expense_vehicle_gas", "Vehicle Gas & Fuel", parent="expense_employee", parent_group_code="expense_employee"))
    rows.append(_m("expense_vehicle_rental", "Vehicle Rental", parent="expense_employee", parent_group_code="expense_employee"))
    rows.append(
        _t(
            "expense_total_employee",
            "Total Employee Expenses",
            "sum",
            [
                "expense_airfare",
                "expense_hotels",
                "expense_taxis",
                "expense_meals",
                "expense_vehicle_gas",
                "expense_vehicle_rental",
            ],
            parent="expense_employee",
        )
    )

    # Total Expenses = sum of all expense leaf manual keys + subtotals + direct expense children
    expense_leaf_and_subtotals = [
        "expense_entertainment",
        "expense_total_general_business",
        "expense_total_interest_paid",
        "expense_total_legal_accounting",
        "expense_total_office",
        "expense_general_admin",
        "expense_total_payroll",
        "expense_sales_marketing",
        "expense_total_employee",
    ]
    rows.append(_t("total_expenses", "Total Expenses", "sum", expense_leaf_and_subtotals, parent="expense"))

    rows.append(
        _t(
            "net_operating_income",
            "Net Operating Income",
            "net_operating_income",
            ["gross_profit", "total_expenses"],
        )
    )

    rows.append(_g("other_income", "Other Income"))
    rows.append(_m("other_interest_earned", "Interest Earned", parent="other_income", parent_group_code="other_income"))
    rows.append(_t("total_other_income", "Total Other Income", "sum", ["other_interest_earned"], parent="other_income"))

    rows.append(_t("net_income", "Net Income", "net_income", ["net_operating_income", "total_other_income"]))
    rows.append(_t("net_income_pct", "Net Income %", "net_income_pct", ["net_income", "total_income"]))

    return rows


def get_formula_sum_keys_for_total_expenses(static_rows: list[RowDef]) -> list[str]:
    """Keys that feed Total Expenses before dynamic custom lines are inserted."""
    te = next(r for r in static_rows if r["row_key"] == "total_expenses")
    return list(te.get("sum_of", []))


def definition_response() -> dict[str, Any]:
    rows = build_static_row_definitions()
    return {
        "version": FINANCIAL_FORECAST_DEFINITION_VERSION,
        "rows": rows,
        "allowed_expense_parent_group_codes": sorted(ALLOWED_EXPENSE_PARENT_GROUP_CODES),
    }

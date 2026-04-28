"""Map Replicon CSV headers to canonical fields (fuzzy)."""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from app.integrations.replicon.models import RawTimeRow


def _norm_header(h: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (h or "").lower()).strip()


def _build_header_index(headers: list[str]) -> dict[str, str]:
    """Map normalized header -> original header key."""
    return {_norm_header(h): h for h in headers if h}


def _pick(index: dict[str, str], *candidates: str) -> str | None:
    for c in candidates:
        k = _norm_header(c)
        if k in index:
            return index[k]
    for k, orig in index.items():
        for c in candidates:
            if _norm_header(c) in k or k in _norm_header(c):
                return orig
    return None


def _parse_date(val: str) -> date | None:
    s = (val or "").strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s[:10], fmt).date()
        except ValueError:
            continue
    try:
        # ISO with time
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def _parse_decimal(val: str) -> Decimal:
    s = (val or "").strip().replace(",", "")
    if not s:
        return Decimal("0")
    try:
        return Decimal(s)
    except InvalidOperation:
        return Decimal("0")


def _parse_bool(val: str) -> bool:
    s = (val or "").strip().lower()
    return s in ("1", "true", "yes", "y", "billable", "b")


def _parse_optional_bool(val: str) -> bool | None:
    """Empty / unknown → None (caller does not override). Explicit false strings → False."""
    s = (val or "").strip().lower()
    if not s:
        return None
    if s in ("1", "true", "yes", "y", "billable", "b"):
        return True
    if s in ("0", "false", "no", "n", "non-billable", "nonbillable", "non billable"):
        return False
    return None


def _is_approved_row(row: dict[str, str], approval_col: str | None) -> bool:
    if not approval_col:
        # If no approval column, accept row (caller may filter elsewhere)
        return True
    v = (row.get(approval_col) or "").strip().lower()
    if not v:
        return False
    return "approved" in v or v in ("2", "3")  # some systems use numeric states


def dict_rows_to_raw(
    headers: list[str],
    rows: list[dict[str, str]],
) -> list[RawTimeRow]:
    idx = _build_header_index(headers)
    login_c = _pick(idx, "login name", "username", "user name", "user", "employee login", "resource")
    date_c = _pick(
        idx,
        "entry date",
        "date",
        "time entry date",
        "work date",
        "timesheet entry date",
    )
    hours_c = _pick(
        idx,
        "duration",
        "hours",
        "total hours",
        "work hours",
        "time worked",
        "net hours",
    )
    client_c = _pick(idx, "client", "client name", "customer")
    project_c = _pick(idx, "project", "project name", "task name", "project full name")
    bill_c = _pick(idx, "billable", "billing type", "is billable")
    inv_c = _pick(
        idx,
        "invoice customer",
        "invoice to customer",
        "invoice client",
        "bill to customer",
    )
    res_bill_c = _pick(idx, "resource billable", "employee billable", "user billable")
    appr_c = _pick(
        idx,
        "timesheet status",
        "approval status",
        "status",
        "timesheet approval status",
        "entry status",
    )

    if not login_c or not date_c or not hours_c:
        raise ValueError(
            f"Could not infer required CSV columns from headers: {headers}. "
            "Need login, date, and hours columns."
        )

    out: list[RawTimeRow] = []
    for row in rows:
        login = (row.get(login_c) or "").strip()
        d = _parse_date(row.get(date_c) or "")
        if not login or not d:
            continue
        if not _is_approved_row(row, appr_c):
            continue
        h = _parse_decimal(row.get(hours_c) or "0")
        if h <= 0:
            continue
        bill_raw = _parse_bool(row.get(bill_c) or "") if bill_c else True
        inv = _parse_optional_bool(row.get(inv_c) or "") if inv_c else None
        res_b = _parse_optional_bool(row.get(res_bill_c) or "") if res_bill_c else None
        billable = bill_raw and (inv is not False) and (res_b is not False)
        out.append(
            RawTimeRow(
                login=login,
                entry_date=d,
                hours=h,
                client_name=(row.get(client_c) or "").strip() if client_c else "",
                project_name=(row.get(project_c) or "").strip() if project_c else "",
                billable=billable,
                approved=True,
            )
        )
    return out

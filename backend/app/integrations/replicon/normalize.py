"""Filter, map, and aggregate Replicon rows."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from datetime import date, timedelta
from uuid import UUID

from app.integrations.replicon.mapping_workbook import (
    MappingRecord,
    MappingRule,
    effective_mapping_candidate_window,
    pick_mapping_record_for_entry_date,
)
from app.models.employee import EmployeeStatus
from app.integrations.replicon.models import (
    AggregatedEntryKey,
    AggregatedHours,
    CortexMappedRow,
    RawTimeRow,
)

EXCLUDED_CLIENT = "bjc pcl"
EXCLUDED_PROJECT = "global accounting and finance"


def email_local_part(email: str) -> str:
    e = (email or "").strip().lower()
    if "@" in e:
        return e.split("@", 1)[0].strip()
    return e


def week_start_sunday(d: date) -> date:
    days_since_sunday = (d.weekday() + 1) % 7
    return d - timedelta(days=days_since_sunday)


def week_end_saturday(d: date) -> date:
    """Inclusive Saturday of the Sunday-based week containing ``d``."""
    return week_start_sunday(d) + timedelta(days=6)


def merge_line_item_date_bounds_for_replicon_import(
    cur_s: date | None,
    cur_e: date | None,
    min_d: date,
    max_d: date,
    approved_week_starts: list[date],
) -> tuple[date, date]:
    """Merge current line dates, import work-date envelope, and approved timesheet weeks.

    ``EngagementService.update_line_item`` requires start/end to fully cover each approved
    week (Sunday through Saturday). Import min/max work days are expanded to that envelope
    before merging with ``cur_s``/``cur_e`` and any ``approved_week_starts``.
    """
    imp_start = week_start_sunday(min_d)
    imp_end = week_end_saturday(max_d)
    starts: list[date] = [imp_start]
    ends: list[date] = [imp_end]
    if cur_s is not None:
        starts.append(cur_s)
    if cur_e is not None:
        ends.append(cur_e)
    if approved_week_starts:
        starts.append(min(approved_week_starts))
        ends.append(max(w + timedelta(days=6) for w in approved_week_starts))
    return (min(starts), max(ends))


def should_exclude_raw(row: RawTimeRow) -> bool:
    c = row.client_name.strip().lower()
    p = row.project_name.strip().lower()
    if c == EXCLUDED_CLIENT:
        return True
    if p == EXCLUDED_PROJECT:
        return True
    return False


def map_raw_row(
    row: RawTimeRow,
    mapping: dict[tuple[str, str], MappingRule],
    employee_id: UUID | None = None,
) -> CortexMappedRow | None:
    if should_exclude_raw(row):
        return None
    key = (row.project_name.strip().lower(), row.client_name.strip().lower())
    rule = mapping.get(key)
    if not rule:
        return None
    rec = pick_mapping_record_for_entry_date(rule, row.entry_date, employee_id)
    if not rec:
        return None
    if rec.cortex_type == "ENGAGEMENT" and not rec.engagement_id:
        return None
    return CortexMappedRow(
        login=row.login,
        entry_date=row.entry_date,
        hours=row.hours,
        billable=row.billable,
        cortex_type=rec.cortex_type,
        account_id=rec.account_id,
        opportunity_id=rec.opportunity_id,
        engagement_id=rec.engagement_id,
        phase_id=rec.phase_id,
        source_excel_row=row.source_excel_row,
    )


def multi_contract_date_miss(
    rule: MappingRule, entry_date: date, employee_id: UUID | None = None
) -> bool:
    """True when multiple mapping candidates exist but none's effective RP window contains ``entry_date``."""
    if len(rule.candidates) <= 1:
        return False
    for c in rule.candidates:
        rec = c.record
        ws, we = effective_mapping_candidate_window(c, employee_id)
        if rec.cortex_type == "ENGAGEMENT" and rec.engagement_id and ws <= entry_date <= we:
            return False
    return True


def _employee_login_precedence(status: EmployeeStatus | None) -> int:
    """Lower sorts first; later duplicate keys overwrite earlier (see ``build_login_to_employee_id``)."""
    if status == EmployeeStatus.ACTIVE:
        return 2
    if status == EmployeeStatus.ON_LEAVE:
        return 1
    if status == EmployeeStatus.INACTIVE:
        return 0
    return 1  # legacy (id, email) tuples without status — same tier as ON_LEAVE


def build_login_to_employee_id(
    employees: Iterable[tuple[UUID, str] | tuple[UUID, str, EmployeeStatus]],
) -> dict[str, UUID]:
    """Map employee lookup keys (lowercased) -> employee id.

    Indexes both full ``employee.email`` and its local-part (after ``@``) so CSV
    Replicon logins and Excel ``User Email`` exports resolve consistently.

    Includes **inactive** employees (``(id, email, EmployeeStatus.INACTIVE)`` from the
    Replicon import loader). When the same key would map to multiple employees, **ACTIVE**
    beats **ON_LEAVE** beats **INACTIVE**; ties use the later row in the input sequence.
    """
    rows: list[tuple[int, UUID, str, EmployeeStatus | None]] = []
    for i, tup in enumerate(employees):
        if len(tup) == 3:
            emp_id, email, status = tup
        else:
            emp_id, email = tup
            status = None
        e = (email or "").strip().lower()
        if not e:
            continue
        rows.append((i, emp_id, e, status))

    rows.sort(key=lambda r: (_employee_login_precedence(r[3]), r[0]))

    out: dict[str, UUID] = {}
    for _i, emp_id, e, _status in rows:
        out[e] = emp_id
        lp = email_local_part(e)
        if lp:
            out[lp] = emp_id
    return out


def aggregate_by_week_and_entry(
    mapped: Iterable[CortexMappedRow],
    login_to_employee: dict[str, UUID],
) -> dict[AggregatedEntryKey, AggregatedHours]:
    buckets: dict[AggregatedEntryKey, AggregatedHours] = defaultdict(AggregatedHours)
    for r in mapped:
        emp_id = login_to_employee.get(r.login.strip().lower())
        if not emp_id:
            continue
        ws = week_start_sunday(r.entry_date)
        et = r.cortex_type
        eng_id: UUID | None = r.engagement_id if et == "ENGAGEMENT" else None
        phase_id: UUID | None = r.phase_id if et == "ENGAGEMENT" else None
        key = AggregatedEntryKey(
            employee_id=emp_id,
            week_start=ws,
            entry_type=et,
            engagement_id=eng_id,
            opportunity_id=r.opportunity_id,
            engagement_phase_id=phase_id,
            account_id=r.account_id,
        )
        agg = buckets[key]
        agg.add(r.entry_date, r.hours, ws, r.billable)
    return buckets


def min_max_dates_per_employee_engagement(
    mapped: Iterable[CortexMappedRow],
    login_to_employee: dict[str, UUID],
) -> dict[tuple[UUID, UUID], tuple[date, date]]:
    """Only ENGAGEMENT rows with engagement_id set."""
    mm: dict[tuple[UUID, UUID], tuple[date, date]] = {}
    for r in mapped:
        if r.cortex_type != "ENGAGEMENT" or not r.engagement_id:
            continue
        eid = login_to_employee.get(r.login.strip().lower())
        if not eid:
            continue
        k = (eid, r.engagement_id)
        cur = mm.get(k)
        if not cur:
            mm[k] = (r.entry_date, r.entry_date)
        else:
            mm[k] = (min(cur[0], r.entry_date), max(cur[1], r.entry_date))
    return mm

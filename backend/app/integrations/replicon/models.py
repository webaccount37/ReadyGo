"""Typed rows for Replicon ETL."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from uuid import UUID


@dataclass
class RawTimeRow:
    """One row from Replicon CSV/Excel after header mapping.

    ``login`` is the employee match key: Replicon login name (CSV) or full work email
    lowercased (Excel export with User Email) — see ``build_login_to_employee_id``.
    ``source_excel_row`` is the 1-based sheet row on the Report tab when loaded from Excel; CSV sets None.
    """

    login: str
    entry_date: date
    hours: Decimal
    client_name: str
    project_name: str
    billable: bool
    approved: bool
    source_excel_row: int | None = None


@dataclass
class CortexMappedRow:
    """Replicon row joined to mapping workbook."""

    login: str
    entry_date: date
    hours: Decimal
    billable: bool
    cortex_type: str  # ENGAGEMENT | SALES | HOLIDAY (normalized)
    account_id: UUID
    opportunity_id: UUID
    engagement_id: UUID | None
    phase_id: UUID | None
    source_excel_row: int | None = None


@dataclass(frozen=True)
class AggregatedEntryKey:
    """Unique timesheet row after aggregation for one week."""

    employee_id: UUID
    week_start: date
    entry_type: str  # ENGAGEMENT | SALES | HOLIDAY
    engagement_id: UUID | None
    opportunity_id: UUID
    engagement_phase_id: UUID | None
    account_id: UUID

@dataclass
class AggregatedHours:
    """Per-day hours for Sunday..Saturday (indices 0..6)."""

    hours_by_dow: list[Decimal] = field(default_factory=lambda: [Decimal("0")] * 7)
    #: True only if every contributing slice was billable (conservative for merged rows).
    billable: bool = True

    def add(self, entry_date: date, hours: Decimal, week_start: date, billable: bool) -> None:
        idx = (entry_date - week_start).days
        if 0 <= idx <= 6:
            self.hours_by_dow[idx] += hours
        self.billable = self.billable and billable

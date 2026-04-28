"""Unit tests for timesheet approval list label aggregation (matches ORM _entry_labels_from_timesheet)."""

import uuid
from decimal import Decimal
from unittest.mock import MagicMock

import pytest

from app.models.timesheet import TimesheetEntryType
from app.services.timesheet_approval_service import TimesheetApprovalService


@pytest.fixture
def approval_svc() -> TimesheetApprovalService:
    return TimesheetApprovalService(MagicMock())


def test_labels_holiday_engagement_name(approval_svc: TimesheetApprovalService) -> None:
    assert approval_svc._labels_for_flat_entry(
        TimesheetEntryType.HOLIDAY, "E1", None, None, None, None
    ) == ["E1"]


def test_labels_holiday_pto_fallback(approval_svc: TimesheetApprovalService) -> None:
    assert approval_svc._labels_for_flat_entry(
        TimesheetEntryType.HOLIDAY, None, None, None, "x", "y"
    ) == ["x"]


def test_labels_holiday_pto_string(approval_svc: TimesheetApprovalService) -> None:
    assert approval_svc._labels_for_flat_entry(
        TimesheetEntryType.HOLIDAY, None, None, None, None, None
    ) == ["PTO"]


def test_labels_sales(approval_svc: TimesheetApprovalService) -> None:
    assert approval_svc._labels_for_flat_entry(
        TimesheetEntryType.SALES, None, "Acme", "OppA", None, None
    ) == ["Acme", "OppA"]


def test_labels_engagement(approval_svc: TimesheetApprovalService) -> None:
    assert approval_svc._labels_for_flat_entry(
        TimesheetEntryType.ENGAGEMENT, "Eng", None, None, None, None
    ) == ["Eng"]


def test_labels_engagement_opportunity_only(approval_svc: TimesheetApprovalService) -> None:
    assert approval_svc._labels_for_flat_entry(
        TimesheetEntryType.ENGAGEMENT, None, None, "OppB", None, None
    ) == ["OppB"]


def test_aggregate_by_timesheet_sorts(approval_svc: TimesheetApprovalService) -> None:
    tid = uuid.uuid4()
    rows = [
        (tid, TimesheetEntryType.ENGAGEMENT, "B", None, None, None, None),
        (tid, TimesheetEntryType.ENGAGEMENT, "A", None, None, None, None),
    ]
    m = approval_svc._labels_by_timesheet_from_entry_rows(rows)
    assert m[tid] == ["A", "B"]


def test_aggregate_empty_rows(approval_svc: TimesheetApprovalService) -> None:
    assert approval_svc._labels_by_timesheet_from_entry_rows([]) == {}

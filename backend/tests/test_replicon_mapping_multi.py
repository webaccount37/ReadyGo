"""Multi-value Replicon mapping workbook: split, date windows, tie-break."""

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.integrations.replicon.mapping_workbook import (
    MappingCandidate,
    MappingRecord,
    MappingRule,
    pick_mapping_record_for_entry_date,
    split_mapping_cell_values,
)
from app.integrations.replicon.models import RawTimeRow
from app.integrations.replicon.normalize import map_raw_row, multi_contract_date_miss


def test_split_mapping_cell_values_trims_and_splits():
    assert split_mapping_cell_values(None) == []
    assert split_mapping_cell_values("") == []
    assert split_mapping_cell_values("  A ; B ;  ") == ["A", "B"]
    assert split_mapping_cell_values("Single") == ["Single"]
    assert split_mapping_cell_values("First\nSecond") == ["First", "Second"]
    assert split_mapping_cell_values("First\r\nSecond") == ["First", "Second"]
    assert split_mapping_cell_values("First\rSecond") == ["First", "Second"]


def _rec() -> MappingRecord:
    return MappingRecord(
        replicon_project="P",
        replicon_client="C",
        opportunity_id=uuid4(),
        engagement_id=uuid4(),
        phase_id=None,
        account_id=uuid4(),
        cortex_type="ENGAGEMENT",
    )


def test_pick_single_candidate_ignores_window():
    r = _rec()
    rule = MappingRule((MappingCandidate(r, date(2026, 1, 1), date(2026, 1, 31)),))
    assert pick_mapping_record_for_entry_date(rule, date(2025, 6, 1)) == r


def test_pick_multi_one_window_contains():
    r1, r2 = _rec(), _rec()
    rule = MappingRule(
        (
            MappingCandidate(r1, date(2026, 1, 1), date(2026, 1, 15)),
            MappingCandidate(r2, date(2026, 2, 1), date(2026, 2, 28)),
        )
    )
    assert pick_mapping_record_for_entry_date(rule, date(2026, 2, 14)) == r2
    assert pick_mapping_record_for_entry_date(rule, date(2026, 1, 10)) == r1


def test_pick_multi_uses_employee_rp_window_when_provided():
    """Narrow per-employee line dates disambiguate when engagement-wide spans overlap."""
    emp = uuid4()
    r1, r2 = _rec(), _rec()
    rule = MappingRule(
        (
            MappingCandidate(
                r1,
                date(2026, 1, 1),
                date(2026, 12, 31),
                ((emp, date(2026, 3, 1), date(2026, 3, 20)),),
            ),
            MappingCandidate(
                r2,
                date(2026, 1, 1),
                date(2026, 12, 31),
                ((emp, date(2026, 6, 1), date(2026, 6, 30)),),
            ),
        )
    )
    assert pick_mapping_record_for_entry_date(rule, date(2026, 3, 10), emp) == r1
    assert pick_mapping_record_for_entry_date(rule, date(2026, 6, 15), emp) == r2


def test_pick_multi_no_match_returns_none():
    r1, r2 = _rec(), _rec()
    rule = MappingRule(
        (
            MappingCandidate(r1, date(2026, 1, 1), date(2026, 1, 15)),
            MappingCandidate(r2, date(2026, 2, 1), date(2026, 2, 28)),
        )
    )
    assert pick_mapping_record_for_entry_date(rule, date(2026, 1, 20)) is None


def test_pick_multi_tiebreak_narrowest_window():
    r1, r2 = _rec(), _rec()
    d = date(2026, 3, 10)
    # Both contain d; r2 has a shorter span (narrower)
    rule = MappingRule(
        (
            MappingCandidate(r1, date(2026, 3, 1), date(2026, 3, 31)),
            MappingCandidate(r2, date(2026, 3, 9), date(2026, 3, 11)),
        )
    )
    assert pick_mapping_record_for_entry_date(rule, d) == r2


def test_pick_multi_same_span_first_sheet_order():
    r1, r2 = _rec(), _rec()
    d = date(2026, 4, 5)
    rule = MappingRule(
        (
            MappingCandidate(r1, date(2026, 4, 1), date(2026, 4, 30)),
            MappingCandidate(r2, date(2026, 4, 1), date(2026, 4, 30)),
        )
    )
    assert pick_mapping_record_for_entry_date(rule, d) == r1


def test_pick_multi_same_span_prefers_engagement_where_employee_has_line():
    """One Replicon project/client → two Cortex engagements with the same RP window; hours follow the
    engagement where the timekeeper already has a line (avoids wrong auto-line + double count).
    """
    emp = uuid4()
    r1, r2 = _rec(), _rec()
    d = date(2026, 4, 5)
    rule = MappingRule(
        (
            MappingCandidate(r1, date(2026, 4, 1), date(2026, 4, 30)),
            MappingCandidate(
                r2,
                date(2026, 4, 1),
                date(2026, 4, 30),
                ((emp, date(2026, 4, 1), date(2026, 4, 30)),),
            ),
        )
    )
    assert pick_mapping_record_for_entry_date(rule, d) == r1
    assert pick_mapping_record_for_entry_date(rule, d, emp) == r2


def test_multi_contract_date_miss_only_when_multi_and_no_window():
    r1, r2 = _rec(), _rec()
    rule = MappingRule(
        (
            MappingCandidate(r1, date(2026, 1, 1), date(2026, 1, 10)),
            MappingCandidate(r2, date(2026, 2, 1), date(2026, 2, 10)),
        )
    )
    assert not multi_contract_date_miss(rule, date(2026, 1, 5))
    assert multi_contract_date_miss(rule, date(2026, 1, 15))

    single = MappingRule((MappingCandidate(r1, date(2026, 1, 1), date(2026, 1, 10)),))
    assert not multi_contract_date_miss(single, date(2026, 6, 1))


def test_map_raw_row_multi_contract_miss():
    r1, r2 = _rec(), _rec()
    rule = MappingRule(
        (
            MappingCandidate(r1, date(2026, 1, 1), date(2026, 1, 5)),
            MappingCandidate(r2, date(2026, 2, 1), date(2026, 2, 5)),
        )
    )
    raw = RawTimeRow("u@x.com", date(2026, 1, 15), Decimal("1"), "C", "P", True, True)
    mapping = {("p", "c"): rule}
    assert map_raw_row(raw, mapping) is None

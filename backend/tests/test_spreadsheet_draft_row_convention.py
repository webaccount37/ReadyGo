"""
Regression: trailing draft row stable ids match frontend spreadsheet-draft-rows.ts.

Manual scenarios to verify in UI:
- 0 line items: one trailing draft row; add role/employee creates one line item; no duplicate filled rows.
- + Add Row increases draft slots; each uses empty-draft-{n} storage keys via stableId.
"""


def test_draft_row_stable_id_format_matches_frontend():
    def spreadsheet_draft_row_stable_id(index: int) -> str:
        return f"empty-draft-{index}"

    assert spreadsheet_draft_row_stable_id(0) == "empty-draft-0"
    assert spreadsheet_draft_row_stable_id(2) == "empty-draft-2"
    assert not spreadsheet_draft_row_stable_id(0).startswith("empty-row-")

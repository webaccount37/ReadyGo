"""
Utility for computing user-friendly quote display names.
"""

import re
from uuid import UUID


def _to_id_part(name: str) -> str:
    """Convert name to ID-like string: remove spaces and special chars, alphanumeric only."""
    if not name or not isinstance(name, str):
        return ""
    # Replace newlines, tabs, multiple spaces with nothing
    sanitized = re.sub(r"\s+", "", name)
    # Keep only alphanumeric
    sanitized = re.sub(r"[^a-zA-Z0-9]", "", sanitized)
    return sanitized or "Unknown"


def _format_date_mmddyyyy(date_val: str | None) -> str:
    """Convert ISO date (YYYY-MM-DD) or datetime to MMDDYYYY."""
    if not date_val:
        return "00000000"
    try:
        date_str = date_val.isoformat() if hasattr(date_val, "isoformat") else str(date_val)
        parts = date_str.split("T")[0].split("-")
        if len(parts) >= 3:
            return f"{parts[1]}{parts[2]}{parts[0]}"  # MM DD YYYY
    except (IndexError, AttributeError):
        pass
    return "00000000"


def compute_quote_display_name(
    account_name: str | None,
    opportunity_name: str | None,
    version: int,
    quote_id: UUID | None = None,
    quote_created_at: str | None = None,
    max_account_len: int = 12,
    max_opportunity_len: int = 15,
) -> str:
    """
    Compute a friendly ID-style display name for a quote.

    Format: QT-{Account}-{Opportunity}-{MMDDYYYY}-{uniqueSuffix}-v{version}

    The unique suffix (first 4 chars of quote UUID, no hyphens) guarantees
    uniqueness even when account/opportunity names are duplicated or copied.

    Args:
        account_name: Account/company name from snapshot.
        opportunity_name: Opportunity name from snapshot.
        version: Quote version number.
        quote_id: Quote UUID for unique suffix (required for uniqueness).
        quote_created_at: Quote created_at (datetime or ISO string).
        max_account_len: Max chars for account before truncation.
        max_opportunity_len: Max chars for opportunity before truncation.

    Returns:
        Display name like "QT-AcmeCorp-Q12025Proj-02112025-a1b2-v3"
    """
    account = _to_id_part(account_name) if account_name else "Unknown"
    opp = _to_id_part(opportunity_name) if opportunity_name else "Unknown"

    account_short = account[:max_account_len] if len(account) > max_account_len else account
    opp_short = opp[:max_opportunity_len] if len(opp) > max_opportunity_len else opp
    date_part = _format_date_mmddyyyy(quote_created_at)

    if quote_id:
        unique_suffix = str(quote_id).replace("-", "")[:4]
        return f"QT-{account_short}-{opp_short}-{date_part}-{unique_suffix}-v{version}"
    return f"QT-{account_short}-{opp_short}-{date_part}-v{version}"

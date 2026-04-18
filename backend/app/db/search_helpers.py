"""Helpers for safe ILIKE search patterns."""

from __future__ import annotations

from typing import Optional


def ilike_pattern(raw: Optional[str]) -> Optional[str]:
    """Build a %%pattern%% for ILIKE with LIKE wildcards escaped."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    escaped = (
        s.replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )
    return f"%{escaped}%"


def normalize_sort_order(order: Optional[str]) -> str:
    o = (order or "asc").lower()
    return "desc" if o == "desc" else "asc"

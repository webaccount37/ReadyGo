"""
Resolve Account / Project / Phase for HOLIDAY timesheet rows under the internal company account.

Uses INTERNAL_COMPANY_ACCOUNT_ID (Ready or equivalent) plus one Opportunity per Delivery Center
and its Engagement; picks the EngagementPhase named PTO overlapping the timesheet week when possible.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.engagement import Engagement, EngagementPhase
from app.models.opportunity import Opportunity


def _parse_account_id() -> Optional[UUID]:
    raw = settings.INTERNAL_COMPANY_ACCOUNT_ID
    if raw is None:
        return None
    if isinstance(raw, UUID):
        return raw
    s = str(raw).strip()
    if not s:
        return None
    return UUID(s)


async def resolve_holiday_row_targets(
    session: AsyncSession,
    delivery_center_id: Optional[UUID],
    week_start: date,
) -> dict[str, Any]:
    """
    Build column values for a HOLIDAY row.

    When INTERNAL_COMPANY_ACCOUNT_ID is unset, returns display-only fields (legacy behavior).
    When set, account_id is always that UUID; opportunity/engagement/phase are set when a matching
    opportunity exists for the employee delivery center.
    """
    week_end = week_start + timedelta(days=6)
    out: dict[str, Any] = {
        "account_id": None,
        "account_display_name": "Ready",
        "engagement_display_name": "PTO",
        "opportunity_id": None,
        "engagement_id": None,
        "engagement_phase_id": None,
    }
    account_uuid = _parse_account_id()
    if not account_uuid:
        return out
    out["account_id"] = account_uuid
    if not delivery_center_id:
        return out

    opp_res = await session.execute(
        select(Opportunity.id)
        .where(
            Opportunity.account_id == account_uuid,
            Opportunity.delivery_center_id == delivery_center_id,
        )
        .order_by(Opportunity.id)
        .limit(1)
    )
    opp_row = opp_res.first()
    if not opp_row:
        return out
    opp_id = opp_row[0]
    out["opportunity_id"] = opp_id

    eng_res = await session.execute(
        select(Engagement.id)
        .where(Engagement.opportunity_id == opp_id)
        .order_by(Engagement.id)
        .limit(1)
    )
    eng_row = eng_res.first()
    if not eng_row:
        return out
    eng_id = eng_row[0]
    out["engagement_id"] = eng_id

    phase_res = await session.execute(
        select(EngagementPhase.id)
        .where(
            EngagementPhase.engagement_id == eng_id,
            func.lower(func.trim(EngagementPhase.name)) == "pto",
            EngagementPhase.start_date <= week_end,
            EngagementPhase.end_date >= week_start,
        )
        .order_by(EngagementPhase.start_date)
        .limit(1)
    )
    ph_row = phase_res.first()
    if ph_row:
        out["engagement_phase_id"] = ph_row[0]
        return out

    phase_res2 = await session.execute(
        select(EngagementPhase.id)
        .where(
            EngagementPhase.engagement_id == eng_id,
            func.lower(func.trim(EngagementPhase.name)) == "pto",
        )
        .order_by(EngagementPhase.start_date)
        .limit(1)
    )
    ph2 = phase_res2.first()
    if ph2:
        out["engagement_phase_id"] = ph2[0]
    return out

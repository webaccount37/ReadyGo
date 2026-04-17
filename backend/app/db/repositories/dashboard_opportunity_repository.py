"""SQL aggregates for dashboard opportunity metrics."""

from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import cast, extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.types import Integer, Numeric

from app.models.delivery_center import DeliveryCenter
from app.models.opportunity import Opportunity, OpportunityStatus


_OPEN_PIPELINE = Opportunity.status.notin_(
    [OpportunityStatus.WON, OpportunityStatus.LOST, OpportunityStatus.CANCELLED]
)


class DashboardOpportunityRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_global_kpis(self) -> dict[str, Any]:
        """Scalar aggregates for dashboard KPI row."""
        create_or_start = func.coalesce(Opportunity.deal_creation_date, Opportunity.start_date)
        days_to_close = Opportunity.close_date - create_or_start

        won_pred = Opportunity.status == OpportunityStatus.WON

        avg_days = select(func.avg(cast(days_to_close, Numeric))).where(
            won_pred,
            Opportunity.close_date.isnot(None),
            create_or_start.isnot(None),
        )
        n_days = select(func.count()).select_from(Opportunity).where(
            won_pred,
            Opportunity.close_date.isnot(None),
            create_or_start.isnot(None),
        )

        avg_fc = select(func.avg(Opportunity.forecast_value_usd)).where(
            won_pred,
            Opportunity.forecast_value_usd.isnot(None),
        )
        n_fc = select(func.count()).select_from(Opportunity).where(
            won_pred,
            Opportunity.forecast_value_usd.isnot(None),
        )

        pipe_sum = select(
            func.coalesce(func.sum(func.coalesce(Opportunity.forecast_value_usd, 0)), 0)
        ).where(_OPEN_PIPELINE)
        rev_sum = select(
            func.coalesce(func.sum(func.coalesce(Opportunity.forecast_value_usd, 0)), 0)
        ).where(won_pred)

        r1 = await self.session.execute(avg_days)
        r2 = await self.session.execute(n_days)
        r3 = await self.session.execute(avg_fc)
        r4 = await self.session.execute(n_fc)
        r5 = await self.session.execute(pipe_sum)
        r6 = await self.session.execute(rev_sum)

        return {
            "avg_days_to_close_won": r1.scalar(),
            "avg_days_to_close_sample_size": int(r2.scalar() or 0),
            "avg_forecast_usd_won": r3.scalar(),
            "avg_forecast_usd_won_sample_size": int(r4.scalar() or 0),
            "pipeline_forecast_usd": r5.scalar() or Decimal("0"),
            "estimated_revenue_usd": r6.scalar() or Decimal("0"),
        }

    async def get_yoy_closed_usd_by_year_dc(self) -> list[dict[str, Any]]:
        year_part = extract("year", Opportunity.close_date)
        q = (
            select(
                cast(year_part, Integer).label("year"),
                Opportunity.delivery_center_id,
                DeliveryCenter.name.label("delivery_center_name"),
                func.coalesce(
                    func.sum(func.coalesce(Opportunity.forecast_value_usd, 0)), 0
                ).label("sum_usd"),
            )
            .join(DeliveryCenter, DeliveryCenter.id == Opportunity.delivery_center_id)
            .where(
                Opportunity.status == OpportunityStatus.WON,
                Opportunity.close_date.isnot(None),
            )
            .group_by(
                year_part,
                Opportunity.delivery_center_id,
                DeliveryCenter.name,
            )
            .order_by(year_part, DeliveryCenter.name)
        )
        rows = (await self.session.execute(q)).all()
        return [
            {
                "year": int(r.year),
                "delivery_center_id": r.delivery_center_id,
                "delivery_center_name": r.delivery_center_name,
                "sum_usd": r.sum_usd if r.sum_usd is not None else Decimal("0"),
            }
            for r in rows
        ]

    async def get_yoy_closed_count_by_year_dc(self) -> list[dict[str, Any]]:
        year_part = extract("year", Opportunity.close_date)
        q = (
            select(
                cast(year_part, Integer).label("year"),
                Opportunity.delivery_center_id,
                DeliveryCenter.name.label("delivery_center_name"),
                func.count().label("count"),
            )
            .join(DeliveryCenter, DeliveryCenter.id == Opportunity.delivery_center_id)
            .where(
                Opportunity.status == OpportunityStatus.WON,
                Opportunity.close_date.isnot(None),
            )
            .group_by(
                year_part,
                Opportunity.delivery_center_id,
                DeliveryCenter.name,
            )
            .order_by(year_part, DeliveryCenter.name)
        )
        rows = (await self.session.execute(q)).all()
        return [
            {
                "year": int(r.year),
                "delivery_center_id": r.delivery_center_id,
                "delivery_center_name": r.delivery_center_name,
                "count": int(r.count),
            }
            for r in rows
        ]

    async def get_funnel_by_status_dc(self) -> list[dict[str, Any]]:
        q = (
            select(
                Opportunity.status,
                Opportunity.delivery_center_id,
                DeliveryCenter.name.label("delivery_center_name"),
                func.coalesce(
                    func.sum(func.coalesce(Opportunity.forecast_value_usd, 0)), 0
                ).label("sum_usd"),
                func.count().label("count"),
            )
            .join(DeliveryCenter, DeliveryCenter.id == Opportunity.delivery_center_id)
            .where(_OPEN_PIPELINE)
            .group_by(
                Opportunity.status,
                Opportunity.delivery_center_id,
                DeliveryCenter.name,
            )
            .order_by(Opportunity.status, DeliveryCenter.name)
        )
        rows = (await self.session.execute(q)).all()
        out: list[dict[str, Any]] = []
        for r in rows:
            st = r.status.value if hasattr(r.status, "value") else str(r.status)
            out.append(
                {
                    "status": st,
                    "delivery_center_id": r.delivery_center_id,
                    "delivery_center_name": r.delivery_center_name,
                    "sum_usd": r.sum_usd if r.sum_usd is not None else Decimal("0"),
                    "count": int(r.count),
                }
            )
        return out

    async def get_won_count_by_month(self) -> list[dict[str, Any]]:
        # to_char(close_date, 'YYYY-MM')
        ym = func.to_char(Opportunity.close_date, "YYYY-MM")
        q = (
            select(ym.label("year_month"), func.count().label("count"))
            .where(
                Opportunity.status == OpportunityStatus.WON,
                Opportunity.close_date.isnot(None),
            )
            .group_by(ym)
            .order_by(ym)
        )
        rows = (await self.session.execute(q)).all()
        return [{"year_month": r.year_month, "count": int(r.count)} for r in rows]

    async def get_opportunity_count_by_status_all(self) -> list[dict[str, Any]]:
        """
        Count all opportunities by status — no status filter (Pipeline Mix chart only).
        Returns every defined status with count (including zero) for a stable series order.
        """
        q = select(Opportunity.status, func.count().label("count")).group_by(Opportunity.status)
        rows = (await self.session.execute(q)).all()
        counts: dict[str, int] = {}
        for r in rows:
            st = r.status.value if hasattr(r.status, "value") else str(r.status)
            counts[st] = int(r.count)
        out: list[dict[str, Any]] = []
        for st in OpportunityStatus:
            key = st.value
            out.append({"status": key, "count": counts.get(key, 0)})
        return out

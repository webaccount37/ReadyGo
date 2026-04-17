"""Orchestrates dashboard opportunity aggregate queries."""

from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories.dashboard_opportunity_repository import DashboardOpportunityRepository
from app.schemas.dashboard import (
    DashboardOpportunityMetricsResponse,
    FunnelByStatusDc,
    PipelineCountByStatus,
    WonCountByMonth,
    YoYClosedCountByYearDc,
    YoYClosedUsdByYearDc,
)


class DashboardOpportunityMetricsService:
    def __init__(self, session: AsyncSession):
        self.repo = DashboardOpportunityRepository(session)

    async def get_metrics(self) -> DashboardOpportunityMetricsResponse:
        kpis = await self.repo.get_global_kpis()
        yoy_usd = await self.repo.get_yoy_closed_usd_by_year_dc()
        yoy_cnt = await self.repo.get_yoy_closed_count_by_year_dc()
        funnel = await self.repo.get_funnel_by_status_dc()
        won_mo = await self.repo.get_won_count_by_month()
        pipe_status = await self.repo.get_opportunity_count_by_status_all()

        avg_days = kpis["avg_days_to_close_won"]
        avg_fc = kpis["avg_forecast_usd_won"]

        return DashboardOpportunityMetricsResponse(
            avg_days_to_close_won=Decimal(str(avg_days)) if avg_days is not None else None,
            avg_days_to_close_sample_size=kpis["avg_days_to_close_sample_size"],
            avg_forecast_usd_won=Decimal(str(avg_fc)) if avg_fc is not None else None,
            avg_forecast_usd_won_sample_size=kpis["avg_forecast_usd_won_sample_size"],
            pipeline_forecast_usd=Decimal(str(kpis["pipeline_forecast_usd"])),
            estimated_revenue_usd=Decimal(str(kpis["estimated_revenue_usd"])),
            yoy_closed_usd_by_year_dc=[YoYClosedUsdByYearDc.model_validate(r) for r in yoy_usd],
            yoy_closed_count_by_year_dc=[YoYClosedCountByYearDc.model_validate(r) for r in yoy_cnt],
            funnel_by_status_dc=[FunnelByStatusDc.model_validate(r) for r in funnel],
            won_count_by_month=[WonCountByMonth.model_validate(r) for r in won_mo],
            pipeline_count_by_status=[PipelineCountByStatus.model_validate(r) for r in pipe_status],
        )

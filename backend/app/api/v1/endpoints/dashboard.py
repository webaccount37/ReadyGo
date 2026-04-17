"""Dashboard analytics endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.dashboard import DashboardOpportunityMetricsResponse
from app.services.dashboard_opportunity_metrics_service import DashboardOpportunityMetricsService

router = APIRouter()


@router.get("/opportunities-metrics", response_model=DashboardOpportunityMetricsResponse)
async def get_opportunities_dashboard_metrics(
    db: AsyncSession = Depends(get_db),
) -> DashboardOpportunityMetricsResponse:
    """Pre-aggregated opportunity KPIs and chart series for the home dashboard."""
    svc = DashboardOpportunityMetricsService(db)
    return await svc.get_metrics()

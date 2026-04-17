"""Schemas for dashboard analytics API."""

from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class YoYClosedUsdByYearDc(BaseModel):
    year: int
    delivery_center_id: UUID
    delivery_center_name: str
    sum_usd: Decimal = Field(..., description="Sum of forecast_value_usd for won opportunities")


class YoYClosedCountByYearDc(BaseModel):
    year: int
    delivery_center_id: UUID
    delivery_center_name: str
    count: int


class FunnelByStatusDc(BaseModel):
    status: str
    delivery_center_id: UUID
    delivery_center_name: str
    sum_usd: Decimal
    count: int


class WonCountByMonth(BaseModel):
    year_month: str = Field(..., description="YYYY-MM (UTC/calendar from close_date)")
    count: int


class PipelineCountByStatus(BaseModel):
    status: str
    count: int = Field(
        ...,
        description="Pipeline Mix: count of opportunities with this status; no filter — all deals",
    )


class DashboardOpportunityMetricsResponse(BaseModel):
    avg_days_to_close_won: Decimal | None
    avg_days_to_close_sample_size: int = Field(0, description="Won rows with close_date and create/start date")
    avg_forecast_usd_won: Decimal | None
    avg_forecast_usd_won_sample_size: int = 0
    pipeline_forecast_usd: Decimal
    estimated_revenue_usd: Decimal
    yoy_closed_usd_by_year_dc: list[YoYClosedUsdByYearDc]
    yoy_closed_count_by_year_dc: list[YoYClosedCountByYearDc]
    funnel_by_status_dc: list[FunnelByStatusDc]
    won_count_by_month: list[WonCountByMonth]
    pipeline_count_by_status: list[PipelineCountByStatus]

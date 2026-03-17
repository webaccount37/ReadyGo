"""
Staffing forecast API endpoints.
"""

from datetime import date
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.staffing_forecast_service import StaffingForecastService
from app.schemas.staffing_forecast import StaffingForecastResponse

router = APIRouter()


@router.get("", response_model=StaffingForecastResponse)
async def get_staffing_forecast(
    start_week: Optional[date] = Query(None, description="Starting week (Sunday). Default: this week."),
    delivery_center_id: Optional[UUID] = Query(None, description="Filter by delivery center"),
    employee_id: Optional[UUID] = Query(None, description="Filter by employee"),
    billable: str = Query("both", description="Filter billable: true | false | both"),
    duration_months: int = Query(6, ge=3, le=12, description="Duration: 3, 6, or 12 months"),
    period: Literal["weekly", "monthly"] = Query("weekly", description="Weekly or monthly aggregation"),
    db: AsyncSession = Depends(get_db),
) -> StaffingForecastResponse:
    """Get staffing forecast data for the grid (Resource + DC view)."""
    if billable not in ("true", "false", "both"):
        billable = "both"

    service = StaffingForecastService(db)
    result = await service.get_forecast(
        start_week=start_week,
        delivery_center_id=delivery_center_id,
        employee_id=employee_id,
        billable=billable,
        duration_months=duration_months,
        period=period,
    )
    return StaffingForecastResponse(**result)

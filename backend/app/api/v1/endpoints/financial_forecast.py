"""Financial Forecast API."""

from datetime import date
from io import BytesIO
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.middleware import require_authentication
from app.db.session import get_db
from app.models.employee import Employee
from app.schemas.financial_forecast import (
    ChangeEventOut,
    ExpenseLineCreate,
    ExpenseLineRename,
    FinancialForecastBulkPatch,
    FinancialForecastDefinitionResponse,
    FinancialForecastHistoryResponse,
)
from app.services.financial_forecast_excel_service import FinancialForecastExcelService
from app.services.financial_forecast_service import FinancialForecastService

router = APIRouter()


def _parse_week(s: str) -> date:
    try:
        return date.fromisoformat(s)
    except ValueError as e:
        raise HTTPException(400, f"Invalid date: {s}") from e


@router.get("/definition", response_model=FinancialForecastDefinitionResponse)
async def get_financial_forecast_definition(
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(require_authentication),
):
    return FinancialForecastService(db).get_definition()


@router.get("")
async def get_financial_forecast(
    delivery_center_id: UUID = Query(...),
    start_week: str = Query(...),
    end_week: str = Query(...),
    metric: str = Query("forecast"),
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(require_authentication),
):
    data = await FinancialForecastService(db).get_forecast(
        delivery_center_id=delivery_center_id,
        start_week=_parse_week(start_week),
        end_week=_parse_week(end_week),
        metric=metric,
    )
    return data


@router.patch("/cells", status_code=204)
async def patch_financial_forecast_cells(
    body: FinancialForecastBulkPatch,
    delivery_center_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    current: Employee = Depends(require_authentication),
):
    await FinancialForecastService(db).apply_bulk_patch(
        delivery_center_id=delivery_center_id,
        employee_id=current.id,
        body=body.model_dump(),
    )


@router.post("/expense-lines", status_code=201)
async def create_expense_line(
    payload: ExpenseLineCreate,
    delivery_center_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    current: Employee = Depends(require_authentication),
):
    try:
        ln = await FinancialForecastService(db).create_expense_line(
            delivery_center_id=delivery_center_id,
            employee_id=current.id,
            parent_group_code=payload.parent_group_code,
            name=payload.name,
        )
        return {"id": str(ln.id), "name": ln.name, "parent_group_code": ln.parent_group_code}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.put("/expense-lines/{line_id}", status_code=204)
async def rename_expense_line(
    line_id: UUID,
    payload: ExpenseLineRename,
    delivery_center_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    current: Employee = Depends(require_authentication),
):
    try:
        await FinancialForecastService(db).rename_expense_line(
            delivery_center_id=delivery_center_id,
            employee_id=current.id,
            line_id=line_id,
            name=payload.name,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.get("/history", response_model=FinancialForecastHistoryResponse)
async def get_financial_forecast_history(
    delivery_center_id: UUID = Query(...),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(require_authentication),
):
    rows, total = await FinancialForecastService(db).list_history(
        delivery_center_id=delivery_center_id, skip=skip, limit=limit
    )
    return {
        "items": [
            ChangeEventOut(
                id=r.id,
                action=r.action,
                payload=dict(r.payload or {}),
                created_at=r.created_at,
                employee_id=r.employee_id,
            )
            for r in rows
        ],
        "total": total,
    }


@router.get("/export.xlsx")
async def export_financial_forecast_excel(
    delivery_center_id: UUID = Query(...),
    start_week: str = Query(...),
    end_week: str = Query(...),
    metric: str = Query("forecast"),
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(require_authentication),
):
    if metric not in ("forecast", "actuals"):
        raise HTTPException(400, "metric must be forecast or actuals")
    svc = FinancialForecastExcelService(db)
    buf = await svc.export_workbook(
        delivery_center_id=delivery_center_id,
        start_week=_parse_week(start_week),
        end_week=_parse_week(end_week),
        metric=metric,
    )
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="financial-forecast.xlsx"'},
    )


@router.post("/import.xlsx")
async def import_financial_forecast_excel(
    delivery_center_id: UUID = Query(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current: Employee = Depends(require_authentication),
):
    raw = await file.read()
    tmp = BytesIO(raw)
    svc = FinancialForecastExcelService(db)
    try:
        result = await svc.import_workbook(
            delivery_center_id=delivery_center_id,
            employee_id=current.id,
            file_stream=tmp,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return result

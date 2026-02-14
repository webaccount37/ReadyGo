"""
Engagement API endpoints.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
import tempfile
import os

from app.db.session import get_db
from app.controllers.engagement_controller import EngagementController
from app.services.engagement_excel_service import EngagementExcelService
from app.schemas.engagement import (
    EngagementUpdate,
    EngagementResponse,
    EngagementDetailResponse,
    EngagementListResponse,
    EngagementLineItemCreate,
    EngagementLineItemUpdate,
    EngagementLineItemResponse,
    EngagementWeeklyHoursCreate,
    EngagementWeeklyHoursResponse,
    EngagementPhaseCreate,
    EngagementPhaseUpdate,
    EngagementPhaseResponse,
    EngagementTimesheetApproversUpdate,
    EngagementTimesheetApproverResponse,
    EngagementExcelImportResponse,
    AutoFillRequest,
)

router = APIRouter()


@router.get("", response_model=EngagementListResponse)
async def list_engagements(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    opportunity_id: Optional[UUID] = Query(None),
    quote_id: Optional[UUID] = Query(None),
    employee_id: Optional[UUID] = Query(None, description="Filter engagements where employee has resource plan line items"),
    db: AsyncSession = Depends(get_db),
) -> EngagementListResponse:
    """List engagements with optional filters."""
    controller = EngagementController(db)
    return await controller.list_engagements(
        skip=skip,
        limit=limit,
        opportunity_id=opportunity_id,
        quote_id=quote_id,
        employee_id=employee_id,
    )


@router.get("/{engagement_id}", response_model=EngagementResponse)
async def get_engagement(
    engagement_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> EngagementResponse:
    """Get engagement by ID."""
    controller = EngagementController(db)
    engagement = await controller.get_engagement(engagement_id)
    if not engagement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Engagement not found",
        )
    return engagement


@router.get("/{engagement_id}/detail", response_model=EngagementDetailResponse)
async def get_engagement_detail(
    engagement_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> EngagementDetailResponse:
    """Get engagement detail with all line items and comparative summary."""
    controller = EngagementController(db)
    engagement = await controller.get_engagement_detail(engagement_id)
    if not engagement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Engagement not found",
        )
    return engagement


@router.patch("/{engagement_id}", response_model=EngagementResponse)
async def update_engagement(
    engagement_id: UUID,
    engagement_data: EngagementUpdate,
    db: AsyncSession = Depends(get_db),
) -> EngagementResponse:
    """Update an engagement (limited fields)."""
    controller = EngagementController(db)
    engagement = await controller.update_engagement(engagement_id, engagement_data)
    if not engagement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Engagement not found",
        )
    return engagement


# Phase endpoints
@router.post("/{engagement_id}/phases", response_model=EngagementPhaseResponse, status_code=status.HTTP_201_CREATED)
async def create_phase(
    engagement_id: UUID,
    phase_data: EngagementPhaseCreate,
    db: AsyncSession = Depends(get_db),
) -> EngagementPhaseResponse:
    """Create a new phase."""
    controller = EngagementController(db)
    return await controller.create_phase(engagement_id, phase_data)


@router.patch("/{engagement_id}/phases/{phase_id}", response_model=EngagementPhaseResponse)
async def update_phase(
    engagement_id: UUID,
    phase_id: UUID,
    phase_data: EngagementPhaseUpdate,
    db: AsyncSession = Depends(get_db),
) -> EngagementPhaseResponse:
    """Update a phase."""
    controller = EngagementController(db)
    phase = await controller.update_phase(engagement_id, phase_id, phase_data)
    if not phase:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Phase not found",
        )
    return phase


@router.delete("/{engagement_id}/phases/{phase_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_phase(
    engagement_id: UUID,
    phase_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a phase."""
    controller = EngagementController(db)
    deleted = await controller.delete_phase(engagement_id, phase_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Phase not found",
        )


@router.put(
    "/{engagement_id}/timesheet-approvers",
    response_model=List[EngagementTimesheetApproverResponse],
)
async def update_timesheet_approvers(
    engagement_id: UUID,
    data: EngagementTimesheetApproversUpdate,
    db: AsyncSession = Depends(get_db),
) -> List[EngagementTimesheetApproverResponse]:
    """Update timesheet approvers for an engagement."""
    controller = EngagementController(db)
    try:
        return await controller.update_timesheet_approvers(engagement_id, data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


# Line item endpoints
@router.post("/{engagement_id}/line-items", response_model=EngagementLineItemResponse, status_code=status.HTTP_201_CREATED)
async def create_line_item(
    engagement_id: UUID,
    line_item_data: EngagementLineItemCreate,
    db: AsyncSession = Depends(get_db),
) -> EngagementLineItemResponse:
    """Create a new line item."""
    controller = EngagementController(db)
    return await controller.create_line_item(engagement_id, line_item_data)


@router.patch("/{engagement_id}/line-items/{line_item_id}", response_model=EngagementLineItemResponse)
async def update_line_item(
    engagement_id: UUID,
    line_item_id: UUID,
    line_item_data: EngagementLineItemUpdate,
    db: AsyncSession = Depends(get_db),
) -> EngagementLineItemResponse:
    """Update a line item."""
    controller = EngagementController(db)
    line_item = await controller.update_line_item(engagement_id, line_item_id, line_item_data)
    if not line_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Line item not found",
        )
    return line_item


@router.delete("/{engagement_id}/line-items/{line_item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_line_item(
    engagement_id: UUID,
    line_item_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a line item."""
    controller = EngagementController(db)
    deleted = await controller.delete_line_item(engagement_id, line_item_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Line item not found",
        )


@router.put("/{engagement_id}/line-items/{line_item_id}/weekly-hours", response_model=List[EngagementWeeklyHoursResponse])
async def update_weekly_hours(
    engagement_id: UUID,
    line_item_id: UUID,
    weekly_hours: List[EngagementWeeklyHoursCreate],
    db: AsyncSession = Depends(get_db),
) -> List[EngagementWeeklyHoursResponse]:
    """Update weekly hours for a line item."""
    controller = EngagementController(db)
    return await controller.update_weekly_hours(engagement_id, line_item_id, weekly_hours)


@router.post("/{engagement_id}/line-items/{line_item_id}/auto-fill", response_model=List[EngagementLineItemResponse])
async def auto_fill_hours(
    engagement_id: UUID,
    line_item_id: UUID,
    auto_fill_data: AutoFillRequest,
    db: AsyncSession = Depends(get_db),
) -> List[EngagementLineItemResponse]:
    """Auto-fill weekly hours for a line item."""
    controller = EngagementController(db)
    try:
        return await controller.auto_fill_hours(engagement_id, line_item_id, auto_fill_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


# Excel export/import endpoints
@router.get("/{engagement_id}/export-excel")
async def export_engagement_to_excel(
    engagement_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Export engagement Resource Plan to Excel."""
    excel_service = EngagementExcelService(db)
    try:
        output = await excel_service.export_engagement_to_excel(engagement_id)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename=engagement_{engagement_id}_resource_plan.xlsx"
            }
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to export engagement: {str(e)}",
        )


@router.post("/{engagement_id}/import-excel", response_model=EngagementExcelImportResponse)
async def import_engagement_from_excel(
    engagement_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> EngagementExcelImportResponse:
    """Import engagement Resource Plan from Excel file."""
    # Validate file type
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only .xlsx and .xls files are supported.",
        )
    
    # Save uploaded file to temporary location
    with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
        try:
            content = await file.read()
            tmp_file.write(content)
            tmp_file_path = tmp_file.name
            
            # Import from Excel
            excel_service = EngagementExcelService(db)
            result = await excel_service.import_engagement_from_excel(engagement_id, tmp_file_path)
            
            return EngagementExcelImportResponse(**result)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to import engagement: {str(e)}",
            )
        finally:
            # Clean up temporary file
            if os.path.exists(tmp_file_path):
                os.unlink(tmp_file_path)

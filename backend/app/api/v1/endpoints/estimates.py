"""
Estimate API endpoints.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status, Body
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.db.session import get_db
from app.controllers.estimate_controller import EstimateController
from app.controllers.estimate_phase_controller import EstimatePhaseController
from app.schemas.estimate import (
    EstimateCreate,
    EstimateUpdate,
    EstimateResponse,
    EstimateDetailResponse,
    EstimateListResponse,
    EstimateLineItemCreate,
    EstimateLineItemUpdate,
    EstimateLineItemResponse,
    AutoFillRequest,
    EstimateTotalsResponse,
    EstimatePhaseCreate,
    EstimatePhaseUpdate,
    EstimatePhaseResponse,
)

router = APIRouter()


@router.post("", response_model=EstimateResponse, status_code=status.HTTP_201_CREATED)
async def create_estimate(
    estimate_data: EstimateCreate,
    db: AsyncSession = Depends(get_db),
) -> EstimateResponse:
    """Create a new estimate."""
    controller = EstimateController(db)
    return await controller.create_estimate(estimate_data)


@router.get("", response_model=EstimateListResponse)
async def list_estimates(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    engagement_id: UUID = Query(None),
    db: AsyncSession = Depends(get_db),
) -> EstimateListResponse:
    """List estimates with optional filters."""
    controller = EstimateController(db)
    return await controller.list_estimates(
        skip=skip,
        limit=limit,
        engagement_id=engagement_id,
    )


@router.get("/{estimate_id}", response_model=EstimateResponse)
async def get_estimate(
    estimate_id: UUID,
    include_details: bool = Query(False, alias="include-details"),
    db: AsyncSession = Depends(get_db),
) -> EstimateResponse:
    """Get estimate by ID."""
    controller = EstimateController(db)
    estimate = await controller.get_estimate(estimate_id, include_details=include_details)
    if not estimate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estimate not found",
        )
    return estimate


@router.get("/{estimate_id}/detail", response_model=EstimateDetailResponse)
async def get_estimate_detail(
    estimate_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> EstimateDetailResponse:
    """Get estimate with all line items and weekly hours."""
    controller = EstimateController(db)
    estimate = await controller.get_estimate_detail(estimate_id)
    if not estimate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estimate not found",
        )
    return estimate


@router.put("/{estimate_id}", response_model=EstimateResponse)
async def update_estimate(
    estimate_id: UUID,
    estimate_data: EstimateUpdate,
    db: AsyncSession = Depends(get_db),
) -> EstimateResponse:
    """Update an estimate."""
    controller = EstimateController(db)
    estimate = await controller.update_estimate(estimate_id, estimate_data)
    if not estimate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estimate not found",
        )
    return estimate


@router.post("/{estimate_id}/set-active", response_model=EstimateResponse)
async def set_active_version(
    estimate_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> EstimateResponse:
    """Set an estimate as the active version for its release."""
    controller = EstimateController(db)
    estimate = await controller.set_active_version(estimate_id)
    if not estimate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estimate not found",
        )
    return estimate


@router.delete("/{estimate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_estimate(
    estimate_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete an estimate."""
    controller = EstimateController(db)
    deleted = await controller.delete_estimate(estimate_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estimate not found",
        )


@router.post("/{estimate_id}/clone", response_model=EstimateDetailResponse, status_code=status.HTTP_201_CREATED)
async def clone_estimate(
    estimate_id: UUID,
    new_name: Optional[str] = Body(None, embed=True),
    db: AsyncSession = Depends(get_db),
) -> EstimateDetailResponse:
    """Clone an estimate to create a variation."""
    controller = EstimateController(db)
    try:
        return await controller.clone_estimate(estimate_id, new_name)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.post("/{estimate_id}/line-items", response_model=EstimateLineItemResponse, status_code=status.HTTP_201_CREATED)
async def create_line_item(
    estimate_id: UUID,
    line_item_data: EstimateLineItemCreate,
    db: AsyncSession = Depends(get_db),
) -> EstimateLineItemResponse:
    """Create a new line item."""
    controller = EstimateController(db)
    try:
        return await controller.create_line_item(estimate_id, line_item_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.put("/{estimate_id}/line-items/{line_item_id}", response_model=EstimateLineItemResponse)
async def update_line_item(
    estimate_id: UUID,
    line_item_id: UUID,
    line_item_data: EstimateLineItemUpdate,
    db: AsyncSession = Depends(get_db),
) -> EstimateLineItemResponse:
    """Update a line item."""
    controller = EstimateController(db)
    line_item = await controller.update_line_item(estimate_id, line_item_id, line_item_data)
    if not line_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Line item not found",
        )
    return line_item


@router.delete("/{estimate_id}/line-items/{line_item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_line_item(
    estimate_id: UUID,
    line_item_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a line item."""
    controller = EstimateController(db)
    deleted = await controller.delete_line_item(estimate_id, line_item_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Line item not found",
        )


@router.post("/{estimate_id}/line-items/{line_item_id}/auto-fill", response_model=list[EstimateLineItemResponse])
async def auto_fill_hours(
    estimate_id: UUID,
    line_item_id: UUID,
    auto_fill_data: AutoFillRequest,
    db: AsyncSession = Depends(get_db),
) -> list:
    """Auto-fill weekly hours for a line item."""
    controller = EstimateController(db)
    try:
        return await controller.auto_fill_hours(estimate_id, line_item_id, auto_fill_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.get("/{estimate_id}/totals", response_model=EstimateTotalsResponse)
async def get_estimate_totals(
    estimate_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> EstimateTotalsResponse:
    """Get calculated totals for an estimate."""
    controller = EstimateController(db)
    try:
        return await controller.get_estimate_totals(estimate_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


# Phase endpoints
@router.post("/{estimate_id}/phases", response_model=EstimatePhaseResponse, status_code=status.HTTP_201_CREATED)
async def create_phase(
    estimate_id: UUID,
    phase_data: EstimatePhaseCreate,
    db: AsyncSession = Depends(get_db),
) -> EstimatePhaseResponse:
    """Create a new phase for an estimate."""
    controller = EstimatePhaseController(db)
    try:
        return await controller.create_phase(estimate_id, phase_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/{estimate_id}/phases", response_model=List[EstimatePhaseResponse])
async def list_phases(
    estimate_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> List[EstimatePhaseResponse]:
    """List all phases for an estimate."""
    controller = EstimatePhaseController(db)
    return await controller.list_phases(estimate_id)


@router.get("/{estimate_id}/phases/{phase_id}", response_model=EstimatePhaseResponse)
async def get_phase(
    estimate_id: UUID,
    phase_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> EstimatePhaseResponse:
    """Get a phase by ID."""
    controller = EstimatePhaseController(db)
    try:
        return await controller.get_phase(estimate_id, phase_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.put("/{estimate_id}/phases/{phase_id}", response_model=EstimatePhaseResponse)
async def update_phase(
    estimate_id: UUID,
    phase_id: UUID,
    phase_data: EstimatePhaseUpdate,
    db: AsyncSession = Depends(get_db),
) -> EstimatePhaseResponse:
    """Update a phase."""
    controller = EstimatePhaseController(db)
    try:
        return await controller.update_phase(estimate_id, phase_id, phase_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.delete("/{estimate_id}/phases/{phase_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_phase(
    estimate_id: UUID,
    phase_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a phase."""
    controller = EstimatePhaseController(db)
    deleted = await controller.delete_phase(estimate_id, phase_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Phase not found",
        )



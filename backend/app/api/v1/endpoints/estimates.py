"""
Estimate API endpoints.
"""

from typing import List
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
async def create_quote(
    quote_data: EstimateCreate,
    db: AsyncSession = Depends(get_db),
) -> EstimateResponse:
    """Create a new estimate."""
    controller = EstimateController(db)
    return await controller.create_quote(quote_data)


@router.get("", response_model=EstimateListResponse)
async def list_quotes(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    release_id: UUID = Query(None),
    status: str = Query(None),
    db: AsyncSession = Depends(get_db),
) -> EstimateListResponse:
    """List estimates with optional filters."""
    controller = EstimateController(db)
    return await controller.list_quotes(
        skip=skip,
        limit=limit,
        release_id=release_id,
        status=status,
    )


@router.get("/{quote_id}", response_model=EstimateResponse)
async def get_quote(
    quote_id: UUID,
    include_details: bool = Query(False, alias="include-details"),
    db: AsyncSession = Depends(get_db),
) -> EstimateResponse:
    """Get estimate by ID."""
    controller = EstimateController(db)
    quote = await controller.get_quote(quote_id, include_details=include_details)
    if not quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estimate not found",
        )
    return quote


@router.get("/{quote_id}/detail", response_model=EstimateDetailResponse)
async def get_quote_detail(
    quote_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> EstimateDetailResponse:
    """Get quote with all line items and weekly hours."""
    controller = EstimateController(db)
    quote = await controller.get_quote_detail(quote_id)
    if not quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estimate not found",
        )
    return quote


@router.put("/{quote_id}", response_model=EstimateResponse)
async def update_quote(
    quote_id: UUID,
    quote_data: EstimateUpdate,
    db: AsyncSession = Depends(get_db),
) -> EstimateResponse:
    """Update a quote."""
    controller = EstimateController(db)
    quote = await controller.update_quote(quote_id, quote_data)
    if not quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estimate not found",
        )
    return quote


@router.delete("/{quote_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quote(
    quote_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a quote."""
    controller = EstimateController(db)
    deleted = await controller.delete_quote(quote_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estimate not found",
        )


@router.post("/{quote_id}/clone", response_model=EstimateDetailResponse, status_code=status.HTTP_201_CREATED)
async def clone_quote(
    quote_id: UUID,
    new_name: str = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
) -> EstimateDetailResponse:
    """Clone a quote to create a variation."""
    controller = EstimateController(db)
    try:
        return await controller.clone_quote(quote_id, new_name)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.post("/{quote_id}/line-items", response_model=EstimateLineItemResponse, status_code=status.HTTP_201_CREATED)
async def create_line_item(
    quote_id: UUID,
    line_item_data: EstimateLineItemCreate,
    db: AsyncSession = Depends(get_db),
) -> EstimateLineItemResponse:
    """Create a new line item."""
    controller = EstimateController(db)
    try:
        return await controller.create_line_item(quote_id, line_item_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.put("/{quote_id}/line-items/{line_item_id}", response_model=EstimateLineItemResponse)
async def update_line_item(
    quote_id: UUID,
    line_item_id: UUID,
    line_item_data: EstimateLineItemUpdate,
    db: AsyncSession = Depends(get_db),
) -> EstimateLineItemResponse:
    """Update a line item."""
    controller = EstimateController(db)
    line_item = await controller.update_line_item(quote_id, line_item_id, line_item_data)
    if not line_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Line item not found",
        )
    return line_item


@router.delete("/{quote_id}/line-items/{line_item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_line_item(
    quote_id: UUID,
    line_item_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a line item."""
    controller = EstimateController(db)
    deleted = await controller.delete_line_item(quote_id, line_item_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Line item not found",
        )


@router.post("/{quote_id}/line-items/{line_item_id}/auto-fill", response_model=list[EstimateLineItemResponse])
async def auto_fill_hours(
    quote_id: UUID,
    line_item_id: UUID,
    auto_fill_data: AutoFillRequest,
    db: AsyncSession = Depends(get_db),
) -> list:
    """Auto-fill weekly hours for a line item."""
    controller = EstimateController(db)
    try:
        return await controller.auto_fill_hours(quote_id, line_item_id, auto_fill_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.get("/{quote_id}/totals", response_model=EstimateTotalsResponse)
async def get_quote_totals(
    quote_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> EstimateTotalsResponse:
    """Get calculated totals for a quote."""
    controller = EstimateController(db)
    try:
        return await controller.get_quote_totals(quote_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


# Phase endpoints
@router.post("/{quote_id}/phases", response_model=EstimatePhaseResponse, status_code=status.HTTP_201_CREATED)
async def create_phase(
    quote_id: UUID,
    phase_data: EstimatePhaseCreate,
    db: AsyncSession = Depends(get_db),
) -> EstimatePhaseResponse:
    """Create a new phase for a quote."""
    controller = EstimatePhaseController(db)
    try:
        return await controller.create_phase(quote_id, phase_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/{quote_id}/phases", response_model=List[EstimatePhaseResponse])
async def list_phases(
    quote_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> List[EstimatePhaseResponse]:
    """List all phases for a quote."""
    controller = EstimatePhaseController(db)
    return await controller.list_phases(quote_id)


@router.get("/{quote_id}/phases/{phase_id}", response_model=EstimatePhaseResponse)
async def get_phase(
    quote_id: UUID,
    phase_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> EstimatePhaseResponse:
    """Get a phase by ID."""
    controller = EstimatePhaseController(db)
    try:
        return await controller.get_phase(quote_id, phase_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.put("/{quote_id}/phases/{phase_id}", response_model=EstimatePhaseResponse)
async def update_phase(
    quote_id: UUID,
    phase_id: UUID,
    phase_data: EstimatePhaseUpdate,
    db: AsyncSession = Depends(get_db),
) -> EstimatePhaseResponse:
    """Update a phase."""
    controller = EstimatePhaseController(db)
    try:
        return await controller.update_phase(quote_id, phase_id, phase_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.delete("/{quote_id}/phases/{phase_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_phase(
    quote_id: UUID,
    phase_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a phase."""
    controller = EstimatePhaseController(db)
    deleted = await controller.delete_phase(quote_id, phase_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Phase not found",
        )



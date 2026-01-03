"""
Delivery Center API endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import List

from app.db.session import get_db
from app.controllers.delivery_center_controller import DeliveryCenterController
from app.schemas.delivery_center import (
    DeliveryCenterCreate,
    DeliveryCenterUpdate,
    DeliveryCenterResponse,
    DeliveryCenterListResponse,
    DeliveryCenterApproverCreate,
    DeliveryCenterApproverResponse,
    DeliveryCenterApproverListResponse,
    EmployeeApproverSummary,
)

router = APIRouter()


@router.post("", response_model=DeliveryCenterResponse, status_code=status.HTTP_201_CREATED)
async def create_delivery_center(
    delivery_center_data: DeliveryCenterCreate,
    db: AsyncSession = Depends(get_db),
) -> DeliveryCenterResponse:
    """Create a new delivery center."""
    controller = DeliveryCenterController(db)
    return await controller.create_delivery_center(delivery_center_data)


@router.get("", response_model=DeliveryCenterListResponse)
async def list_delivery_centers(
    include_approvers: bool = False,
    db: AsyncSession = Depends(get_db),
) -> DeliveryCenterListResponse:
    """List all delivery centers."""
    controller = DeliveryCenterController(db)
    return await controller.list_delivery_centers(include_approvers)


@router.get("/{delivery_center_id}", response_model=DeliveryCenterResponse)
async def get_delivery_center(
    delivery_center_id: UUID,
    include_approvers: bool = False,
    db: AsyncSession = Depends(get_db),
) -> DeliveryCenterResponse:
    """Get delivery center by ID."""
    controller = DeliveryCenterController(db)
    delivery_center = await controller.get_delivery_center(delivery_center_id, include_approvers)
    if not delivery_center:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Delivery center not found",
        )
    return delivery_center


@router.put("/{delivery_center_id}", response_model=DeliveryCenterResponse)
async def update_delivery_center(
    delivery_center_id: UUID,
    delivery_center_data: DeliveryCenterUpdate,
    db: AsyncSession = Depends(get_db),
) -> DeliveryCenterResponse:
    """Update a delivery center."""
    controller = DeliveryCenterController(db)
    try:
        delivery_center = await controller.update_delivery_center(
            delivery_center_id, delivery_center_data
        )
        if not delivery_center:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Delivery center not found",
            )
        return delivery_center
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.delete("/{delivery_center_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_delivery_center(
    delivery_center_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a delivery center."""
    controller = DeliveryCenterController(db)
    try:
        deleted = await controller.delete_delivery_center(delivery_center_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Delivery center not found",
        )


@router.get("/{delivery_center_id}/approvers", response_model=DeliveryCenterApproverListResponse)
async def get_delivery_center_approvers(
    delivery_center_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> DeliveryCenterApproverListResponse:
    """Get all approvers for a delivery center."""
    controller = DeliveryCenterController(db)
    return await controller.get_delivery_center_approvers(delivery_center_id)


@router.get("/{delivery_center_id}/employees", response_model=List[EmployeeApproverSummary])
async def get_employees_for_delivery_center(
    delivery_center_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> List[EmployeeApproverSummary]:
    """Get all employees that belong to a delivery center (for selecting approvers)."""
    controller = DeliveryCenterController(db)
    return await controller.get_employees_for_delivery_center(delivery_center_id)


@router.post("/{delivery_center_id}/approvers", response_model=DeliveryCenterApproverResponse, status_code=status.HTTP_201_CREATED)
async def add_delivery_center_approver(
    delivery_center_id: UUID,
    approver_data: DeliveryCenterApproverCreate,
    db: AsyncSession = Depends(get_db),
) -> DeliveryCenterApproverResponse:
    """Add an approver to a delivery center."""
    controller = DeliveryCenterController(db)
    try:
        return await controller.add_delivery_center_approver(delivery_center_id, approver_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.delete("/{delivery_center_id}/approvers/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_delivery_center_approver(
    delivery_center_id: UUID,
    employee_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Remove an approver from a delivery center."""
    controller = DeliveryCenterController(db)
    try:
        deleted = await controller.remove_delivery_center_approver(delivery_center_id, employee_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approver association not found",
        )










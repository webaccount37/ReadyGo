"""
Billing Term API endpoints.
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.db.session import get_db
from app.controllers.billing_term_controller import BillingTermController
from app.schemas.billing_term import (
    BillingTermCreate,
    BillingTermUpdate,
    BillingTermResponse,
    BillingTermListResponse,
)

router = APIRouter()


@router.post("", response_model=BillingTermResponse, status_code=status.HTTP_201_CREATED)
async def create_billing_term(
    billing_term_data: BillingTermCreate,
    db: AsyncSession = Depends(get_db),
) -> BillingTermResponse:
    """Create a new billing term."""
    controller = BillingTermController(db)
    return await controller.create_billing_term(billing_term_data)


@router.get("", response_model=BillingTermListResponse)
async def list_billing_terms(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
) -> BillingTermListResponse:
    """List billing terms."""
    controller = BillingTermController(db)
    return await controller.list_billing_terms(
        skip=skip,
        limit=limit,
        active_only=active_only,
    )


@router.get("/{billing_term_id}", response_model=BillingTermResponse)
async def get_billing_term(
    billing_term_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> BillingTermResponse:
    """Get billing term by ID."""
    controller = BillingTermController(db)
    billing_term = await controller.get_billing_term(billing_term_id)
    if not billing_term:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Billing term not found",
        )
    return billing_term


@router.put("/{billing_term_id}", response_model=BillingTermResponse)
async def update_billing_term(
    billing_term_id: UUID,
    billing_term_data: BillingTermUpdate,
    db: AsyncSession = Depends(get_db),
) -> BillingTermResponse:
    """Update a billing term."""
    controller = BillingTermController(db)
    billing_term = await controller.update_billing_term(billing_term_id, billing_term_data)
    if not billing_term:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Billing term not found",
        )
    return billing_term


@router.delete("/{billing_term_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_billing_term(
    billing_term_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a billing term."""
    controller = BillingTermController(db)
    deleted = await controller.delete_billing_term(billing_term_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Billing term not found",
        )








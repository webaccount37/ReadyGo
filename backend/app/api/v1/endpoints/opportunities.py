"""
Opportunity API endpoints.
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from datetime import date

from app.db.session import get_db
from app.controllers.opportunity_controller import OpportunityController
from app.schemas.opportunity import (
    OpportunityCreate,
    OpportunityUpdate,
    OpportunityResponse,
    OpportunityListResponse,
)
from app.schemas.relationships import LinkRolesToOpportunityRequest, UnlinkRequest

router = APIRouter()


@router.post("", response_model=OpportunityResponse, status_code=status.HTTP_201_CREATED)
async def create_opportunity(
    opportunity_data: OpportunityCreate,
    db: AsyncSession = Depends(get_db),
) -> OpportunityResponse:
    """Create a new opportunity."""
    controller = OpportunityController(db)
    return await controller.create_opportunity(opportunity_data)


@router.get("", response_model=OpportunityListResponse)
async def list_opportunities(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    account_id: UUID = Query(None),
    status: str = Query(None),
    start_date: date = Query(None),
    end_date: date = Query(None),
    db: AsyncSession = Depends(get_db),
) -> OpportunityListResponse:
    """List opportunities with optional filters."""
    controller = OpportunityController(db)
    return await controller.list_opportunities(
        skip=skip,
        limit=limit,
        account_id=account_id,
        status=status,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/{opportunity_id}", response_model=OpportunityResponse)
async def get_opportunity(
    opportunity_id: UUID,
    include_relationships: bool = Query(False),
    db: AsyncSession = Depends(get_db),
) -> OpportunityResponse:
    """Get opportunity by ID."""
    controller = OpportunityController(db)
    opportunity = await controller.get_opportunity(opportunity_id, include_relationships)
    if not opportunity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found",
        )
    return opportunity


@router.get("/{opportunity_id}/children", response_model=OpportunityListResponse)
async def list_child_opportunities(
    opportunity_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> OpportunityListResponse:
    """List child opportunities of a parent."""
    controller = OpportunityController(db)
    return await controller.list_child_opportunities(opportunity_id, skip, limit)


@router.put("/{opportunity_id}", response_model=OpportunityResponse)
async def update_opportunity(
    opportunity_id: UUID,
    opportunity_data: OpportunityUpdate,
    db: AsyncSession = Depends(get_db),
) -> OpportunityResponse:
    """Update an opportunity."""
    controller = OpportunityController(db)
    opportunity = await controller.update_opportunity(opportunity_id, opportunity_data)
    if not opportunity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found",
        )
    return opportunity


@router.delete("/{opportunity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_opportunity(
    opportunity_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete an opportunity."""
    controller = OpportunityController(db)
    deleted = await controller.delete_opportunity(opportunity_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found",
        )


@router.post("/{opportunity_id}/roles/link", status_code=status.HTTP_204_NO_CONTENT)
async def link_roles_to_opportunity(
    opportunity_id: UUID,
    request: LinkRolesToOpportunityRequest,
    db: AsyncSession = Depends(get_db),
):
    """Link roles to an opportunity."""
    controller = OpportunityController(db)
    success = await controller.link_roles_to_opportunity(opportunity_id, request)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found",
        )


@router.delete("/{opportunity_id}/roles/unlink", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_roles_from_opportunity(
    opportunity_id: UUID,
    request: UnlinkRequest,
    db: AsyncSession = Depends(get_db),
):
    """Unlink roles from an opportunity."""
    controller = OpportunityController(db)
    success = await controller.unlink_roles_from_opportunity(opportunity_id, request)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found",
        )


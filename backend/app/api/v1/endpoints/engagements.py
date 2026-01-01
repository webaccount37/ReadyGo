"""
Engagement API endpoints.
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from datetime import date

from app.db.session import get_db
from app.controllers.engagement_controller import EngagementController
from app.schemas.engagement import (
    EngagementCreate,
    EngagementUpdate,
    EngagementResponse,
    EngagementListResponse,
)
from app.schemas.relationships import LinkRolesToEngagementRequest, UnlinkRequest

router = APIRouter()


@router.post("", response_model=EngagementResponse, status_code=status.HTTP_201_CREATED)
async def create_engagement(
    engagement_data: EngagementCreate,
    db: AsyncSession = Depends(get_db),
) -> EngagementResponse:
    """Create a new engagement."""
    controller = EngagementController(db)
    return await controller.create_engagement(engagement_data)


@router.get("", response_model=EngagementListResponse)
async def list_engagements(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    opportunity_id: UUID = Query(None),
    status: str = Query(None),
    start_date: date = Query(None),
    end_date: date = Query(None),
    db: AsyncSession = Depends(get_db),
) -> EngagementListResponse:
    """List engagements with optional filters."""
    controller = EngagementController(db)
    return await controller.list_engagements(
        skip=skip,
        limit=limit,
        opportunity_id=opportunity_id,
        status=status,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/{engagement_id}", response_model=EngagementResponse)
async def get_engagement(
    engagement_id: UUID,
    include_relationships: bool = Query(False),
    db: AsyncSession = Depends(get_db),
) -> EngagementResponse:
    """Get engagement by ID."""
    controller = EngagementController(db)
    engagement = await controller.get_engagement(engagement_id, include_relationships)
    if not engagement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Engagement not found",
        )
    return engagement


@router.put("/{engagement_id}", response_model=EngagementResponse)
async def update_engagement(
    engagement_id: UUID,
    engagement_data: EngagementUpdate,
    db: AsyncSession = Depends(get_db),
) -> EngagementResponse:
    """Update an engagement."""
    controller = EngagementController(db)
    engagement = await controller.update_engagement(engagement_id, engagement_data)
    if not engagement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Engagement not found",
        )
    return engagement


@router.delete("/{engagement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_engagement(
    engagement_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete an engagement."""
    controller = EngagementController(db)
    deleted = await controller.delete_engagement(engagement_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Engagement not found",
        )


@router.post("/{engagement_id}/roles/link", status_code=status.HTTP_204_NO_CONTENT)
async def link_roles_to_engagement(
    engagement_id: UUID,
    request: LinkRolesToEngagementRequest,
    db: AsyncSession = Depends(get_db),
):
    """Link roles to an engagement."""
    controller = EngagementController(db)
    success = await controller.link_roles_to_engagement(engagement_id, request)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Engagement not found",
        )


@router.delete("/{engagement_id}/roles/unlink", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_roles_from_engagement(
    engagement_id: UUID,
    request: UnlinkRequest,
    db: AsyncSession = Depends(get_db),
):
    """Unlink roles from an engagement."""
    controller = EngagementController(db)
    success = await controller.unlink_roles_from_engagement(engagement_id, request)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Engagement not found",
        )




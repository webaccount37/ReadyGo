"""
Release API endpoints.
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from datetime import date

from app.db.session import get_db
from app.controllers.release_controller import ReleaseController
from app.schemas.release import (
    ReleaseCreate,
    ReleaseUpdate,
    ReleaseResponse,
    ReleaseListResponse,
)
from app.schemas.relationships import LinkRolesToReleaseRequest, UnlinkRequest

router = APIRouter()


@router.post("", response_model=ReleaseResponse, status_code=status.HTTP_201_CREATED)
async def create_release(
    release_data: ReleaseCreate,
    db: AsyncSession = Depends(get_db),
) -> ReleaseResponse:
    """Create a new release."""
    controller = ReleaseController(db)
    return await controller.create_release(release_data)


@router.get("", response_model=ReleaseListResponse)
async def list_releases(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    engagement_id: UUID = Query(None),
    status: str = Query(None),
    start_date: date = Query(None),
    end_date: date = Query(None),
    db: AsyncSession = Depends(get_db),
) -> ReleaseListResponse:
    """List releases with optional filters."""
    controller = ReleaseController(db)
    return await controller.list_releases(
        skip=skip,
        limit=limit,
        engagement_id=engagement_id,
        status=status,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/{release_id}", response_model=ReleaseResponse)
async def get_release(
    release_id: UUID,
    include_relationships: bool = Query(False),
    db: AsyncSession = Depends(get_db),
) -> ReleaseResponse:
    """Get release by ID."""
    controller = ReleaseController(db)
    release = await controller.get_release(release_id, include_relationships)
    if not release:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Release not found",
        )
    return release


@router.put("/{release_id}", response_model=ReleaseResponse)
async def update_release(
    release_id: UUID,
    release_data: ReleaseUpdate,
    db: AsyncSession = Depends(get_db),
) -> ReleaseResponse:
    """Update a release."""
    controller = ReleaseController(db)
    release = await controller.update_release(release_id, release_data)
    if not release:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Release not found",
        )
    return release


@router.delete("/{release_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_release(
    release_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a release."""
    controller = ReleaseController(db)
    deleted = await controller.delete_release(release_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Release not found",
        )


@router.post("/{release_id}/roles/link", status_code=status.HTTP_204_NO_CONTENT)
async def link_roles_to_release(
    release_id: UUID,
    request: LinkRolesToReleaseRequest,
    db: AsyncSession = Depends(get_db),
):
    """Link roles to a release."""
    controller = ReleaseController(db)
    success = await controller.link_roles_to_release(release_id, request)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Release not found",
        )


@router.delete("/{release_id}/roles/unlink", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_roles_from_release(
    release_id: UUID,
    request: UnlinkRequest,
    db: AsyncSession = Depends(get_db),
):
    """Unlink roles from a release."""
    controller = ReleaseController(db)
    success = await controller.unlink_roles_from_release(release_id, request)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Release not found",
        )




"""
Project API endpoints.
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from datetime import date

from app.db.session import get_db
from app.controllers.project_controller import ProjectController
from app.schemas.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectListResponse,
)
from app.schemas.relationships import LinkRolesToProjectRequest, UnlinkRequest

router = APIRouter()


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    """Create a new project."""
    controller = ProjectController(db)
    return await controller.create_project(project_data)


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    client_id: UUID = Query(None),
    status: str = Query(None),
    start_date: date = Query(None),
    end_date: date = Query(None),
    db: AsyncSession = Depends(get_db),
) -> ProjectListResponse:
    """List projects with optional filters."""
    controller = ProjectController(db)
    return await controller.list_projects(
        skip=skip,
        limit=limit,
        client_id=client_id,
        status=status,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    include_relationships: bool = Query(False),
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    """Get project by ID."""
    controller = ProjectController(db)
    project = await controller.get_project(project_id, include_relationships)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    return project


@router.get("/{project_id}/children", response_model=ProjectListResponse)
async def list_child_projects(
    project_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> ProjectListResponse:
    """List child projects of a parent."""
    controller = ProjectController(db)
    return await controller.list_child_projects(project_id, skip, limit)


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    project_data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    """Update a project."""
    controller = ProjectController(db)
    project = await controller.update_project(project_id, project_data)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a project."""
    controller = ProjectController(db)
    deleted = await controller.delete_project(project_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )


@router.post("/{project_id}/roles/link", status_code=status.HTTP_204_NO_CONTENT)
async def link_roles_to_project(
    project_id: UUID,
    request: LinkRolesToProjectRequest,
    db: AsyncSession = Depends(get_db),
):
    """Link roles to a project."""
    controller = ProjectController(db)
    success = await controller.link_roles_to_project(project_id, request)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )


@router.delete("/{project_id}/roles/unlink", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_roles_from_project(
    project_id: UUID,
    request: UnlinkRequest,
    db: AsyncSession = Depends(get_db),
):
    """Unlink roles from a project."""
    controller = ProjectController(db)
    success = await controller.unlink_roles_from_project(project_id, request)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )












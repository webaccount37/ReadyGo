"""
Project controller.
"""

from typing import Optional
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.base_controller import BaseController
from app.services.project_service import ProjectService
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse, ProjectListResponse
from app.schemas.relationships import LinkRolesToProjectRequest, UnlinkRequest


class ProjectController(BaseController):
    """Controller for project operations."""
    
    def __init__(self, session: AsyncSession):
        self.project_service = ProjectService(session)
    
    async def create_project(self, project_data: ProjectCreate) -> ProjectResponse:
        """Create a new project."""
        return await self.project_service.create_project(project_data)
    
    async def get_project(self, project_id: UUID, include_relationships: bool = False) -> Optional[ProjectResponse]:
        """Get project by ID."""
        if include_relationships:
            return await self.project_service.get_project_with_relationships(project_id)
        return await self.project_service.get_project(project_id)
    
    async def list_projects(
        self,
        skip: int = 0,
        limit: int = 100,
        client_id: Optional[UUID] = None,
        status: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> ProjectListResponse:
        """List projects with optional filters."""
        projects, total = await self.project_service.list_projects(
            skip=skip,
            limit=limit,
            client_id=client_id,
            status=status,
            start_date=start_date,
            end_date=end_date,
        )
        return ProjectListResponse(items=projects, total=total)
    
    async def list_child_projects(
        self,
        parent_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> ProjectListResponse:
        """List child projects of a parent."""
        projects, total = await self.project_service.list_child_projects(parent_id, skip, limit)
        return ProjectListResponse(items=projects, total=total)
    
    async def update_project(
        self,
        project_id: UUID,
        project_data: ProjectUpdate,
    ) -> Optional[ProjectResponse]:
        """Update a project."""
        return await self.project_service.update_project(project_id, project_data)
    
    async def delete_project(self, project_id: UUID) -> bool:
        """Delete a project."""
        return await self.project_service.delete_project(project_id)
    
    async def link_roles_to_project(
        self,
        project_id: UUID,
        request: LinkRolesToProjectRequest,
    ) -> bool:
        """Link roles to a project."""
        return await self.project_service.link_roles_to_project(
            project_id,
            request.role_ids,
        )
    
    async def unlink_roles_from_project(
        self,
        project_id: UUID,
        request: UnlinkRequest,
    ) -> bool:
        """Unlink roles from a project."""
        return await self.project_service.unlink_roles_from_project(
            project_id,
            request.ids,
        )










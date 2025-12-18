"""
Project service with business logic.
"""

from typing import List, Optional
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.db.repositories.project_repository import ProjectRepository
from app.db.repositories.employee_repository import EmployeeRepository
from app.db.repositories.role_repository import RoleRepository
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse


class ProjectService(BaseService):
    """Service for project operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.project_repo = ProjectRepository(session)
        self.employee_repo = EmployeeRepository(session)
        self.role_repo = RoleRepository(session)
    
    async def create_project(self, project_data: ProjectCreate) -> ProjectResponse:
        """Create a new project."""
        # Server-side validation: end_date must be after start_date
        if project_data.end_date < project_data.start_date:
            raise ValueError("End date must be after start date")
        
        project_dict = project_data.model_dump(exclude_unset=True)
        project = await self.project_repo.create(**project_dict)
        await self.session.commit()
        # Reload with client relationship
        project = await self.project_repo.get(project.id)
        if not project:
            raise ValueError("Failed to retrieve created project")
        return self._to_response(project)
    
    async def get_project(self, project_id: UUID) -> Optional[ProjectResponse]:
        """Get project by ID."""
        project = await self.project_repo.get(project_id)
        if not project:
            return None
        return self._to_response(project)
    
    async def get_project_with_relationships(self, project_id: UUID) -> Optional[ProjectResponse]:
        """Get project with related entities."""
        project = await self.project_repo.get_with_relationships(project_id)
        if not project:
            return None
        return self._to_response(project)
    
    async def list_projects(
        self,
        skip: int = 0,
        limit: int = 100,
        client_id: Optional[UUID] = None,
        status: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> tuple[List[ProjectResponse], int]:
        """List projects with optional filters."""
        from app.models.project import ProjectStatus
        
        if client_id:
            projects = await self.project_repo.list_by_client(client_id, skip, limit)
        elif status:
            try:
                status_enum = ProjectStatus(status)
                projects = await self.project_repo.list_by_status(status_enum, skip, limit)
            except ValueError:
                projects = []
        elif start_date or end_date:
            projects = await self.project_repo.list_by_date_range(start_date, end_date, skip, limit)
        else:
            projects = await self.project_repo.list(skip=skip, limit=limit)
        
        total = len(projects)
        return [self._to_response(proj) for proj in projects], total
    
    async def list_child_projects(
        self,
        parent_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[List[ProjectResponse], int]:
        """List child projects of a parent."""
        projects = await self.project_repo.list_child_projects(parent_id, skip, limit)
        total = len(projects)
        return [self._to_response(proj) for proj in projects], total
    
    async def update_project(
        self,
        project_id: UUID,
        project_data: ProjectUpdate,
    ) -> Optional[ProjectResponse]:
        """Update a project."""
        project = await self.project_repo.get(project_id)
        if not project:
            return None
        
        # Server-side validation: end_date must be after start_date
        update_dict = project_data.model_dump(exclude_unset=True)
        start_date = update_dict.get('start_date', project.start_date)
        end_date = update_dict.get('end_date', project.end_date)
        
        if end_date < start_date:
            raise ValueError("End date must be after start date")
        
        updated = await self.project_repo.update(project_id, **update_dict)
        await self.session.commit()
        # Reload with client relationship
        updated = await self.project_repo.get(project_id)
        if not updated:
            return None
        return self._to_response(updated)
    
    async def delete_project(self, project_id: UUID) -> bool:
        """Delete a project."""
        deleted = await self.project_repo.delete(project_id)
        await self.session.commit()
        return deleted
    
    async def link_roles_to_project(
        self,
        project_id: UUID,
        role_ids: List[UUID],
    ) -> bool:
        """Link roles to a project."""
        project = await self.project_repo.get_with_relationships(project_id)
        if not project:
            return False
        
        roles = []
        for role_id in role_ids:
            role = await self.role_repo.get(role_id)
            if role:
                roles.append(role)
        
        project.roles.extend(roles)
        await self.session.commit()
        return True
    
    async def unlink_roles_from_project(
        self,
        project_id: UUID,
        role_ids: List[UUID],
    ) -> bool:
        """Unlink roles from a project."""
        project = await self.project_repo.get_with_relationships(project_id)
        if not project:
            return False
        
        project.roles = [role for role in project.roles if role.id not in role_ids]
        await self.session.commit()
        return True
    
    def _to_response(self, project) -> ProjectResponse:
        """Convert project model to response schema."""
        client_name = None
        if hasattr(project, 'client') and project.client:
            client_name = project.client.company_name
        
        project_dict = {
            "id": project.id,
            "name": project.name,
            "parent_project_id": project.parent_project_id,
            "client_id": project.client_id,
            "start_date": project.start_date,
            "end_date": project.end_date,
            "status": project.status,
            "billing_term_id": project.billing_term_id,
            "project_type": project.project_type,
            "description": project.description,
            "utilization": project.utilization,
            "margin": project.margin,
            "default_currency": project.default_currency,
            "delivery_center_id": project.delivery_center_id,
            "engagement_owner_id": project.engagement_owner_id,
            "invoice_customer": project.invoice_customer,
            "billable_expenses": project.billable_expenses,
            "attributes": project.attributes,
            "client_name": client_name,
        }
        return ProjectResponse.model_validate(project_dict)


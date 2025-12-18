"""
Project repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.project import Project, ProjectStatus


class ProjectRepository(BaseRepository[Project]):
    """Repository for project operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(Project, session)
    
    def _base_query(self):
        """Base query with eager loading of client relationship."""
        return select(Project).options(selectinload(Project.client))
    
    async def list(
        self,
        skip: int = 0,
        limit: int = 100,
        **filters,
    ) -> List[Project]:
        """List projects with pagination and filters, eagerly loading client."""
        query = self._base_query()
        
        # Apply filters
        for key, value in filters.items():
            if hasattr(Project, key):
                query = query.where(getattr(Project, key) == value)
        
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get(self, id: UUID) -> Optional[Project]:
        """Get project by ID with client relationship loaded."""
        query = self._base_query().where(Project.id == id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def list_by_client(
        self,
        client_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Project]:
        """List projects by client."""
        query = self._base_query().where(Project.client_id == client_id)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_by_status(
        self,
        status: ProjectStatus,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Project]:
        """List projects by status."""
        query = self._base_query().where(Project.status == status)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_by_date_range(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Project]:
        """List projects within date range."""
        query = self._base_query()
        if start_date:
            query = query.where(Project.start_date >= start_date)
        if end_date:
            query = query.where(Project.end_date <= end_date)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_child_projects(
        self,
        parent_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Project]:
        """List child projects of a parent."""
        query = self._base_query().where(Project.parent_project_id == parent_id)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_with_relationships(self, project_id: UUID) -> Optional[Project]:
        """Get project with related entities."""
        result = await self.session.execute(
            select(Project)
            .options(
                selectinload(Project.client),
                selectinload(Project.employees),
                selectinload(Project.releases),
                selectinload(Project.roles),
                selectinload(Project.parent_project),
            )
            .where(Project.id == project_id)
        )
        return result.scalar_one_or_none()




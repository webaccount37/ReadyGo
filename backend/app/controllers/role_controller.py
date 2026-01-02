"""
Role controller.
"""

from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.base_controller import BaseController
from app.services.role_service import RoleService
from app.schemas.role import RoleCreate, RoleUpdate, RoleResponse, RoleListResponse


class RoleController(BaseController):
    """Controller for role operations."""
    
    def __init__(self, session: AsyncSession):
        self.role_service = RoleService(session)
    
    async def create_role(self, role_data: RoleCreate) -> RoleResponse:
        """Create a new role."""
        return await self.role_service.create_role(role_data)
    
    async def get_role(self, role_id: UUID, include_relationships: bool = False) -> Optional[RoleResponse]:
        """Get role by ID."""
        if include_relationships:
            return await self.role_service.get_role_with_relationships(role_id)
        return await self.role_service.get_role(role_id)
    
    async def list_roles(
        self,
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None,
    ) -> RoleListResponse:
        """List roles with optional filters."""
        roles, total = await self.role_service.list_roles(
            skip=skip,
            limit=limit,
            status=status,
        )
        return RoleListResponse(items=roles, total=total)
    
    async def update_role(
        self,
        role_id: UUID,
        role_data: RoleUpdate,
    ) -> Optional[RoleResponse]:
        """Update a role."""
        return await self.role_service.update_role(role_id, role_data)
    
    async def delete_role(self, role_id: UUID) -> bool:
        """Delete a role."""
        return await self.role_service.delete_role(role_id)












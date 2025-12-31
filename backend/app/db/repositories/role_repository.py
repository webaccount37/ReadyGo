"""
Role repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.role import Role, RoleStatus
from app.models.role_rate import RoleRate


class RoleRepository(BaseRepository[Role]):
    """Repository for role operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(Role, session)
    
    async def get_by_role_name(self, role_name: str) -> Optional[Role]:
        """Get role by name."""
        result = await self.session.execute(
            select(Role).where(Role.role_name == role_name)
        )
        return result.scalar_one_or_none()
    
    async def list_by_status(
        self,
        status: RoleStatus,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Role]:
        """List roles by status."""
        query = select(Role).where(Role.status == status)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_with_relationships(self, role_id: UUID) -> Optional[Role]:
        """Get role with related entities."""
        result = await self.session.execute(
            select(Role)
            .options(
                selectinload(Role.employees),
                selectinload(Role.projects),
                selectinload(Role.releases),
                selectinload(Role.role_rates).selectinload(RoleRate.delivery_center),
            )
            .where(Role.id == role_id)
        )
        return result.scalar_one_or_none()




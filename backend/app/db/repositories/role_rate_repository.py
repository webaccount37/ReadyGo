"""
Repository for role rate operations.
"""

from typing import List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.db.repositories.base_repository import BaseRepository
from app.models.role_rate import RoleRate


class RoleRateRepository(BaseRepository[RoleRate]):
    """Repository for role rate CRUD."""

    def __init__(self, session: AsyncSession):
        super().__init__(RoleRate, session)

    async def list_for_role(self, role_id: UUID) -> List[RoleRate]:
        result = await self.session.execute(
            select(RoleRate).where(RoleRate.role_id == role_id)
        )
        return list(result.scalars().all())

    async def delete_for_role(self, role_id: UUID) -> None:
        await self.session.execute(
            delete(RoleRate).where(RoleRate.role_id == role_id)
        )


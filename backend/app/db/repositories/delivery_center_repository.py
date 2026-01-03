"""
Delivery Center repository for database operations.
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.repositories.base_repository import BaseRepository
from app.models.delivery_center import DeliveryCenter


class DeliveryCenterRepository(BaseRepository[DeliveryCenter]):
    """Repository for delivery center operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(DeliveryCenter, session)
    
    async def get(self, id: UUID) -> Optional[DeliveryCenter]:
        """Get delivery center by ID."""
        result = await self.session.execute(
            select(DeliveryCenter).where(DeliveryCenter.id == id)
        )
        return result.scalar_one_or_none()
    
    async def update(self, id: UUID, **kwargs) -> Optional[DeliveryCenter]:
        """Update a delivery center."""
        from sqlalchemy import update
        await self.session.execute(
            update(DeliveryCenter)
            .where(DeliveryCenter.id == id)
            .values(**kwargs)
        )
        await self.session.flush()
        return await self.get(id)
    
    async def delete(self, id: UUID) -> bool:
        """Delete a delivery center."""
        from sqlalchemy import delete
        result = await self.session.execute(
            delete(DeliveryCenter).where(DeliveryCenter.id == id)
        )
        await self.session.flush()
        return result.rowcount > 0
    
    async def list_all(self) -> List[DeliveryCenter]:
        """List all delivery centers."""
        query = select(DeliveryCenter).order_by(DeliveryCenter.name)
        result = await self.session.execute(query)
        return list(result.scalars().all())










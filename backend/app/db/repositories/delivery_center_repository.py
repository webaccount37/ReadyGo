"""
Delivery Center repository for database operations.
"""

from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.repositories.base_repository import BaseRepository
from app.models.delivery_center import DeliveryCenter


class DeliveryCenterRepository(BaseRepository[DeliveryCenter]):
    """Repository for delivery center operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(DeliveryCenter, session)
    
    async def list_all(self) -> List[DeliveryCenter]:
        """List all delivery centers."""
        query = select(DeliveryCenter).order_by(DeliveryCenter.name)
        result = await self.session.execute(query)
        return list(result.scalars().all())









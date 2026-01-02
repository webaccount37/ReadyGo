"""
Delivery Center service with business logic.
"""

from typing import List
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.db.repositories.delivery_center_repository import DeliveryCenterRepository
from app.schemas.delivery_center import DeliveryCenterResponse


class DeliveryCenterService(BaseService):
    """Service for delivery center operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.delivery_center_repo = DeliveryCenterRepository(session)
    
    async def list_delivery_centers(self) -> List[DeliveryCenterResponse]:
        """List all delivery centers."""
        delivery_centers = await self.delivery_center_repo.list_all()
        return [DeliveryCenterResponse.model_validate(dc) for dc in delivery_centers]










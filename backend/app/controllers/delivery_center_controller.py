"""
Delivery Center controller.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.base_controller import BaseController
from app.services.delivery_center_service import DeliveryCenterService
from app.schemas.delivery_center import DeliveryCenterListResponse


class DeliveryCenterController(BaseController):
    """Controller for delivery center operations."""
    
    def __init__(self, session: AsyncSession):
        self.delivery_center_service = DeliveryCenterService(session)
    
    async def list_delivery_centers(self) -> DeliveryCenterListResponse:
        """List all delivery centers."""
        delivery_centers = await self.delivery_center_service.list_delivery_centers()
        return DeliveryCenterListResponse(items=delivery_centers, total=len(delivery_centers))








"""
Delivery Center controller.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.base_controller import BaseController
from app.services.delivery_center_service import DeliveryCenterService
from app.schemas.delivery_center import (
    DeliveryCenterCreate,
    DeliveryCenterUpdate,
    DeliveryCenterResponse,
    DeliveryCenterListResponse,
    DeliveryCenterApproverCreate,
    DeliveryCenterApproverResponse,
    DeliveryCenterApproverListResponse,
    EmployeeApproverSummary,
)


class DeliveryCenterController(BaseController):
    """Controller for delivery center operations."""
    
    def __init__(self, session: AsyncSession):
        self.delivery_center_service = DeliveryCenterService(session)
    
    async def create_delivery_center(self, delivery_center_data: DeliveryCenterCreate) -> DeliveryCenterResponse:
        """Create a new delivery center."""
        return await self.delivery_center_service.create_delivery_center(delivery_center_data)
    
    async def get_delivery_center(self, delivery_center_id: UUID, include_approvers: bool = False) -> Optional[DeliveryCenterResponse]:
        """Get delivery center by ID."""
        return await self.delivery_center_service.get_delivery_center(delivery_center_id, include_approvers)
    
    async def list_delivery_centers(self, include_approvers: bool = False) -> DeliveryCenterListResponse:
        """List all delivery centers."""
        delivery_centers = await self.delivery_center_service.list_delivery_centers(include_approvers)
        return DeliveryCenterListResponse(items=delivery_centers, total=len(delivery_centers))
    
    async def get_delivery_center_approvers(self, delivery_center_id: UUID) -> DeliveryCenterApproverListResponse:
        """Get all approvers for a delivery center."""
        return await self.delivery_center_service.get_delivery_center_approvers(delivery_center_id)
    
    async def add_delivery_center_approver(
        self,
        delivery_center_id: UUID,
        approver_data: DeliveryCenterApproverCreate,
    ) -> DeliveryCenterApproverResponse:
        """Add an approver to a delivery center."""
        return await self.delivery_center_service.add_delivery_center_approver(delivery_center_id, approver_data)
    
    async def remove_delivery_center_approver(
        self,
        delivery_center_id: UUID,
        employee_id: UUID,
    ) -> bool:
        """Remove an approver from a delivery center."""
        return await self.delivery_center_service.remove_delivery_center_approver(delivery_center_id, employee_id)
    
    async def get_employees_for_delivery_center(self, delivery_center_id: UUID) -> List[EmployeeApproverSummary]:
        """Get all employees that belong to a delivery center (for selecting approvers)."""
        return await self.delivery_center_service.get_employees_for_delivery_center(delivery_center_id)
    
    async def update_delivery_center(
        self,
        delivery_center_id: UUID,
        delivery_center_data: DeliveryCenterUpdate,
    ) -> Optional[DeliveryCenterResponse]:
        """Update a delivery center."""
        return await self.delivery_center_service.update_delivery_center(
            delivery_center_id, delivery_center_data
        )
    
    async def delete_delivery_center(self, delivery_center_id: UUID) -> bool:
        """Delete a delivery center."""
        return await self.delivery_center_service.delete_delivery_center(delivery_center_id)










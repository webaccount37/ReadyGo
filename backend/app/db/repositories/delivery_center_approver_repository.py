"""
Delivery Center Approver repository for database operations.
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.delivery_center_approver import DeliveryCenterApprover
from app.models.employee import Employee


class DeliveryCenterApproverRepository(BaseRepository[DeliveryCenterApprover]):
    """Repository for delivery center approver operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(DeliveryCenterApprover, session)
    
    async def get_by_delivery_center(self, delivery_center_id: UUID) -> List[DeliveryCenterApprover]:
        """Get all approvers for a delivery center."""
        query = select(DeliveryCenterApprover).options(
            selectinload(DeliveryCenterApprover.employee)
        ).where(DeliveryCenterApprover.delivery_center_id == delivery_center_id)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_by_employee(self, employee_id: UUID) -> List[DeliveryCenterApprover]:
        """Get all delivery centers for an employee."""
        query = select(DeliveryCenterApprover).where(
            DeliveryCenterApprover.employee_id == employee_id
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def create_association(self, delivery_center_id: UUID, employee_id: UUID) -> DeliveryCenterApprover:
        """Create an association between a delivery center and an employee."""
        association = DeliveryCenterApprover(
            delivery_center_id=delivery_center_id,
            employee_id=employee_id
        )
        self.session.add(association)
        await self.session.flush()
        await self.session.refresh(association)
        return association
    
    async def delete_association(self, delivery_center_id: UUID, employee_id: UUID) -> bool:
        """Delete an association between a delivery center and an employee."""
        result = await self.session.execute(
            delete(DeliveryCenterApprover).where(
                DeliveryCenterApprover.delivery_center_id == delivery_center_id,
                DeliveryCenterApprover.employee_id == employee_id
            )
        )
        await self.session.flush()
        return result.rowcount > 0
    
    async def get_association(self, delivery_center_id: UUID, employee_id: UUID) -> Optional[DeliveryCenterApprover]:
        """Get a specific association."""
        result = await self.session.execute(
            select(DeliveryCenterApprover).where(
                DeliveryCenterApprover.delivery_center_id == delivery_center_id,
                DeliveryCenterApprover.employee_id == employee_id
            )
        )
        return result.scalar_one_or_none()


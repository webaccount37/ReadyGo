"""
Delivery Center service with business logic.
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.db.repositories.delivery_center_repository import DeliveryCenterRepository
from app.db.repositories.delivery_center_approver_repository import DeliveryCenterApproverRepository
from app.db.repositories.employee_repository import EmployeeRepository
from app.schemas.delivery_center import (
    DeliveryCenterCreate,
    DeliveryCenterUpdate,
    DeliveryCenterResponse,
    DeliveryCenterApproverCreate,
    EmployeeApproverSummary,
    DeliveryCenterApproverResponse,
    DeliveryCenterApproverListResponse,
)
from app.models.delivery_center_approver import DeliveryCenterApprover


class DeliveryCenterService(BaseService):
    """Service for delivery center operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.delivery_center_repo = DeliveryCenterRepository(session)
        self.approver_repo = DeliveryCenterApproverRepository(session)
        self.employee_repo = EmployeeRepository(session)
    
    async def create_delivery_center(self, delivery_center_data: DeliveryCenterCreate) -> DeliveryCenterResponse:
        """Create a new delivery center."""
        delivery_center_dict = delivery_center_data.model_dump()
        delivery_center = await self.delivery_center_repo.create(**delivery_center_dict)
        await self.session.commit()
        await self.session.refresh(delivery_center)
        return DeliveryCenterResponse.model_validate(delivery_center)
    
    async def get_delivery_center(self, delivery_center_id: UUID, include_approvers: bool = False) -> Optional[DeliveryCenterResponse]:
        """Get delivery center by ID."""
        from app.models.delivery_center import DeliveryCenter
        from app.models.opportunity import Opportunity
        from app.models.employee import Employee
        from sqlalchemy import select, func
        
        query = select(DeliveryCenter).where(DeliveryCenter.id == delivery_center_id)
        result = await self.session.execute(query)
        delivery_center = result.scalar_one_or_none()
        
        if not delivery_center:
            return None
        
        # Get counts
        opportunity_count_query = select(func.count(Opportunity.id)).where(Opportunity.delivery_center_id == delivery_center_id)
        opportunity_count_result = await self.session.execute(opportunity_count_query)
        opportunities_count = opportunity_count_result.scalar() or 0
        
        employee_count_query = select(func.count(Employee.id)).where(Employee.delivery_center_id == delivery_center_id)
        employee_count_result = await self.session.execute(employee_count_query)
        employees_count = employee_count_result.scalar() or 0
        
        # Build response data without approvers first to avoid lazy loading issues
        response_data = DeliveryCenterResponse(
            id=delivery_center.id,
            name=delivery_center.name,
            code=delivery_center.code,
            default_currency=delivery_center.default_currency,
            approvers=None,
            opportunities_count=opportunities_count,
            employees_count=employees_count,
        )
        
        if include_approvers:
            approvers = await self.approver_repo.get_by_delivery_center(delivery_center_id)
            response_data.approvers = [
                EmployeeApproverSummary(
                    id=approver.employee.id,
                    first_name=approver.employee.first_name,
                    last_name=approver.employee.last_name,
                    email=approver.employee.email,
                )
                for approver in approvers
            ]
        
        return response_data
    
    async def list_delivery_centers(self, include_approvers: bool = False) -> List[DeliveryCenterResponse]:
        """List all delivery centers."""
        from app.models.delivery_center import DeliveryCenter
        from app.models.opportunity import Opportunity
        from app.models.employee import Employee
        from sqlalchemy import select, func
        
        query = select(DeliveryCenter).order_by(DeliveryCenter.name)
        result = await self.session.execute(query)
        delivery_centers = list(result.scalars().all())
        
        # Get counts for all delivery centers in one query
        if not delivery_centers:
            return []
        
        dc_ids = [dc.id for dc in delivery_centers]
        
        # Count opportunities per delivery center
        opportunity_counts_query = select(
            Opportunity.delivery_center_id,
            func.count(Opportunity.id).label('count')
        ).where(Opportunity.delivery_center_id.in_(dc_ids)).group_by(Opportunity.delivery_center_id)
        opportunity_counts_result = await self.session.execute(opportunity_counts_query)
        opportunity_counts_dict = {}
        for row in opportunity_counts_result.all():
            # Row is a tuple-like object: (delivery_center_id, count)
            dc_id, count = row
            opportunity_counts_dict[dc_id] = count
        
        # Count employees per delivery center (only count non-NULL delivery_center_id)
        employee_counts_query = select(
            Employee.delivery_center_id,
            func.count(Employee.id).label('count')
        ).where(
            Employee.delivery_center_id.in_(dc_ids),
            Employee.delivery_center_id.isnot(None)
        ).group_by(Employee.delivery_center_id)
        employee_counts_result = await self.session.execute(employee_counts_query)
        employee_counts_dict = {}
        for row in employee_counts_result.all():
            # Row is a tuple-like object: (delivery_center_id, count)
            dc_id, count = row
            employee_counts_dict[dc_id] = count
        
        responses = []
        for dc in delivery_centers:
            # Build response data without approvers first to avoid lazy loading issues
            response_data = DeliveryCenterResponse(
                id=dc.id,
                name=dc.name,
                code=dc.code,
                default_currency=dc.default_currency,
                approvers=None,
                opportunities_count=opportunity_counts_dict.get(dc.id, 0),
                employees_count=employee_counts_dict.get(dc.id, 0),
            )
            
            if include_approvers:
                approvers = await self.approver_repo.get_by_delivery_center(dc.id)
                response_data.approvers = [
                    EmployeeApproverSummary(
                        id=approver.employee.id,
                        first_name=approver.employee.first_name,
                        last_name=approver.employee.last_name,
                        email=approver.employee.email,
                    )
                    for approver in approvers
                ]
            responses.append(response_data)
        
        return responses
    
    async def update_delivery_center(
        self,
        delivery_center_id: UUID,
        delivery_center_data: DeliveryCenterUpdate,
    ) -> Optional[DeliveryCenterResponse]:
        """Update a delivery center."""
        delivery_center = await self.delivery_center_repo.get(delivery_center_id)
        if not delivery_center:
            return None
        
        update_dict = delivery_center_data.model_dump(exclude_unset=True)
        updated = await self.delivery_center_repo.update(delivery_center_id, **update_dict)
        await self.session.commit()
        await self.session.refresh(updated)
        return DeliveryCenterResponse.model_validate(updated)
    
    async def delete_delivery_center(self, delivery_center_id: UUID) -> bool:
        """Delete a delivery center."""
        delivery_center = await self.delivery_center_repo.get(delivery_center_id)
        if not delivery_center:
            return False
        
        await self.delivery_center_repo.delete(delivery_center_id)
        await self.session.commit()
        return True
    
    async def get_delivery_center_approvers(self, delivery_center_id: UUID) -> DeliveryCenterApproverListResponse:
        """Get all approvers for a delivery center."""
        approvers = await self.approver_repo.get_by_delivery_center(delivery_center_id)
        items = [
            DeliveryCenterApproverResponse(
                delivery_center_id=approver.delivery_center_id,
                employee_id=approver.employee_id,
                employee=EmployeeApproverSummary(
                    id=approver.employee.id,
                    first_name=approver.employee.first_name,
                    last_name=approver.employee.last_name,
                    email=approver.employee.email,
                )
            )
            for approver in approvers
        ]
        return DeliveryCenterApproverListResponse(items=items, total=len(items))
    
    async def add_delivery_center_approver(
        self,
        delivery_center_id: UUID,
        approver_data: DeliveryCenterApproverCreate,
    ) -> DeliveryCenterApproverResponse:
        """Add an approver to a delivery center."""
        # Verify delivery center exists
        delivery_center = await self.delivery_center_repo.get(delivery_center_id)
        if not delivery_center:
            raise ValueError("Delivery center not found")
        
        # Verify employee exists and belongs to this delivery center
        employee = await self.employee_repo.get(approver_data.employee_id)
        if not employee:
            raise ValueError("Employee not found")
        
        if employee.delivery_center_id != delivery_center_id:
            raise ValueError("Employee must belong to the same delivery center")
        
        # Check if association already exists
        existing = await self.approver_repo.get_association(delivery_center_id, approver_data.employee_id)
        if existing:
            raise ValueError("Employee is already an approver for this delivery center")
        
        # Create association
        approver = await self.approver_repo.create_association(delivery_center_id, approver_data.employee_id)
        await self.session.commit()
        await self.session.refresh(approver)
        
        # Load employee relationship
        await self.session.refresh(approver, ["employee"])
        
        return DeliveryCenterApproverResponse(
            delivery_center_id=approver.delivery_center_id,
            employee_id=approver.employee_id,
            employee=EmployeeApproverSummary(
                id=approver.employee.id,
                first_name=approver.employee.first_name,
                last_name=approver.employee.last_name,
                email=approver.employee.email,
            )
        )
    
    async def remove_delivery_center_approver(
        self,
        delivery_center_id: UUID,
        employee_id: UUID,
    ) -> bool:
        """Remove an approver from a delivery center."""
        deleted = await self.approver_repo.delete_association(delivery_center_id, employee_id)
        await self.session.commit()
        return deleted
    
    async def get_employees_for_delivery_center(self, delivery_center_id: UUID) -> List[EmployeeApproverSummary]:
        """Get all employees that belong to a delivery center (for selecting approvers)."""
        delivery_center = await self.delivery_center_repo.get(delivery_center_id)
        if not delivery_center:
            return []
        
        from app.models.employee import Employee
        from sqlalchemy import select
        
        result = await self.session.execute(
            select(Employee).where(Employee.delivery_center_id == delivery_center_id)
        )
        employees = list(result.scalars().all())
        
        return [
            EmployeeApproverSummary(
                id=emp.id,
                first_name=emp.first_name,
                last_name=emp.last_name,
                email=emp.email,
            )
            for emp in employees
        ]










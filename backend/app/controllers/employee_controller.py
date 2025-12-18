"""
Employee controller.
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.base_controller import BaseController
from app.services.employee_service import EmployeeService
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeResponse, EmployeeListResponse
from app.schemas.relationships import LinkEmployeesToEngagementRequest, LinkEmployeesToReleaseRequest, UnlinkRequest


class EmployeeController(BaseController):
    """Controller for employee operations."""
    
    def __init__(self, session: AsyncSession):
        self.employee_service = EmployeeService(session)
    
    async def create_employee(self, employee_data: EmployeeCreate) -> EmployeeResponse:
        """Create a new employee."""
        return await self.employee_service.create_employee(employee_data)
    
    async def get_employee(self, employee_id: UUID, include_relationships: bool = False) -> Optional[EmployeeResponse]:
        """Get employee by ID."""
        if include_relationships:
            return await self.employee_service.get_employee_with_relationships(employee_id)
        return await self.employee_service.get_employee(employee_id)
    
    async def list_employees(
        self,
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None,
        employee_type: Optional[str] = None,
        billable: Optional[bool] = None,
    ) -> EmployeeListResponse:
        """List employees with optional filters."""
        employees, total = await self.employee_service.list_employees(
            skip=skip,
            limit=limit,
            status=status,
            employee_type=employee_type,
            billable=billable,
        )
        return EmployeeListResponse(items=employees, total=total)
    
    async def update_employee(
        self,
        employee_id: UUID,
        employee_data: EmployeeUpdate,
    ) -> Optional[EmployeeResponse]:
        """Update an employee."""
        return await self.employee_service.update_employee(employee_id, employee_data)
    
    async def delete_employee(self, employee_id: UUID) -> bool:
        """Delete an employee."""
        return await self.employee_service.delete_employee(employee_id)
    
    async def link_employees_to_engagement(
        self,
        engagement_id: UUID,
        request: LinkEmployeesToEngagementRequest,
    ) -> bool:
        """Link employees to an engagement."""
        return await self.employee_service.link_employees_to_engagement(
            engagement_id,
            request,
        )
    
    async def unlink_employees_from_engagement(
        self,
        engagement_id: UUID,
        request: UnlinkRequest,
    ) -> bool:
        """Unlink employees from an engagement."""
        return await self.employee_service.unlink_employees_from_engagement(
            engagement_id,
            request.ids,
        )
    
    async def link_employees_to_release(
        self,
        release_id: UUID,
        request: LinkEmployeesToReleaseRequest,
    ) -> bool:
        """Link employees to a release."""
        return await self.employee_service.link_employees_to_release(
            release_id,
            request,
        )
    
    async def unlink_employees_from_release(
        self,
        release_id: UUID,
        request: UnlinkRequest,
    ) -> bool:
        """Unlink employees from a release."""
        return await self.employee_service.unlink_employees_from_release(
            release_id,
            request.ids,
        )



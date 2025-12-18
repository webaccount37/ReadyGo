"""
Employee repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.employee import Employee, EmployeeStatus, EmployeeType
from app.models.association_models import EmployeeEngagement, EmployeeRelease
from app.models.delivery_center import DeliveryCenter
from app.models.engagement import Engagement
from app.models.release import Release
from app.models.role import Role


class EmployeeRepository(BaseRepository[Employee]):
    """Repository for employee operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(Employee, session)
    
    async def get(self, id: UUID) -> Optional[Employee]:
        """Get employee by ID with delivery center eager loaded."""
        result = await self.session.execute(
            select(Employee)
            .options(
                selectinload(Employee.delivery_center),
            )
            .where(Employee.id == id)
        )
        return result.scalar_one_or_none()
    
    async def get_by_email(self, email: str) -> Optional[Employee]:
        """Get employee by email."""
        result = await self.session.execute(
            select(Employee).where(Employee.email == email)
        )
        return result.scalar_one_or_none()

    def _base_query(self):
        return select(Employee).options(
            selectinload(Employee.delivery_center),
            selectinload(Employee.engagement_associations).selectinload(EmployeeEngagement.engagement),
            selectinload(Employee.engagement_associations).selectinload(EmployeeEngagement.role),
            selectinload(Employee.engagement_associations).selectinload(EmployeeEngagement.delivery_center),
            selectinload(Employee.release_associations).selectinload(EmployeeRelease.release).selectinload(Release.engagement),
            selectinload(Employee.release_associations).selectinload(EmployeeRelease.role),
            selectinload(Employee.release_associations).selectinload(EmployeeRelease.delivery_center),
            selectinload(Employee.role),
        )

    async def list(
        self,
        skip: int = 0,
        limit: int = 100,
        **filters,
    ) -> List[Employee]:
        """List employees with delivery center eager loaded."""
        query = self._base_query()
        
        # Apply filters
        for key, value in filters.items():
            if hasattr(self.model, key):
                query = query.where(getattr(self.model, key) == value)
        
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_by_status(
        self,
        status: EmployeeStatus,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Employee]:
        """List employees by status."""
        query = self._base_query().where(Employee.status == status)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_by_type(
        self,
        employee_type: EmployeeType,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Employee]:
        """List employees by type."""
        query = self._base_query().where(Employee.employee_type == employee_type)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_billable(
        self,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Employee]:
        """List billable employees."""
        query = self._base_query().where(Employee.billable == True)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_with_relationships(self, employee_id: UUID) -> Optional[Employee]:
        """Get employee with related engagements and releases."""
        result = await self.session.execute(
            select(Employee)
            .options(
                selectinload(Employee.engagement_associations).selectinload(EmployeeEngagement.engagement),
                selectinload(Employee.engagement_associations).selectinload(EmployeeEngagement.role),
                selectinload(Employee.engagement_associations).selectinload(EmployeeEngagement.delivery_center),
                selectinload(Employee.release_associations).selectinload(EmployeeRelease.release).selectinload(Release.engagement),
                selectinload(Employee.release_associations).selectinload(EmployeeRelease.role),
                selectinload(Employee.release_associations).selectinload(EmployeeRelease.delivery_center),
                selectinload(Employee.role),
                selectinload(Employee.delivery_center),
            )
            .where(Employee.id == employee_id)
        )
        return result.scalar_one_or_none()



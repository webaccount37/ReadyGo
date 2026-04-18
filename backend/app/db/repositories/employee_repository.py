"""
Employee repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, cast, String
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.db.search_helpers import ilike_pattern, normalize_sort_order
from app.models.employee import Employee, EmployeeStatus, EmployeeType
# TODO: Refactor to use ESTIMATE_LINE_ITEMS from active estimates instead of association models
from app.models.delivery_center import DeliveryCenter
from app.models.opportunity import Opportunity
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
            # TODO: Load relationships from ESTIMATE_LINE_ITEMS where ACTIVE_VERSION = TRUE
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

    async def count(self, **filters) -> int:
        """Count employees matching optional column filters (same keys as list())."""
        query = select(func.count(Employee.id))
        for key, value in filters.items():
            if hasattr(self.model, key):
                query = query.where(getattr(self.model, key) == value)
        result = await self.session.execute(query)
        return int(result.scalar_one() or 0)

    async def count_by_status(self, status: EmployeeStatus) -> int:
        result = await self.session.execute(
            select(func.count(Employee.id)).where(Employee.status == status)
        )
        return int(result.scalar_one() or 0)

    async def count_by_type(self, employee_type: EmployeeType) -> int:
        result = await self.session.execute(
            select(func.count(Employee.id)).where(Employee.employee_type == employee_type)
        )
        return int(result.scalar_one() or 0)

    async def count_billable(self) -> int:
        result = await self.session.execute(
            select(func.count(Employee.id)).where(Employee.billable == True)
        )
        return int(result.scalar_one() or 0)
    
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
        """Get employee with related opportunities (from active estimate line items)."""
        # TODO: Refactor to load relationships from ESTIMATE_LINE_ITEMS where ACTIVE_VERSION = TRUE
        result = await self.session.execute(
            select(Employee)
            .options(
                selectinload(Employee.delivery_center),
            )
            .where(Employee.id == employee_id)
        )
        return result.scalar_one_or_none()

    async def list_paginated(
        self,
        skip: int = 0,
        limit: int = 100,
        status: Optional[EmployeeStatus] = None,
        employee_type: Optional[EmployeeType] = None,
        billable: Optional[bool] = None,
        search: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_order: Optional[str] = None,
    ) -> List[Employee]:
        query = self._base_query().join(
            DeliveryCenter, Employee.delivery_center_id == DeliveryCenter.id, isouter=True
        )
        if status is not None:
            query = query.where(Employee.status == status)
        if employee_type is not None:
            query = query.where(Employee.employee_type == employee_type)
        if billable is True:
            query = query.where(Employee.billable == True)
        pattern = ilike_pattern(search)
        if pattern:
            et = cast(Employee.employee_type, String)
            st = cast(Employee.status, String)
            query = query.where(
                or_(
                    Employee.first_name.ilike(pattern, escape="\\"),
                    Employee.last_name.ilike(pattern, escape="\\"),
                    Employee.email.ilike(pattern, escape="\\"),
                    Employee.role_title.ilike(pattern, escape="\\"),
                    et.ilike(pattern, escape="\\"),
                    st.ilike(pattern, escape="\\"),
                    DeliveryCenter.name.ilike(pattern, escape="\\"),
                    DeliveryCenter.code.ilike(pattern, escape="\\"),
                )
            )
        sk = sort_by or "last_name"
        desc = normalize_sort_order(sort_order) == "desc"
        col_map = {
            "first_name": Employee.first_name,
            "last_name": Employee.last_name,
            "email": Employee.email,
            "role_title": Employee.role_title,
            "status": Employee.status,
            "employee_type": Employee.employee_type,
            "start_date": Employee.start_date,
            "end_date": Employee.end_date,
            "billable": Employee.billable,
            "delivery_center": DeliveryCenter.name,
            "internal_cost_rate": Employee.internal_cost_rate,
            "internal_bill_rate": Employee.internal_bill_rate,
            "external_bill_rate": Employee.external_bill_rate,
            "timezone": Employee.timezone,
        }
        col = col_map.get(sk, Employee.last_name)
        if desc:
            query = query.order_by(col.desc().nulls_last(), Employee.first_name.desc())
        else:
            query = query.order_by(col.asc().nulls_last(), Employee.first_name.asc())
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def count_paginated(
        self,
        status: Optional[EmployeeStatus] = None,
        employee_type: Optional[EmployeeType] = None,
        billable: Optional[bool] = None,
        search: Optional[str] = None,
    ) -> int:
        query = select(func.count(Employee.id)).select_from(Employee).join(
            DeliveryCenter, Employee.delivery_center_id == DeliveryCenter.id, isouter=True
        )
        if status is not None:
            query = query.where(Employee.status == status)
        if employee_type is not None:
            query = query.where(Employee.employee_type == employee_type)
        if billable is True:
            query = query.where(Employee.billable == True)
        pattern = ilike_pattern(search)
        if pattern:
            et = cast(Employee.employee_type, String)
            st = cast(Employee.status, String)
            query = query.where(
                or_(
                    Employee.first_name.ilike(pattern, escape="\\"),
                    Employee.last_name.ilike(pattern, escape="\\"),
                    Employee.email.ilike(pattern, escape="\\"),
                    Employee.role_title.ilike(pattern, escape="\\"),
                    et.ilike(pattern, escape="\\"),
                    st.ilike(pattern, escape="\\"),
                    DeliveryCenter.name.ilike(pattern, escape="\\"),
                    DeliveryCenter.code.ilike(pattern, escape="\\"),
                )
            )
        result = await self.session.execute(query)
        return int(result.scalar_one() or 0)



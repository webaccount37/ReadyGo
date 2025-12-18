"""
Release service with business logic.
"""

from typing import List, Optional
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.db.repositories.release_repository import ReleaseRepository
from app.db.repositories.employee_repository import EmployeeRepository
from app.db.repositories.role_repository import RoleRepository
from app.schemas.release import ReleaseCreate, ReleaseUpdate, ReleaseResponse


class ReleaseService(BaseService):
    """Service for release operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.release_repo = ReleaseRepository(session)
        self.employee_repo = EmployeeRepository(session)
        self.role_repo = RoleRepository(session)
    
    async def create_release(self, release_data: ReleaseCreate) -> ReleaseResponse:
        """Create a new release."""
        release_dict = release_data.model_dump(exclude_unset=True)
        release = await self.release_repo.create(**release_dict)
        await self.session.commit()
        # Reload with engagement relationship
        release = await self.release_repo.get(release.id)
        if not release:
            raise ValueError("Failed to retrieve created release")
        return self._to_response(release, include_relationships=False)
    
    async def get_release(self, release_id: UUID) -> Optional[ReleaseResponse]:
        """Get release by ID."""
        release = await self.release_repo.get(release_id)
        if not release:
            return None
        return self._to_response(release, include_relationships=False)
    
    async def get_release_with_relationships(self, release_id: UUID) -> Optional[ReleaseResponse]:
        """Get release with related entities."""
        release = await self.release_repo.get_with_relationships(release_id)
        if not release:
            return None
        return self._to_response(release, include_relationships=True)
    
    async def list_releases(
        self,
        skip: int = 0,
        limit: int = 100,
        engagement_id: Optional[UUID] = None,
        status: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> tuple[List[ReleaseResponse], int]:
        """List releases with optional filters."""
        from app.models.release import ReleaseStatus
        
        if engagement_id:
            releases = await self.release_repo.list_by_engagement(engagement_id, skip, limit)
        elif status:
            try:
                status_enum = ReleaseStatus(status)
                releases = await self.release_repo.list_by_status(status_enum, skip, limit)
            except ValueError:
                releases = []
        elif start_date or end_date:
            releases = await self.release_repo.list_by_date_range(start_date, end_date, skip, limit)
        else:
            releases = await self.release_repo.list(skip=skip, limit=limit)
        
        total = len(releases)
        return [self._to_response(rel, include_relationships=False) for rel in releases], total
    
    async def update_release(
        self,
        release_id: UUID,
        release_data: ReleaseUpdate,
    ) -> Optional[ReleaseResponse]:
        """Update a release."""
        release = await self.release_repo.get(release_id)
        if not release:
            return None
        
        update_dict = release_data.model_dump(exclude_unset=True)
        updated = await self.release_repo.update(release_id, **update_dict)
        await self.session.commit()
        # Reload with project relationship
        updated = await self.release_repo.get(release_id)
        if not updated:
            return None
        return self._to_response(updated, include_relationships=False)
    
    async def delete_release(self, release_id: UUID) -> bool:
        """Delete a release."""
        deleted = await self.release_repo.delete(release_id)
        await self.session.commit()
        return deleted
    
    async def link_roles_to_release(
        self,
        release_id: UUID,
        role_ids: List[UUID],
    ) -> bool:
        """Link roles to a release."""
        release = await self.release_repo.get_with_relationships(release_id)
        if not release:
            return False
        
        roles = []
        for role_id in role_ids:
            role = await self.role_repo.get(role_id)
            if role:
                roles.append(role)
        
        release.roles.extend(roles)
        await self.session.commit()
        return True
    
    async def unlink_roles_from_release(
        self,
        release_id: UUID,
        role_ids: List[UUID],
    ) -> bool:
        """Unlink roles from a release."""
        release = await self.release_repo.get_with_relationships(release_id)
        if not release:
            return False
        
        release.roles = [role for role in release.roles if role.id not in role_ids]
        await self.session.commit()
        return True
    
    def _to_response(self, release, include_relationships: bool = False) -> ReleaseResponse:
        """Convert release model to response schema."""
        import logging
        logger = logging.getLogger(__name__)
        engagement_name = None
        if hasattr(release, 'engagement') and release.engagement:
            engagement_name = release.engagement.name
        
        billing_term_name = None
        if hasattr(release, 'billing_term') and release.billing_term:
            billing_term_name = release.billing_term.name
        
        delivery_center_name = None
        if hasattr(release, 'delivery_center') and release.delivery_center:
            delivery_center_name = release.delivery_center.name
        
        release_dict = {
            "id": release.id,
            "name": release.name,
            "engagement_id": release.engagement_id,
            "start_date": release.start_date,
            "end_date": release.end_date,
            "budget": release.budget,
            "status": release.status,
            "billing_term_id": release.billing_term_id,
            "description": release.description,
            "default_currency": release.default_currency,
            "delivery_center_id": release.delivery_center_id,
            "attributes": release.attributes,
            "engagement_name": engagement_name,
            "billing_term_name": billing_term_name,
            "delivery_center_name": delivery_center_name,
        }
        
        # Include employees if relationships are requested
        if include_relationships:
            employees = []
            if hasattr(release, 'employee_associations') and release.employee_associations:
                for assoc in release.employee_associations:
                    # Safety check: ensure association belongs to this release
                    if assoc.release_id != release.id:
                        continue
                    
                    if assoc.employee:
                        # Log dates for debugging (similar to Quote service)
                        start_date_iso = assoc.start_date.isoformat() if assoc.start_date else None
                        end_date_iso = assoc.end_date.isoformat() if assoc.end_date else None
                        logger.info(f"  === RELEASE SERVICE: SERIALIZING EMPLOYEE DATES ===")
                        logger.info(f"  Employee {assoc.employee.id} on Release {release.id}")
                        logger.info(f"  assoc.start_date = {assoc.start_date} (type: {type(assoc.start_date)})")
                        logger.info(f"  assoc.end_date = {assoc.end_date} (type: {type(assoc.end_date)})")
                        if assoc.start_date:
                            logger.info(f"  assoc.start_date.isoformat() = {start_date_iso}")
                        if assoc.end_date:
                            logger.info(f"  assoc.end_date.isoformat() = {end_date_iso}")
                        logger.info(f"  Final ISO strings: start_date={start_date_iso}, end_date={end_date_iso}")
                        logger.info(f"  About to add to employees list: start_date={start_date_iso} (type: {type(start_date_iso)}), end_date={end_date_iso} (type: {type(end_date_iso)})")
                        
                        employees.append({
                            "id": str(assoc.employee.id),
                            "first_name": assoc.employee.first_name,
                            "last_name": assoc.employee.last_name,
                            "email": assoc.employee.email,
                            "role_id": str(assoc.role_id) if assoc.role_id else None,
                            "role_name": getattr(assoc.role, "role_name", None) if assoc.role else None,
                            "start_date": start_date_iso,  # Already ISO string "YYYY-MM-DD"
                            "end_date": end_date_iso,  # Already ISO string "YYYY-MM-DD"
                            "project_rate": float(assoc.project_rate) if assoc.project_rate else None,
                            "delivery_center": getattr(assoc.delivery_center, "code", None) if assoc.delivery_center else None,
                        })
                        logger.info(f"  Added employee to list. Dict start_date={employees[-1]['start_date']} (type: {type(employees[-1]['start_date'])}), end_date={employees[-1]['end_date']} (type: {type(employees[-1]['end_date'])})")
            release_dict["employees"] = employees
            logger.info(f"  === AFTER ADDING EMPLOYEES TO RELEASE_DICT ===")
            if employees:
                logger.info(f"  First employee start_date={employees[0].get('start_date')} (type: {type(employees[0].get('start_date'))})")
                logger.info(f"  First employee end_date={employees[0].get('end_date')} (type: {type(employees[0].get('end_date'))})")
        
        response = ReleaseResponse.model_validate(release_dict)
        logger.info(f"  === AFTER PYDANTIC VALIDATION ===")
        if response.employees:
            logger.info(f"  Response employees[0].start_date={response.employees[0].get('start_date')} (type: {type(response.employees[0].get('start_date'))})")
            logger.info(f"  Response employees[0].end_date={response.employees[0].get('end_date')} (type: {type(response.employees[0].get('end_date'))})")
        return response


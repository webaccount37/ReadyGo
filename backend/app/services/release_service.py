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
from app.db.repositories.estimate_repository import EstimateRepository
from app.db.repositories.estimate_line_item_repository import EstimateLineItemRepository
from app.schemas.release import ReleaseCreate, ReleaseUpdate, ReleaseResponse
from sqlalchemy import select, and_
from app.models.estimate import Estimate, EstimateLineItem


class ReleaseService(BaseService):
    """Service for release operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.release_repo = ReleaseRepository(session)
        self.employee_repo = EmployeeRepository(session)
        self.role_repo = RoleRepository(session)
        self.estimate_repo = EstimateRepository(session)
        self.line_item_repo = EstimateLineItemRepository(session)
    
    async def create_release(self, release_data: ReleaseCreate) -> ReleaseResponse:
        """Create a new release."""
        release_dict = release_data.model_dump(exclude_unset=True)
        release = await self.release_repo.create(**release_dict)
        await self.session.flush()  # Flush to get release.id
        
        # Auto-create "INITIAL" estimate for the release
        # Check if an "INITIAL" estimate already exists (shouldn't happen, but safety check)
        from sqlalchemy import select, and_
        from app.models.estimate import Estimate
        existing_initial = await self.session.execute(
            select(Estimate).where(
                and_(
                    Estimate.release_id == release.id,
                    Estimate.name == "INITIAL"
                )
            )
        )
        if not existing_initial.scalar_one_or_none():
            # Create the INITIAL estimate
            initial_estimate = Estimate(
                release_id=release.id,
                name="INITIAL",
                active_version=True,  # First estimate is always active
            )
            self.session.add(initial_estimate)
            await self.session.flush()
        
        await self.session.commit()
        # Reload with engagement relationship
        release = await self.release_repo.get(release.id)
        if not release:
            raise ValueError("Failed to retrieve created release")
        return await self._to_response(release, include_relationships=False)
    
    async def get_release(self, release_id: UUID) -> Optional[ReleaseResponse]:
        """Get release by ID."""
        release = await self.release_repo.get(release_id)
        if not release:
            return None
        return await self._to_response(release, include_relationships=False)
    
    async def get_release_with_relationships(self, release_id: UUID) -> Optional[ReleaseResponse]:
        """Get release with related entities."""
        release = await self.release_repo.get_with_relationships(release_id)
        if not release:
            return None
        return await self._to_response(release, include_relationships=True)
    
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
        responses = []
        for rel in releases:
            responses.append(await self._to_response(rel, include_relationships=False))
        return responses, total
    
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
        return await self._to_response(updated, include_relationships=False)
    
    async def delete_release(self, release_id: UUID) -> bool:
        """Delete a release."""
        deleted = await self.release_repo.delete(release_id)
        await self.session.commit()
        return deleted
    
    async def _get_employees_from_active_estimates(self, release_id: UUID) -> List[dict]:
        """Get employees from active estimate line items for a release."""
        # Get active estimate for this release
        result = await self.session.execute(
            select(Estimate).where(
                and_(
                    Estimate.release_id == release_id,
                    Estimate.active_version == True
                )
            )
        )
        active_estimate = result.scalar_one_or_none()
        
        if not active_estimate:
            return []
        
        # Get line items from active estimate
        line_items = await self.line_item_repo.list_by_estimate(active_estimate.id)
        
        employees_dict = {}  # employee_id -> employee data
        
        for li in line_items:
            if not li.employee_id:
                continue
            
            employee_id = str(li.employee_id)
            
            # Get employee if not already in dict
            if employee_id not in employees_dict:
                employee = await self.employee_repo.get(li.employee_id)
                if not employee:
                    continue
                
                # Get role and delivery center from role_rate
                role_id = None
                role_name = None
                delivery_center_code = None
                
                if li.role_rate:
                    if li.role_rate.role:
                        role_id = str(li.role_rate.role.id)
                        role_name = li.role_rate.role.role_name
                    if li.role_rate.delivery_center:
                        delivery_center_code = li.role_rate.delivery_center.code
                
                employees_dict[employee_id] = {
                    "id": employee_id,
                    "first_name": employee.first_name,
                    "last_name": employee.last_name,
                    "email": employee.email,
                    "role_id": role_id,
                    "role_name": role_name,
                    "start_date": li.start_date.isoformat() if li.start_date else None,
                    "end_date": li.end_date.isoformat() if li.end_date else None,
                    "project_rate": float(li.rate) if li.rate else None,
                    "delivery_center": delivery_center_code,
                }
        
        return list(employees_dict.values())
    
    async def _to_response(self, release, include_relationships: bool = False) -> ReleaseResponse:
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
            employees = await self._get_employees_from_active_estimates(release.id)
            release_dict["employees"] = employees
        else:
            release_dict["employees"] = []
        
        response = ReleaseResponse.model_validate(release_dict)
        return response
    
    async def link_roles_to_release(
        self,
        release_id: UUID,
        role_ids: List[UUID],
    ) -> bool:
        """Link roles to a release.
        
        Note: Roles are now linked through estimate line items, not directly.
        This method is kept for API compatibility but does nothing.
        To link roles, create estimate line items with the desired role_rates.
        """
        # Roles are now linked through estimate line items, not directly to releases
        # This method is kept for backward compatibility but does nothing
        return True
    
    async def unlink_roles_from_release(
        self,
        release_id: UUID,
        role_ids: List[UUID],
    ) -> bool:
        """Unlink roles from a release.
        
        Note: Roles are now linked through estimate line items, not directly.
        This method is kept for API compatibility but does nothing.
        To unlink roles, remove estimate line items with the desired role_rates.
        """
        # Roles are now linked through estimate line items, not directly to releases
        # This method is kept for backward compatibility but does nothing
        return True


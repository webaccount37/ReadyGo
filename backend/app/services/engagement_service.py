"""
Engagement service with business logic.
"""

from typing import List, Optional
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.db.repositories.engagement_repository import EngagementRepository
from app.db.repositories.employee_repository import EmployeeRepository
from app.db.repositories.role_repository import RoleRepository
from app.db.repositories.estimate_repository import EstimateRepository
from app.db.repositories.estimate_line_item_repository import EstimateLineItemRepository
from app.schemas.engagement import EngagementCreate, EngagementUpdate, EngagementResponse
from sqlalchemy import select, and_
from app.models.estimate import Estimate, EstimateLineItem


class EngagementService(BaseService):
    """Service for engagement operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.engagement_repo = EngagementRepository(session)
        self.employee_repo = EmployeeRepository(session)
        self.role_repo = RoleRepository(session)
        self.estimate_repo = EstimateRepository(session)
        self.line_item_repo = EstimateLineItemRepository(session)
    
    async def create_engagement(self, engagement_data: EngagementCreate) -> EngagementResponse:
        """Create a new engagement."""
        engagement_dict = engagement_data.model_dump(exclude_unset=True)
        engagement = await self.engagement_repo.create(**engagement_dict)
        await self.session.flush()  # Flush to get engagement.id
        
        # Auto-create "INITIAL" estimate for the engagement
        # Check if an "INITIAL" estimate already exists (shouldn't happen, but safety check)
        from sqlalchemy import select, and_
        from app.models.estimate import Estimate
        existing_initial = await self.session.execute(
            select(Estimate).where(
                and_(
                    Estimate.engagement_id == engagement.id,
                    Estimate.name == "INITIAL"
                )
            )
        )
        if not existing_initial.scalar_one_or_none():
            # Create the INITIAL estimate
            initial_estimate = Estimate(
                engagement_id=engagement.id,
                name="INITIAL",
                active_version=True,  # First estimate is always active
            )
            self.session.add(initial_estimate)
            await self.session.flush()
        
        await self.session.commit()
        # Reload with opportunity relationship
        engagement = await self.engagement_repo.get(engagement.id)
        if not engagement:
            raise ValueError("Failed to retrieve created engagement")
        return await self._to_response(engagement, include_relationships=False)
    
    async def get_engagement(self, engagement_id: UUID) -> Optional[EngagementResponse]:
        """Get engagement by ID."""
        engagement = await self.engagement_repo.get(engagement_id)
        if not engagement:
            return None
        return await self._to_response(engagement, include_relationships=False)
    
    async def get_engagement_with_relationships(self, engagement_id: UUID) -> Optional[EngagementResponse]:
        """Get engagement with related entities."""
        engagement = await self.engagement_repo.get_with_relationships(engagement_id)
        if not engagement:
            return None
        return await self._to_response(engagement, include_relationships=True)
    
    async def list_engagements(
        self,
        skip: int = 0,
        limit: int = 100,
        opportunity_id: Optional[UUID] = None,
        status: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> tuple[List[EngagementResponse], int]:
        """List engagements with optional filters."""
        from app.models.engagement import EngagementStatus
        
        if opportunity_id:
            engagements = await self.engagement_repo.list_by_opportunity(opportunity_id, skip, limit)
        elif status:
            try:
                status_enum = EngagementStatus(status)
                engagements = await self.engagement_repo.list_by_status(status_enum, skip, limit)
            except ValueError:
                engagements = []
        elif start_date or end_date:
            engagements = await self.engagement_repo.list_by_date_range(start_date, end_date, skip, limit)
        else:
            engagements = await self.engagement_repo.list(skip=skip, limit=limit)
        
        total = len(engagements)
        responses = []
        for eng in engagements:
            responses.append(await self._to_response(eng, include_relationships=False))
        return responses, total
    
    async def update_engagement(
        self,
        engagement_id: UUID,
        engagement_data: EngagementUpdate,
    ) -> Optional[EngagementResponse]:
        """Update an engagement."""
        engagement = await self.engagement_repo.get(engagement_id)
        if not engagement:
            return None
        
        update_dict = engagement_data.model_dump(exclude_unset=True)
        updated = await self.engagement_repo.update(engagement_id, **update_dict)
        await self.session.commit()
        # Reload with project relationship
        updated = await self.engagement_repo.get(engagement_id)
        if not updated:
            return None
        return await self._to_response(updated, include_relationships=False)
    
    async def delete_engagement(self, engagement_id: UUID) -> bool:
        """Delete an engagement."""
        deleted = await self.engagement_repo.delete(engagement_id)
        await self.session.commit()
        return deleted
    
    async def _get_employees_from_active_estimates(self, engagement_id: UUID) -> List[dict]:
        """Get employees from active estimate line items for an engagement."""
        # Get active estimate for this engagement
        result = await self.session.execute(
            select(Estimate).where(
                and_(
                    Estimate.engagement_id == engagement_id,
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
    
    async def _to_response(self, engagement, include_relationships: bool = False) -> EngagementResponse:
        """Convert engagement model to response schema."""
        import logging
        logger = logging.getLogger(__name__)
        opportunity_name = None
        if hasattr(engagement, 'opportunity') and engagement.opportunity:
            opportunity_name = engagement.opportunity.name
        
        billing_term_name = None
        if hasattr(engagement, 'billing_term') and engagement.billing_term:
            billing_term_name = engagement.billing_term.name
        
        delivery_center_name = None
        if hasattr(engagement, 'delivery_center') and engagement.delivery_center:
            delivery_center_name = engagement.delivery_center.name
        
        engagement_dict = {
            "id": engagement.id,
            "name": engagement.name,
            "opportunity_id": engagement.opportunity_id,
            "start_date": engagement.start_date,
            "end_date": engagement.end_date,
            "budget": engagement.budget,
            "status": engagement.status,
            "billing_term_id": engagement.billing_term_id,
            "description": engagement.description,
            "default_currency": engagement.default_currency,
            "delivery_center_id": engagement.delivery_center_id,
            "attributes": engagement.attributes,
            "opportunity_name": opportunity_name,
            "billing_term_name": billing_term_name,
            "delivery_center_name": delivery_center_name,
        }
        
        # Include employees if relationships are requested
        if include_relationships:
            employees = await self._get_employees_from_active_estimates(engagement.id)
            engagement_dict["employees"] = employees
        else:
            engagement_dict["employees"] = []
        
        response = EngagementResponse.model_validate(engagement_dict)
        return response
    
    async def link_roles_to_engagement(
        self,
        engagement_id: UUID,
        role_ids: List[UUID],
    ) -> bool:
        """Link roles to an engagement.
        
        Note: Roles are now linked through estimate line items, not directly.
        This method is kept for API compatibility but does nothing.
        To link roles, create estimate line items with the desired role_rates.
        """
        # Roles are now linked through estimate line items, not directly to engagements
        # This method is kept for backward compatibility but does nothing
        return True
    
    async def unlink_roles_from_engagement(
        self,
        engagement_id: UUID,
        role_ids: List[UUID],
    ) -> bool:
        """Unlink roles from an engagement.
        
        Note: Roles are now linked through estimate line items, not directly.
        This method is kept for API compatibility but does nothing.
        To unlink roles, remove estimate line items with the desired role_rates.
        """
        # Roles are now linked through estimate line items, not directly to engagements
        # This method is kept for backward compatibility but does nothing
        return True



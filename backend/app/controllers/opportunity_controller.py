"""
Opportunity controller.
"""

from typing import Optional
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.base_controller import BaseController
from app.services.opportunity_service import OpportunityService
from app.schemas.opportunity import OpportunityCreate, OpportunityUpdate, OpportunityResponse, OpportunityListResponse
from app.schemas.relationships import LinkRolesToOpportunityRequest, UnlinkRequest


class OpportunityController(BaseController):
    """Controller for opportunity operations."""
    
    def __init__(self, session: AsyncSession):
        self.opportunity_service = OpportunityService(session)
    
    async def create_opportunity(self, opportunity_data: OpportunityCreate) -> OpportunityResponse:
        """Create a new opportunity."""
        return await self.opportunity_service.create_opportunity(opportunity_data)
    
    async def get_opportunity(self, opportunity_id: UUID, include_relationships: bool = False) -> Optional[OpportunityResponse]:
        """Get opportunity by ID."""
        if include_relationships:
            return await self.opportunity_service.get_opportunity_with_relationships(opportunity_id)
        return await self.opportunity_service.get_opportunity(opportunity_id)
    
    async def list_opportunities(
        self,
        skip: int = 0,
        limit: int = 100,
        account_id: Optional[UUID] = None,
        status: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> OpportunityListResponse:
        """List opportunities with optional filters."""
        opportunities, total = await self.opportunity_service.list_opportunities(
            skip=skip,
            limit=limit,
            account_id=account_id,
            status=status,
            start_date=start_date,
            end_date=end_date,
        )
        return OpportunityListResponse(items=opportunities, total=total)
    
    async def list_child_opportunities(
        self,
        parent_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> OpportunityListResponse:
        """List child opportunities of a parent."""
        opportunities, total = await self.opportunity_service.list_child_opportunities(parent_id, skip, limit)
        return OpportunityListResponse(items=opportunities, total=total)
    
    async def update_opportunity(
        self,
        opportunity_id: UUID,
        opportunity_data: OpportunityUpdate,
    ) -> Optional[OpportunityResponse]:
        """Update an opportunity."""
        return await self.opportunity_service.update_opportunity(opportunity_id, opportunity_data)
    
    async def delete_opportunity(self, opportunity_id: UUID) -> bool:
        """Delete an opportunity."""
        return await self.opportunity_service.delete_opportunity(opportunity_id)
    
    async def link_roles_to_opportunity(
        self,
        opportunity_id: UUID,
        request: LinkRolesToOpportunityRequest,
    ) -> bool:
        """Link roles to an opportunity."""
        return await self.opportunity_service.link_roles_to_opportunity(
            opportunity_id,
            request.role_ids,
        )
    
    async def unlink_roles_from_opportunity(
        self,
        opportunity_id: UUID,
        request: UnlinkRequest,
    ) -> bool:
        """Unlink roles from an opportunity."""
        return await self.opportunity_service.unlink_roles_from_opportunity(
            opportunity_id,
            request.ids,
        )


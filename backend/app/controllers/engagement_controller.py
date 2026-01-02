"""
Engagement controller.
"""

from typing import Optional
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.base_controller import BaseController
from app.services.engagement_service import EngagementService
from app.schemas.engagement import EngagementCreate, EngagementUpdate, EngagementResponse, EngagementListResponse
from app.schemas.relationships import LinkRolesToEngagementRequest, UnlinkRequest


class EngagementController(BaseController):
    """Controller for engagement operations."""
    
    def __init__(self, session: AsyncSession):
        self.engagement_service = EngagementService(session)
    
    async def create_engagement(self, engagement_data: EngagementCreate) -> EngagementResponse:
        """Create a new engagement."""
        # Validate that delivery_center_id is provided (Invoice Center)
        if not engagement_data.delivery_center_id:
            raise ValueError("delivery_center_id (Invoice Center) is required for engagement creation")
        return await self.engagement_service.create_engagement(engagement_data)
    
    async def get_engagement(self, engagement_id: UUID, include_relationships: bool = False) -> Optional[EngagementResponse]:
        """Get engagement by ID."""
        if include_relationships:
            return await self.engagement_service.get_engagement_with_relationships(engagement_id)
        return await self.engagement_service.get_engagement(engagement_id)
    
    async def list_engagements(
        self,
        skip: int = 0,
        limit: int = 100,
        opportunity_id: Optional[UUID] = None,
        status: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> EngagementListResponse:
        """List engagements with optional filters."""
        engagements, total = await self.engagement_service.list_engagements(
            skip=skip,
            limit=limit,
            opportunity_id=opportunity_id,
            status=status,
            start_date=start_date,
            end_date=end_date,
        )
        return EngagementListResponse(items=engagements, total=total)
    
    async def update_engagement(
        self,
        engagement_id: UUID,
        engagement_data: EngagementUpdate,
    ) -> Optional[EngagementResponse]:
        """Update an engagement."""
        return await self.engagement_service.update_engagement(engagement_id, engagement_data)
    
    async def delete_engagement(self, engagement_id: UUID) -> bool:
        """Delete an engagement."""
        return await self.engagement_service.delete_engagement(engagement_id)
    
    async def link_roles_to_engagement(
        self,
        engagement_id: UUID,
        request: LinkRolesToEngagementRequest,
    ) -> bool:
        """Link roles to an engagement."""
        return await self.engagement_service.link_roles_to_engagement(
            engagement_id,
            request.role_ids,
        )
    
    async def unlink_roles_from_engagement(
        self,
        engagement_id: UUID,
        request: UnlinkRequest,
    ) -> bool:
        """Unlink roles from an engagement."""
        return await self.engagement_service.unlink_roles_from_engagement(
            engagement_id,
            request.ids,
        )





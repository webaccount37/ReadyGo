"""
Engagement controller.
"""

from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.base_controller import BaseController
from app.services.engagement_service import EngagementService
from app.schemas.engagement import (
    EngagementCreate, EngagementUpdate, EngagementResponse, EngagementDetailResponse, EngagementListResponse,
    EngagementLineItemCreate, EngagementLineItemUpdate, EngagementLineItemResponse,
    EngagementWeeklyHoursCreate, EngagementWeeklyHoursResponse,
    EngagementPhaseCreate, EngagementPhaseUpdate, EngagementPhaseResponse,
    AutoFillRequest,
)


class EngagementController(BaseController):
    """Controller for engagement operations."""
    
    def __init__(self, session: AsyncSession):
        self.engagement_service = EngagementService(session)
    
    async def get_engagement(self, engagement_id: UUID) -> Optional[EngagementResponse]:
        """Get engagement by ID."""
        engagement = await self.engagement_service.engagement_repo.get(engagement_id)
        if not engagement:
            return None
        return await self.engagement_service._to_response(engagement, include_line_items=False)
    
    async def get_engagement_detail(self, engagement_id: UUID) -> Optional[EngagementDetailResponse]:
        """Get engagement with all line items and comparative summary."""
        return await self.engagement_service.get_engagement_detail(engagement_id)
    
    async def list_engagements(
        self,
        skip: int = 0,
        limit: int = 100,
        opportunity_id: Optional[UUID] = None,
        quote_id: Optional[UUID] = None,
    ) -> EngagementListResponse:
        """List engagements with optional filters."""
        engagements, total = await self.engagement_service.list_engagements(
            skip=skip,
            limit=limit,
            opportunity_id=opportunity_id,
            quote_id=quote_id,
        )
        return EngagementListResponse(items=engagements, total=total)
    
    async def update_engagement(
        self,
        engagement_id: UUID,
        engagement_data: EngagementUpdate,
    ) -> Optional[EngagementResponse]:
        """Update an engagement."""
        return await self.engagement_service.update_engagement(engagement_id, engagement_data)
    
    async def create_phase(
        self,
        engagement_id: UUID,
        phase_data: EngagementPhaseCreate,
    ) -> EngagementPhaseResponse:
        """Create a new phase."""
        return await self.engagement_service.create_phase(engagement_id, phase_data)
    
    async def update_phase(
        self,
        engagement_id: UUID,
        phase_id: UUID,
        phase_data: EngagementPhaseUpdate,
    ) -> Optional[EngagementPhaseResponse]:
        """Update a phase."""
        return await self.engagement_service.update_phase(engagement_id, phase_id, phase_data)
    
    async def delete_phase(
        self,
        engagement_id: UUID,
        phase_id: UUID,
    ) -> bool:
        """Delete a phase."""
        return await self.engagement_service.delete_phase(engagement_id, phase_id)
    
    async def create_line_item(
        self,
        engagement_id: UUID,
        line_item_data: EngagementLineItemCreate,
    ) -> EngagementLineItemResponse:
        """Create a new line item."""
        return await self.engagement_service.create_line_item(engagement_id, line_item_data)
    
    async def update_line_item(
        self,
        engagement_id: UUID,
        line_item_id: UUID,
        line_item_data: EngagementLineItemUpdate,
    ) -> Optional[EngagementLineItemResponse]:
        """Update a line item."""
        return await self.engagement_service.update_line_item(engagement_id, line_item_id, line_item_data)
    
    async def delete_line_item(
        self,
        engagement_id: UUID,
        line_item_id: UUID,
    ) -> bool:
        """Delete a line item."""
        return await self.engagement_service.delete_line_item(engagement_id, line_item_id)
    
    async def update_weekly_hours(
        self,
        engagement_id: UUID,
        line_item_id: UUID,
        weekly_hours: list[EngagementWeeklyHoursCreate],
    ) -> list[EngagementWeeklyHoursResponse]:
        """Update weekly hours for a line item."""
        return await self.engagement_service.update_weekly_hours(engagement_id, line_item_id, weekly_hours)
    
    async def auto_fill_hours(
        self,
        engagement_id: UUID,
        line_item_id: UUID,
        auto_fill_data: AutoFillRequest,
    ) -> list[EngagementLineItemResponse]:
        """Auto-fill weekly hours for a line item."""
        return await self.engagement_service.auto_fill_hours(engagement_id, line_item_id, auto_fill_data)

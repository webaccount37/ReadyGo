"""
Estimate controller.
"""

from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.base_controller import BaseController
from app.services.estimate_service import EstimateService
from app.schemas.estimate import (
    EstimateCreate, EstimateUpdate, EstimateResponse, EstimateDetailResponse, EstimateListResponse,
    EstimateLineItemCreate, EstimateLineItemUpdate, EstimateLineItemResponse,
    AutoFillRequest,
    EstimateTotalsResponse,
)


class EstimateController(BaseController):
    """Controller for estimate operations."""
    
    def __init__(self, session: AsyncSession):
        self.estimate_service = EstimateService(session)
    
    async def create_estimate(self, estimate_data: EstimateCreate) -> EstimateResponse:
        """Create a new estimate."""
        return await self.estimate_service.create_estimate(estimate_data)
    
    async def get_estimate(self, estimate_id: UUID, include_details: bool = False) -> Optional[EstimateResponse]:
        """Get estimate by ID."""
        if include_details:
            detail = await self.estimate_service.get_estimate_detail(estimate_id)
            if detail:
                return EstimateResponse.model_validate(detail.model_dump())
        return await self.estimate_service.get_estimate(estimate_id)
    
    async def get_estimate_detail(self, estimate_id: UUID) -> Optional[EstimateDetailResponse]:
        """Get estimate with all line items and weekly hours."""
        return await self.estimate_service.get_estimate_detail(estimate_id)
    
    async def list_estimates(
        self,
        skip: int = 0,
        limit: int = 100,
        release_id: Optional[UUID] = None,
        status: Optional[str] = None,
    ) -> EstimateListResponse:
        """List estimates with optional filters."""
        estimates, total = await self.estimate_service.list_estimates(
            skip=skip,
            limit=limit,
            release_id=release_id,
            status=status,
        )
        return EstimateListResponse(items=estimates, total=total)
    
    async def update_estimate(
        self,
        estimate_id: UUID,
        estimate_data: EstimateUpdate,
    ) -> Optional[EstimateResponse]:
        """Update an estimate."""
        return await self.estimate_service.update_estimate(estimate_id, estimate_data)
    
    async def delete_estimate(self, estimate_id: UUID) -> bool:
        """Delete an estimate."""
        return await self.estimate_service.delete_estimate(estimate_id)
    
    async def clone_estimate(self, estimate_id: UUID, new_name: str) -> EstimateDetailResponse:
        """Clone an estimate to create a variation."""
        return await self.estimate_service.clone_estimate(estimate_id, new_name)
    
    async def create_line_item(
        self,
        estimate_id: UUID,
        line_item_data: EstimateLineItemCreate,
    ) -> EstimateLineItemResponse:
        """Create a new line item."""
        return await self.estimate_service.create_line_item(estimate_id, line_item_data)
    
    async def update_line_item(
        self,
        estimate_id: UUID,
        line_item_id: UUID,
        line_item_data: EstimateLineItemUpdate,
    ) -> Optional[EstimateLineItemResponse]:
        """Update a line item."""
        return await self.estimate_service.update_line_item(estimate_id, line_item_id, line_item_data)
    
    async def delete_line_item(self, estimate_id: UUID, line_item_id: UUID) -> bool:
        """Delete a line item."""
        return await self.estimate_service.delete_line_item(estimate_id, line_item_id)
    
    async def auto_fill_hours(
        self,
        estimate_id: UUID,
        line_item_id: UUID,
        auto_fill_data: AutoFillRequest,
    ) -> list:
        """Auto-fill weekly hours for a line item."""
        return await self.estimate_service.auto_fill_hours(
            estimate_id, line_item_id, auto_fill_data
        )
    
    async def get_estimate_totals(self, estimate_id: UUID) -> EstimateTotalsResponse:
        """Get calculated totals for an estimate."""
        return await self.estimate_service.calculate_totals(estimate_id)
    
    # Backward compatibility aliases (for gradual migration)
    async def create_quote(self, quote_data: EstimateCreate) -> EstimateResponse:
        """Backward compatibility alias."""
        return await self.create_estimate(quote_data)
    
    async def get_quote(self, quote_id: UUID, include_details: bool = False) -> Optional[EstimateResponse]:
        """Backward compatibility alias."""
        return await self.get_estimate(quote_id, include_details)
    
    async def get_quote_detail(self, quote_id: UUID) -> Optional[EstimateDetailResponse]:
        """Backward compatibility alias."""
        return await self.get_estimate_detail(quote_id)
    
    async def list_quotes(
        self,
        skip: int = 0,
        limit: int = 100,
        release_id: Optional[UUID] = None,
        status: Optional[str] = None,
    ) -> EstimateListResponse:
        """Backward compatibility alias."""
        return await self.list_estimates(skip, limit, release_id, status)
    
    async def update_quote(
        self,
        quote_id: UUID,
        quote_data: EstimateUpdate,
    ) -> Optional[EstimateResponse]:
        """Backward compatibility alias."""
        return await self.update_estimate(quote_id, quote_data)
    
    async def delete_quote(self, quote_id: UUID) -> bool:
        """Backward compatibility alias."""
        return await self.delete_estimate(quote_id)
    
    async def clone_quote(self, quote_id: UUID, new_name: str) -> EstimateDetailResponse:
        """Backward compatibility alias."""
        return await self.clone_estimate(quote_id, new_name)
    
    # Note: create_line_item, update_line_item, delete_line_item, and auto_fill_hours
    # already accept estimate_id, so they work with both naming conventions
    
    async def get_quote_totals(self, quote_id: UUID) -> EstimateTotalsResponse:
        """Backward compatibility alias."""
        return await self.get_estimate_totals(quote_id)


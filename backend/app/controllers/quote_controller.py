"""
Quote controller.
"""

from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.base_controller import BaseController
from app.services.quote_service import QuoteService
from app.schemas.quote import (
    QuoteCreate, QuoteUpdate, QuoteResponse, QuoteDetailResponse, QuoteListResponse,
    QuoteLineItemCreate, QuoteLineItemUpdate, QuoteLineItemResponse,
    AutoFillRequest,
    QuoteTotalsResponse,
)


class QuoteController(BaseController):
    """Controller for quote operations."""
    
    def __init__(self, session: AsyncSession):
        self.quote_service = QuoteService(session)
    
    async def create_quote(self, quote_data: QuoteCreate) -> QuoteResponse:
        """Create a new quote."""
        return await self.quote_service.create_quote(quote_data)
    
    async def get_quote(self, quote_id: UUID, include_details: bool = False) -> Optional[QuoteResponse]:
        """Get quote by ID."""
        if include_details:
            detail = await self.quote_service.get_quote_detail(quote_id)
            if detail:
                return QuoteResponse.model_validate(detail.model_dump())
        return await self.quote_service.get_quote(quote_id)
    
    async def get_quote_detail(self, quote_id: UUID) -> Optional[QuoteDetailResponse]:
        """Get quote with all line items and weekly hours."""
        return await self.quote_service.get_quote_detail(quote_id)
    
    async def list_quotes(
        self,
        skip: int = 0,
        limit: int = 100,
        release_id: Optional[UUID] = None,
        status: Optional[str] = None,
    ) -> QuoteListResponse:
        """List quotes with optional filters."""
        quotes, total = await self.quote_service.list_quotes(
            skip=skip,
            limit=limit,
            release_id=release_id,
            status=status,
        )
        return QuoteListResponse(items=quotes, total=total)
    
    async def update_quote(
        self,
        quote_id: UUID,
        quote_data: QuoteUpdate,
    ) -> Optional[QuoteResponse]:
        """Update a quote."""
        return await self.quote_service.update_quote(quote_id, quote_data)
    
    async def delete_quote(self, quote_id: UUID) -> bool:
        """Delete a quote."""
        return await self.quote_service.delete_quote(quote_id)
    
    async def clone_quote(self, quote_id: UUID, new_name: str) -> QuoteDetailResponse:
        """Clone a quote to create a variation."""
        return await self.quote_service.clone_quote(quote_id, new_name)
    
    async def create_line_item(
        self,
        quote_id: UUID,
        line_item_data: QuoteLineItemCreate,
    ) -> QuoteLineItemResponse:
        """Create a new line item."""
        return await self.quote_service.create_line_item(quote_id, line_item_data)
    
    async def update_line_item(
        self,
        quote_id: UUID,
        line_item_id: UUID,
        line_item_data: QuoteLineItemUpdate,
    ) -> Optional[QuoteLineItemResponse]:
        """Update a line item."""
        return await self.quote_service.update_line_item(quote_id, line_item_id, line_item_data)
    
    async def delete_line_item(self, quote_id: UUID, line_item_id: UUID) -> bool:
        """Delete a line item."""
        return await self.quote_service.delete_line_item(quote_id, line_item_id)
    
    async def auto_fill_hours(
        self,
        quote_id: UUID,
        line_item_id: UUID,
        auto_fill_data: AutoFillRequest,
    ) -> list:
        """Auto-fill weekly hours for a line item."""
        return await self.quote_service.auto_fill_hours(
            quote_id, line_item_id, auto_fill_data
        )
    
    async def get_quote_totals(self, quote_id: UUID) -> QuoteTotalsResponse:
        """Get calculated totals for a quote."""
        return await self.quote_service.calculate_totals(quote_id)


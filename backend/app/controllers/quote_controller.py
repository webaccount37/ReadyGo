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
    QuoteStatusUpdate,
)


class QuoteController(BaseController):
    """Controller for quote operations."""
    
    def __init__(self, session: AsyncSession):
        self.quote_service = QuoteService(session)
    
    async def create_quote(self, quote_data: QuoteCreate, created_by: Optional[UUID] = None) -> QuoteResponse:
        """Create a new quote."""
        return await self.quote_service.create_quote(quote_data, created_by=created_by)
    
    async def get_quote(self, quote_id: UUID) -> Optional[QuoteResponse]:
        """Get quote by ID."""
        return await self.quote_service.get_quote(quote_id)
    
    async def get_quote_detail(self, quote_id: UUID) -> Optional[QuoteDetailResponse]:
        """Get quote with all relationships."""
        return await self.quote_service.get_quote_detail(quote_id)
    
    async def list_quotes(
        self,
        skip: int = 0,
        limit: int = 100,
        opportunity_id: Optional[UUID] = None,
    ) -> QuoteListResponse:
        """List quotes with optional filters."""
        quotes, total = await self.quote_service.list_quotes(
            skip=skip,
            limit=limit,
            opportunity_id=opportunity_id,
        )
        return QuoteListResponse(items=quotes, total=total)
    
    async def update_quote_status(
        self,
        quote_id: UUID,
        status_data: QuoteStatusUpdate,
    ) -> Optional[QuoteResponse]:
        """Update quote status."""
        return await self.quote_service.update_quote_status(quote_id, status_data)
    
    async def deactivate_quote(self, quote_id: UUID) -> Optional[QuoteResponse]:
        """Deactivate quote and unlock opportunity/estimates."""
        return await self.quote_service.deactivate_quote(quote_id)


"""
Quote phase controller for HTTP request/response handling.
"""

from typing import List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.quote_phase_service import QuotePhaseService
from app.schemas.quote import (
    QuotePhaseCreate,
    QuotePhaseUpdate,
    QuotePhaseResponse,
)


class QuotePhaseController:
    """Controller for quote phase operations."""
    
    def __init__(self, session: AsyncSession):
        self.phase_service = QuotePhaseService(session)
    
    async def create_phase(
        self,
        quote_id: UUID,
        phase_data: QuotePhaseCreate,
    ) -> QuotePhaseResponse:
        """Create a new phase."""
        return await self.phase_service.create_phase(quote_id, phase_data)
    
    async def get_phase(
        self,
        quote_id: UUID,
        phase_id: UUID,
    ) -> QuotePhaseResponse:
        """Get phase by ID."""
        phase = await self.phase_service.get_phase(quote_id, phase_id)
        if not phase:
            raise ValueError("Phase not found")
        return phase
    
    async def list_phases(self, quote_id: UUID) -> List[QuotePhaseResponse]:
        """List all phases for a quote."""
        return await self.phase_service.list_phases(quote_id)
    
    async def update_phase(
        self,
        quote_id: UUID,
        phase_id: UUID,
        phase_data: QuotePhaseUpdate,
    ) -> QuotePhaseResponse:
        """Update a phase."""
        phase = await self.phase_service.update_phase(quote_id, phase_id, phase_data)
        if not phase:
            raise ValueError("Phase not found")
        return phase
    
    async def delete_phase(self, quote_id: UUID, phase_id: UUID) -> bool:
        """Delete a phase."""
        return await self.phase_service.delete_phase(quote_id, phase_id)





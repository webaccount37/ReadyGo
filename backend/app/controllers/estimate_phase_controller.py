"""
Estimate phase controller for HTTP request/response handling.
"""

from typing import List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.estimate_phase_service import EstimatePhaseService
from app.schemas.estimate import (
    EstimatePhaseCreate,
    EstimatePhaseUpdate,
    EstimatePhaseResponse,
)


class EstimatePhaseController:
    """Controller for estimate phase operations."""
    
    def __init__(self, session: AsyncSession):
        self.phase_service = EstimatePhaseService(session)
    
    async def create_phase(
        self,
        estimate_id: UUID,
        phase_data: EstimatePhaseCreate,
    ) -> EstimatePhaseResponse:
        """Create a new phase."""
        return await self.phase_service.create_phase(estimate_id, phase_data)
    
    async def get_phase(
        self,
        estimate_id: UUID,
        phase_id: UUID,
    ) -> EstimatePhaseResponse:
        """Get phase by ID."""
        phase = await self.phase_service.get_phase(estimate_id, phase_id)
        if not phase:
            raise ValueError("Phase not found")
        return phase
    
    async def list_phases(self, estimate_id: UUID) -> List[EstimatePhaseResponse]:
        """List all phases for an estimate."""
        return await self.phase_service.list_phases(estimate_id)
    
    async def update_phase(
        self,
        estimate_id: UUID,
        phase_id: UUID,
        phase_data: EstimatePhaseUpdate,
    ) -> EstimatePhaseResponse:
        """Update a phase."""
        phase = await self.phase_service.update_phase(estimate_id, phase_id, phase_data)
        if not phase:
            raise ValueError("Phase not found")
        return phase
    
    async def delete_phase(self, estimate_id: UUID, phase_id: UUID) -> bool:
        """Delete a phase."""
        return await self.phase_service.delete_phase(estimate_id, phase_id)
    
    # Backward compatibility aliases (quote_id parameter names for API compatibility)
    # Note: The methods above already work with both naming conventions since parameter names don't affect functionality


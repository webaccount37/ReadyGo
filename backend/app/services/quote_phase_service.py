"""
Quote phase service with business logic.
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.db.repositories.quote_phase_repository import QuotePhaseRepository
from app.schemas.quote import QuotePhaseCreate, QuotePhaseUpdate, QuotePhaseResponse
from app.models.quote import QuotePhase


class QuotePhaseService(BaseService):
    """Service for quote phase operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.phase_repo = QuotePhaseRepository(session)
    
    async def create_phase(
        self,
        quote_id: UUID,
        phase_data: QuotePhaseCreate,
    ) -> QuotePhaseResponse:
        """Create a new phase."""
        # Validate dates
        if phase_data.start_date > phase_data.end_date:
            raise ValueError("start_date must be <= end_date")
        
        # Auto-increment row_order
        max_order = await self.phase_repo.get_max_row_order(quote_id)
        row_order = max_order + 1
        
        phase_dict = phase_data.model_dump(exclude_unset=True)
        phase_dict["quote_id"] = quote_id
        phase_dict["row_order"] = row_order
        
        phase = await self.phase_repo.create(**phase_dict)
        await self.session.commit()
        
        # Reload to ensure it's fresh
        phase = await self.phase_repo.get(phase.id)
        if not phase:
            raise ValueError("Failed to reload phase after creation")
        
        return QuotePhaseResponse.model_validate(phase)
    
    async def get_phase(self, quote_id: UUID, phase_id: UUID) -> Optional[QuotePhaseResponse]:
        """Get phase by ID."""
        phase = await self.phase_repo.get(phase_id)
        if not phase or phase.quote_id != quote_id:
            return None
        return QuotePhaseResponse.model_validate(phase)
    
    async def list_phases(self, quote_id: UUID) -> List[QuotePhaseResponse]:
        """List all phases for a quote."""
        phases = await self.phase_repo.list_by_quote(quote_id)
        return [QuotePhaseResponse.model_validate(phase) for phase in phases]
    
    async def update_phase(
        self,
        quote_id: UUID,
        phase_id: UUID,
        phase_data: QuotePhaseUpdate,
    ) -> Optional[QuotePhaseResponse]:
        """Update a phase."""
        phase = await self.phase_repo.get(phase_id)
        if not phase or phase.quote_id != quote_id:
            return None
        
        update_dict = phase_data.model_dump(exclude_unset=True)
        
        # Validate dates if both are being updated
        if "start_date" in update_dict or "end_date" in update_dict:
            start_date = update_dict.get("start_date", phase.start_date)
            end_date = update_dict.get("end_date", phase.end_date)
            if start_date > end_date:
                raise ValueError("start_date must be <= end_date")
        
        updated = await self.phase_repo.update(phase_id, **update_dict)
        await self.session.commit()
        
        # Reload
        updated = await self.phase_repo.get(phase_id)
        if not updated:
            return None
        return QuotePhaseResponse.model_validate(updated)
    
    async def delete_phase(self, quote_id: UUID, phase_id: UUID) -> bool:
        """Delete a phase."""
        phase = await self.phase_repo.get(phase_id)
        if not phase or phase.quote_id != quote_id:
            return False
        
        deleted = await self.phase_repo.delete(phase_id)
        await self.session.commit()
        return deleted






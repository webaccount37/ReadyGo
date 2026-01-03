"""
Estimate phase service with business logic.
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.db.repositories.estimate_phase_repository import EstimatePhaseRepository
from app.schemas.estimate import EstimatePhaseCreate, EstimatePhaseUpdate, EstimatePhaseResponse
from app.models.estimate import EstimatePhase


class EstimatePhaseService(BaseService):
    """Service for estimate phase operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.phase_repo = EstimatePhaseRepository(session)
    
    async def create_phase(
        self,
        estimate_id: UUID,
        phase_data: EstimatePhaseCreate,
    ) -> EstimatePhaseResponse:
        """Create a new phase."""
        # Validate dates
        if phase_data.start_date > phase_data.end_date:
            raise ValueError("start_date must be <= end_date")
        
        # Auto-increment row_order
        max_order = await self.phase_repo.get_max_row_order(estimate_id)
        row_order = max_order + 1
        
        phase_dict = phase_data.model_dump(exclude_unset=True)
        phase_dict["estimate_id"] = estimate_id
        phase_dict["row_order"] = row_order
        
        phase = await self.phase_repo.create(**phase_dict)
        await self.session.commit()
        
        # Reload to ensure it's fresh
        phase = await self.phase_repo.get(phase.id)
        if not phase:
            raise ValueError("Failed to reload phase after creation")
        
        return EstimatePhaseResponse.model_validate(phase)
    
    async def get_phase(self, estimate_id: UUID, phase_id: UUID) -> Optional[EstimatePhaseResponse]:
        """Get phase by ID."""
        phase = await self.phase_repo.get(phase_id)
        if not phase or phase.estimate_id != estimate_id:
            return None
        return EstimatePhaseResponse.model_validate(phase)
    
    async def list_phases(self, estimate_id: UUID) -> List[EstimatePhaseResponse]:
        """List all phases for an estimate."""
        phases = await self.phase_repo.list_by_estimate(estimate_id)
        return [EstimatePhaseResponse.model_validate(phase) for phase in phases]
    
    async def update_phase(
        self,
        estimate_id: UUID,
        phase_id: UUID,
        phase_data: EstimatePhaseUpdate,
    ) -> Optional[EstimatePhaseResponse]:
        """Update a phase."""
        phase = await self.phase_repo.get(phase_id)
        if not phase or phase.estimate_id != estimate_id:
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
        return EstimatePhaseResponse.model_validate(updated)
    
    async def delete_phase(self, estimate_id: UUID, phase_id: UUID) -> bool:
        """Delete a phase."""
        phase = await self.phase_repo.get(phase_id)
        if not phase or phase.estimate_id != estimate_id:
            return False
        
        deleted = await self.phase_repo.delete(phase_id)
        await self.session.commit()
        return deleted



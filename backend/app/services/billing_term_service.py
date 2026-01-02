"""
Billing Term service with business logic.
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.db.repositories.billing_term_repository import BillingTermRepository
from app.schemas.billing_term import BillingTermCreate, BillingTermUpdate, BillingTermResponse


class BillingTermService(BaseService):
    """Service for billing term operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.billing_term_repo = BillingTermRepository(session)
    
    async def create_billing_term(self, billing_term_data: BillingTermCreate) -> BillingTermResponse:
        """Create a new billing term."""
        billing_term_dict = billing_term_data.model_dump(exclude_unset=True)
        billing_term = await self.billing_term_repo.create(**billing_term_dict)
        await self.session.commit()
        await self.session.refresh(billing_term)
        return BillingTermResponse.model_validate(billing_term)
    
    async def get_billing_term(self, billing_term_id: UUID) -> Optional[BillingTermResponse]:
        """Get billing term by ID."""
        billing_term = await self.billing_term_repo.get(billing_term_id)
        if not billing_term:
            return None
        return BillingTermResponse.model_validate(billing_term)
    
    async def get_billing_term_by_code(self, code: str) -> Optional[BillingTermResponse]:
        """Get billing term by code."""
        billing_term = await self.billing_term_repo.get_by_code(code)
        if not billing_term:
            return None
        return BillingTermResponse.model_validate(billing_term)
    
    async def list_billing_terms(
        self,
        skip: int = 0,
        limit: int = 100,
        active_only: bool = True,
    ) -> tuple[List[BillingTermResponse], int]:
        """List billing terms."""
        if active_only:
            billing_terms = await self.billing_term_repo.list_active(skip, limit)
            total = await self.billing_term_repo.count_active()
        else:
            billing_terms = await self.billing_term_repo.list_all_ordered(skip, limit)
            total = len(billing_terms)
        return [BillingTermResponse.model_validate(bt) for bt in billing_terms], total
    
    async def update_billing_term(
        self,
        billing_term_id: UUID,
        billing_term_data: BillingTermUpdate,
    ) -> Optional[BillingTermResponse]:
        """Update a billing term."""
        billing_term = await self.billing_term_repo.get(billing_term_id)
        if not billing_term:
            return None
        
        update_dict = billing_term_data.model_dump(exclude_unset=True)
        updated = await self.billing_term_repo.update(billing_term_id, **update_dict)
        await self.session.commit()
        await self.session.refresh(updated)
        return BillingTermResponse.model_validate(updated)
    
    async def delete_billing_term(self, billing_term_id: UUID) -> bool:
        """Delete a billing term."""
        deleted = await self.billing_term_repo.delete(billing_term_id)
        await self.session.commit()
        return deleted










"""
Billing Term controller.
"""

from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.base_controller import BaseController
from app.services.billing_term_service import BillingTermService
from app.schemas.billing_term import (
    BillingTermCreate,
    BillingTermUpdate,
    BillingTermResponse,
    BillingTermListResponse,
)


class BillingTermController(BaseController):
    """Controller for billing term operations."""
    
    def __init__(self, session: AsyncSession):
        self.billing_term_service = BillingTermService(session)
    
    async def create_billing_term(self, billing_term_data: BillingTermCreate) -> BillingTermResponse:
        """Create a new billing term."""
        return await self.billing_term_service.create_billing_term(billing_term_data)
    
    async def get_billing_term(self, billing_term_id: UUID) -> Optional[BillingTermResponse]:
        """Get billing term by ID."""
        return await self.billing_term_service.get_billing_term(billing_term_id)
    
    async def list_billing_terms(
        self,
        skip: int = 0,
        limit: int = 100,
        active_only: bool = True,
    ) -> BillingTermListResponse:
        """List billing terms."""
        billing_terms, total = await self.billing_term_service.list_billing_terms(
            skip=skip,
            limit=limit,
            active_only=active_only,
        )
        return BillingTermListResponse(items=billing_terms, total=total)
    
    async def update_billing_term(
        self,
        billing_term_id: UUID,
        billing_term_data: BillingTermUpdate,
    ) -> Optional[BillingTermResponse]:
        """Update a billing term."""
        return await self.billing_term_service.update_billing_term(billing_term_id, billing_term_data)
    
    async def delete_billing_term(self, billing_term_id: UUID) -> bool:
        """Delete a billing term."""
        return await self.billing_term_service.delete_billing_term(billing_term_id)










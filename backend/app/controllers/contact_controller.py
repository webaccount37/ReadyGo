"""
Contact controller.
"""

from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.base_controller import BaseController
from app.services.contact_service import ContactService
from app.schemas.contact import ContactCreate, ContactUpdate, ContactResponse, ContactListResponse


class ContactController(BaseController):
    """Controller for contact operations."""
    
    def __init__(self, session: AsyncSession):
        self.contact_service = ContactService(session)
    
    async def create_contact(self, contact_data: ContactCreate) -> ContactResponse:
        """Create a new contact."""
        return await self.contact_service.create_contact(contact_data)
    
    async def get_contact(self, contact_id: UUID) -> Optional[ContactResponse]:
        """Get contact by ID."""
        return await self.contact_service.get_contact(contact_id)
    
    async def list_contacts_by_account(
        self,
        account_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> ContactListResponse:
        """List contacts for an account."""
        contacts, total = await self.contact_service.list_contacts_by_account(
            account_id=account_id,
            skip=skip,
            limit=limit,
        )
        return ContactListResponse(items=contacts, total=total)
    
    async def list_contacts(
        self,
        skip: int = 0,
        limit: int = 100,
    ) -> ContactListResponse:
        """List all contacts with pagination."""
        contacts, total = await self.contact_service.list_contacts(
            skip=skip,
            limit=limit,
        )
        return ContactListResponse(items=contacts, total=total)
    
    async def update_contact(
        self,
        contact_id: UUID,
        contact_data: ContactUpdate,
    ) -> Optional[ContactResponse]:
        """Update a contact."""
        return await self.contact_service.update_contact(contact_id, contact_data)
    
    async def delete_contact(self, contact_id: UUID) -> bool:
        """Delete a contact."""
        return await self.contact_service.delete_contact(contact_id)


"""
Contact service with business logic.
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.db.repositories.contact_repository import ContactRepository
from app.schemas.contact import ContactCreate, ContactUpdate, ContactResponse


class ContactService(BaseService):
    """Service for contact operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.contact_repo = ContactRepository(session)
    
    async def create_contact(self, contact_data: ContactCreate) -> ContactResponse:
        """Create a new contact."""
        contact_dict = contact_data.model_dump(exclude_unset=True)
        
        # Convert boolean is_primary to string
        if "is_primary" in contact_dict:
            contact_dict["is_primary"] = "true" if contact_dict["is_primary"] else "false"
        
        # If this contact is set as primary, clear other primary contacts
        if contact_dict.get("is_primary") == "true":
            await self.contact_repo.clear_primary_contacts(contact_data.account_id)
        
        contact = await self.contact_repo.create(**contact_dict)
        await self.session.commit()
        # Reload with account relationship
        contact = await self.contact_repo.get(contact.id)
        if not contact:
            raise ValueError("Failed to retrieve created contact")
        return self._to_response(contact)
    
    async def get_contact(self, contact_id: UUID) -> Optional[ContactResponse]:
        """Get contact by ID."""
        contact = await self.contact_repo.get(contact_id)
        if not contact:
            return None
        return self._to_response(contact)
    
    async def list_contacts_by_account(
        self,
        account_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[List[ContactResponse], int]:
        """List contacts for an account."""
        contacts = await self.contact_repo.list_by_account(account_id, skip, limit)
        total = await self.contact_repo.count_by_account(account_id)
        return [self._to_response(contact) for contact in contacts], total
    
    async def list_contacts(
        self,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[List[ContactResponse], int]:
        """List all contacts with pagination."""
        contacts = await self.contact_repo.list_all(skip, limit)
        total = await self.contact_repo.count_all()
        return [self._to_response(contact) for contact in contacts], total
    
    async def update_contact(
        self,
        contact_id: UUID,
        contact_data: ContactUpdate,
    ) -> Optional[ContactResponse]:
        """Update a contact."""
        contact = await self.contact_repo.get(contact_id)
        if not contact:
            return None
        
        update_dict = contact_data.model_dump(exclude_unset=True)
        
        # Convert boolean is_primary to string
        if "is_primary" in update_dict:
            # If setting as primary, clear other primary contacts first
            if update_dict["is_primary"]:
                await self.contact_repo.clear_primary_contacts(contact.account_id)
            update_dict["is_primary"] = "true" if update_dict["is_primary"] else "false"
        
        updated = await self.contact_repo.update(contact_id, **update_dict)
        await self.session.commit()
        # Reload with account relationship
        updated = await self.contact_repo.get(contact_id)
        if not updated:
            return None
        return self._to_response(updated)
    
    async def delete_contact(self, contact_id: UUID) -> bool:
        """Delete a contact."""
        deleted = await self.contact_repo.delete(contact_id)
        await self.session.commit()
        return deleted
    
    def _to_response(self, contact) -> ContactResponse:
        """Convert contact model to response schema."""
        account_name = None
        if hasattr(contact, 'account') and contact.account:
            account_name = contact.account.company_name
        
        return ContactResponse(
            id=contact.id,
            account_id=contact.account_id,
            first_name=contact.first_name,
            last_name=contact.last_name,
            email=contact.email,
            phone=contact.phone,
            job_title=contact.job_title,
            is_primary=contact.is_primary == "true",
            account_name=account_name,
        )


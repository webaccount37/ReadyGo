"""
Account service with business logic.
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.db.repositories.account_repository import AccountRepository
from app.db.repositories.contact_repository import ContactRepository
from app.db.repositories.opportunity_repository import OpportunityRepository
from app.schemas.account import AccountCreate, AccountUpdate, AccountResponse


class AccountService(BaseService):
    """Service for account operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.account_repo = AccountRepository(session)
        self.contact_repo = ContactRepository(session)
        self.opportunity_repo = OpportunityRepository(session)
    
    async def create_account(self, account_data: AccountCreate) -> AccountResponse:
        """Create a new account."""
        account_dict = account_data.model_dump(exclude_unset=True)
        account = await self.account_repo.create(**account_dict)
        await self.session.commit()
        # Reload with billing_term relationship loaded
        account = await self.account_repo.get(account.id)
        if not account:
            raise ValueError("Failed to reload account after creation")
        return AccountResponse.model_validate(account)
    
    async def get_account(self, account_id: UUID) -> Optional[AccountResponse]:
        """Get account by ID."""
        account = await self.account_repo.get(account_id)
        if not account:
            return None
        return AccountResponse.model_validate(account)
    
    async def get_account_with_opportunities(self, account_id: UUID) -> Optional[AccountResponse]:
        """Get account with related opportunities."""
        # Note: This would need a method in repository if needed
        account = await self.account_repo.get(account_id)
        if not account:
            return None
        return AccountResponse.model_validate(account)
    
    async def list_accounts(
        self,
        skip: int = 0,
        limit: int = 100,
        region: Optional[str] = None,
    ) -> tuple[List[AccountResponse], int]:
        """List accounts with optional filters."""
        accounts = await self.account_repo.list(skip=skip, limit=limit)
        
        # Add contact and opportunity counts
        responses = []
        for account in accounts:
            account_dict = AccountResponse.model_validate(account).model_dump()
            contact_count = await self.contact_repo.count_by_account(account.id)
            opportunity_count = await self.opportunity_repo.count_by_account(account.id)
            account_dict["contact_count"] = contact_count
            account_dict["opportunities_count"] = opportunity_count
            responses.append(AccountResponse(**account_dict))
        
        total = len(accounts)
        return responses, total
    
    async def update_account(
        self,
        account_id: UUID,
        account_data: AccountUpdate,
    ) -> Optional[AccountResponse]:
        """Update an account."""
        account = await self.account_repo.get(account_id)
        if not account:
            return None
        
        update_dict = account_data.model_dump(exclude_unset=True)
        updated = await self.account_repo.update(account_id, **update_dict)
        await self.session.commit()
        # Reload with billing_term relationship loaded
        updated = await self.account_repo.get(account_id)
        if not updated:
            return None
        return AccountResponse.model_validate(updated)
    
    async def delete_account(self, account_id: UUID) -> bool:
        """Delete an account."""
        deleted = await self.account_repo.delete(account_id)
        await self.session.commit()
        return deleted





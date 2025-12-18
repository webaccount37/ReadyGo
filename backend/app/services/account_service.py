"""
Account service with business logic.
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.db.repositories.account_repository import AccountRepository
from app.schemas.account import AccountCreate, AccountUpdate, AccountResponse


class AccountService(BaseService):
    """Service for account operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.account_repo = AccountRepository(session)
    
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
    
    async def get_account_with_engagements(self, account_id: UUID) -> Optional[AccountResponse]:
        """Get account with related engagements."""
        # Note: This would need a method in repository if needed
        account = await self.account_repo.get(account_id)
        if not account:
            return None
        return AccountResponse.model_validate(account)
    
    async def list_accounts(
        self,
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None,
        region: Optional[str] = None,
    ) -> tuple[List[AccountResponse], int]:
        """List accounts with optional filters."""
        from app.models.account import AccountStatus
        
        if status:
            try:
                status_enum = AccountStatus(status)
                accounts = await self.account_repo.list_by_status(status_enum, skip, limit)
            except ValueError:
                accounts = []
        else:
            accounts = await self.account_repo.list(skip=skip, limit=limit)
        
        total = len(accounts)
        return [AccountResponse.model_validate(account) for account in accounts], total
    
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





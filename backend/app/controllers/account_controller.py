"""
Account controller.
"""

from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.base_controller import BaseController
from app.services.account_service import AccountService
from app.schemas.account import AccountCreate, AccountUpdate, AccountResponse, AccountListResponse


class AccountController(BaseController):
    """Controller for account operations."""
    
    def __init__(self, session: AsyncSession):
        self.account_service = AccountService(session)
    
    async def create_account(self, account_data: AccountCreate) -> AccountResponse:
        """Create a new account."""
        return await self.account_service.create_account(account_data)
    
    async def get_account(self, account_id: UUID, include_projects: bool = False) -> Optional[AccountResponse]:
        """Get account by ID."""
        if include_projects:
            return await self.account_service.get_account_with_opportunities(account_id)
        return await self.account_service.get_account(account_id)
    
    async def list_accounts(
        self,
        skip: int = 0,
        limit: int = 100,
        region: Optional[str] = None,
    ) -> AccountListResponse:
        """List accounts with optional filters."""
        accounts, total = await self.account_service.list_accounts(
            skip=skip,
            limit=limit,
            region=region,
        )
        return AccountListResponse(items=accounts, total=total)
    
    async def update_account(
        self,
        account_id: UUID,
        account_data: AccountUpdate,
    ) -> Optional[AccountResponse]:
        """Update an account."""
        return await self.account_service.update_account(account_id, account_data)
    
    async def delete_account(self, account_id: UUID) -> bool:
        """Delete an account."""
        return await self.account_service.delete_account(account_id)









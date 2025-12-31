"""
Account API endpoints.
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.db.session import get_db
from app.controllers.account_controller import AccountController
from app.schemas.account import (
    AccountCreate,
    AccountUpdate,
    AccountResponse,
    AccountListResponse,
)

router = APIRouter()


@router.post("", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
async def create_account(
    account_data: AccountCreate,
    db: AsyncSession = Depends(get_db),
) -> AccountResponse:
    """Create a new account."""
    controller = AccountController(db)
    return await controller.create_account(account_data)


@router.get("", response_model=AccountListResponse)
async def list_accounts(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    status: str = Query(None),
    region: str = Query(None),
    db: AsyncSession = Depends(get_db),
) -> AccountListResponse:
    """List accounts with optional filters."""
    controller = AccountController(db)
    return await controller.list_accounts(
        skip=skip,
        limit=limit,
        status=status,
        region=region,
    )


@router.get("/{account_id}", response_model=AccountResponse)
async def get_account(
    account_id: UUID,
    include_projects: bool = Query(False),
    db: AsyncSession = Depends(get_db),
) -> AccountResponse:
    """Get account by ID."""
    controller = AccountController(db)
    account = await controller.get_account(account_id, include_projects)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )
    return account


@router.put("/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: UUID,
    account_data: AccountUpdate,
    db: AsyncSession = Depends(get_db),
) -> AccountResponse:
    """Update an account."""
    controller = AccountController(db)
    account = await controller.update_account(account_id, account_data)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )
    return account


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete an account."""
    controller = AccountController(db)
    deleted = await controller.delete_account(account_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )











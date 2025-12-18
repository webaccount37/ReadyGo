"""
Contact API endpoints.
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.db.session import get_db
from app.controllers.contact_controller import ContactController
from app.schemas.contact import (
    ContactCreate,
    ContactUpdate,
    ContactResponse,
    ContactListResponse,
)

router = APIRouter()


@router.post("", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
async def create_contact(
    contact_data: ContactCreate,
    db: AsyncSession = Depends(get_db),
) -> ContactResponse:
    """Create a new contact for an account."""
    controller = ContactController(db)
    return await controller.create_contact(contact_data)


@router.get("", response_model=ContactListResponse)
async def list_contacts(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> ContactListResponse:
    """List all contacts with pagination."""
    controller = ContactController(db)
    return await controller.list_contacts(
        skip=skip,
        limit=limit,
    )


@router.get("/account/{account_id}", response_model=ContactListResponse)
async def list_contacts_by_account(
    account_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> ContactListResponse:
    """List contacts for a specific account."""
    controller = ContactController(db)
    return await controller.list_contacts_by_account(
        account_id=account_id,
        skip=skip,
        limit=limit,
    )


@router.get("/{contact_id}", response_model=ContactResponse)
async def get_contact(
    contact_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> ContactResponse:
    """Get contact by ID."""
    controller = ContactController(db)
    contact = await controller.get_contact(contact_id)
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found",
        )
    return contact


@router.put("/{contact_id}", response_model=ContactResponse)
async def update_contact(
    contact_id: UUID,
    contact_data: ContactUpdate,
    db: AsyncSession = Depends(get_db),
) -> ContactResponse:
    """Update a contact."""
    controller = ContactController(db)
    contact = await controller.update_contact(contact_id, contact_data)
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found",
        )
    return contact


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    contact_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a contact."""
    controller = ContactController(db)
    deleted = await controller.delete_contact(contact_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found",
        )


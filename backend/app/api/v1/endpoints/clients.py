"""
Client API endpoints.
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.db.session import get_db
from app.controllers.client_controller import ClientController
from app.schemas.client import (
    ClientCreate,
    ClientUpdate,
    ClientResponse,
    ClientListResponse,
)

router = APIRouter()


@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
async def create_client(
    client_data: ClientCreate,
    db: AsyncSession = Depends(get_db),
) -> ClientResponse:
    """Create a new client."""
    controller = ClientController(db)
    return await controller.create_client(client_data)


@router.get("", response_model=ClientListResponse)
async def list_clients(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    status: str = Query(None),
    region: str = Query(None),
    db: AsyncSession = Depends(get_db),
) -> ClientListResponse:
    """List clients with optional filters."""
    controller = ClientController(db)
    return await controller.list_clients(
        skip=skip,
        limit=limit,
        status=status,
        region=region,
    )


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client(
    client_id: UUID,
    include_projects: bool = Query(False),
    db: AsyncSession = Depends(get_db),
) -> ClientResponse:
    """Get client by ID."""
    controller = ClientController(db)
    client = await controller.get_client(client_id, include_projects)
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found",
        )
    return client


@router.put("/{client_id}", response_model=ClientResponse)
async def update_client(
    client_id: UUID,
    client_data: ClientUpdate,
    db: AsyncSession = Depends(get_db),
) -> ClientResponse:
    """Update a client."""
    controller = ClientController(db)
    client = await controller.update_client(client_id, client_data)
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found",
        )
    return client


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a client."""
    controller = ClientController(db)
    deleted = await controller.delete_client(client_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found",
        )










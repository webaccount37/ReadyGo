"""
Client controller.
"""

from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.base_controller import BaseController
from app.services.client_service import ClientService
from app.schemas.client import ClientCreate, ClientUpdate, ClientResponse, ClientListResponse


class ClientController(BaseController):
    """Controller for client operations."""
    
    def __init__(self, session: AsyncSession):
        self.client_service = ClientService(session)
    
    async def create_client(self, client_data: ClientCreate) -> ClientResponse:
        """Create a new client."""
        return await self.client_service.create_client(client_data)
    
    async def get_client(self, client_id: UUID, include_projects: bool = False) -> Optional[ClientResponse]:
        """Get client by ID."""
        if include_projects:
            return await self.client_service.get_client_with_projects(client_id)
        return await self.client_service.get_client(client_id)
    
    async def list_clients(
        self,
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None,
        region: Optional[str] = None,
    ) -> ClientListResponse:
        """List clients with optional filters."""
        clients, total = await self.client_service.list_clients(
            skip=skip,
            limit=limit,
            status=status,
            region=region,
        )
        return ClientListResponse(items=clients, total=total)
    
    async def update_client(
        self,
        client_id: UUID,
        client_data: ClientUpdate,
    ) -> Optional[ClientResponse]:
        """Update a client."""
        return await self.client_service.update_client(client_id, client_data)
    
    async def delete_client(self, client_id: UUID) -> bool:
        """Delete a client."""
        return await self.client_service.delete_client(client_id)










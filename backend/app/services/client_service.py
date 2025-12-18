"""
Client service with business logic.
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.db.repositories.client_repository import ClientRepository
from app.schemas.client import ClientCreate, ClientUpdate, ClientResponse


class ClientService(BaseService):
    """Service for client operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.client_repo = ClientRepository(session)
    
    async def create_client(self, client_data: ClientCreate) -> ClientResponse:
        """Create a new client."""
        client_dict = client_data.model_dump(exclude_unset=True)
        client = await self.client_repo.create(**client_dict)
        await self.session.commit()
        await self.session.refresh(client)
        return ClientResponse.model_validate(client)
    
    async def get_client(self, client_id: UUID) -> Optional[ClientResponse]:
        """Get client by ID."""
        client = await self.client_repo.get(client_id)
        if not client:
            return None
        return ClientResponse.model_validate(client)
    
    async def get_client_with_projects(self, client_id: UUID) -> Optional[ClientResponse]:
        """Get client with related projects."""
        client = await self.client_repo.get_with_projects(client_id)
        if not client:
            return None
        return ClientResponse.model_validate(client)
    
    async def list_clients(
        self,
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None,
        region: Optional[str] = None,
    ) -> tuple[List[ClientResponse], int]:
        """List clients with optional filters."""
        from app.models.client import ClientStatus
        
        if status:
            try:
                status_enum = ClientStatus(status)
                clients = await self.client_repo.list_by_status(status_enum, skip, limit)
            except ValueError:
                clients = []
        elif region:
            clients = await self.client_repo.list_by_region(region, skip, limit)
        else:
            clients = await self.client_repo.list(skip=skip, limit=limit)
        
        total = len(clients)
        return [ClientResponse.model_validate(client) for client in clients], total
    
    async def update_client(
        self,
        client_id: UUID,
        client_data: ClientUpdate,
    ) -> Optional[ClientResponse]:
        """Update a client."""
        client = await self.client_repo.get(client_id)
        if not client:
            return None
        
        update_dict = client_data.model_dump(exclude_unset=True)
        updated = await self.client_repo.update(client_id, **update_dict)
        await self.session.commit()
        await self.session.refresh(updated)
        return ClientResponse.model_validate(updated)
    
    async def delete_client(self, client_id: UUID) -> bool:
        """Delete a client."""
        deleted = await self.client_repo.delete(client_id)
        await self.session.commit()
        return deleted


"""
Client repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload, joinedload

from app.db.repositories.base_repository import BaseRepository
from app.models.client import Client, ClientStatus


class ClientRepository(BaseRepository[Client]):
    """Repository for client operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(Client, session)
    
    async def get(self, id: UUID) -> Optional[Client]:
        """Get client by ID with billing term."""
        result = await self.session.execute(
            select(Client)
            .options(joinedload(Client.billing_term))
            .where(Client.id == id)
        )
        return result.scalar_one_or_none()
    
    async def get_by_company_name(self, company_name: str) -> Optional[Client]:
        """Get client by company name."""
        result = await self.session.execute(
            select(Client)
            .options(joinedload(Client.billing_term))
            .where(Client.company_name == company_name)
        )
        return result.scalar_one_or_none()
    
    async def list(
        self,
        skip: int = 0,
        limit: int = 100,
        **filters,
    ) -> List[Client]:
        """List clients with billing term loaded."""
        query = select(Client).options(joinedload(Client.billing_term))
        
        for key, value in filters.items():
            if hasattr(Client, key):
                query = query.where(getattr(Client, key) == value)
        
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().unique().all())
    
    async def list_by_status(
        self,
        status: ClientStatus,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Client]:
        """List clients by status."""
        query = (
            select(Client)
            .options(joinedload(Client.billing_term))
            .where(Client.status == status)
        )
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().unique().all())
    
    async def list_by_region(
        self,
        region: str,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Client]:
        """List clients by region."""
        query = (
            select(Client)
            .options(joinedload(Client.billing_term))
            .where(Client.region == region)
        )
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().unique().all())
    
    async def get_with_projects(self, client_id: UUID) -> Optional[Client]:
        """Get client with related projects."""
        result = await self.session.execute(
            select(Client)
            .options(
                selectinload(Client.projects),
                joinedload(Client.billing_term),
            )
            .where(Client.id == client_id)
        )
        return result.scalar_one_or_none()
    
    async def get_with_contacts(self, client_id: UUID) -> Optional[Client]:
        """Get client with related contacts."""
        result = await self.session.execute(
            select(Client)
            .options(
                selectinload(Client.contacts),
                joinedload(Client.billing_term),
            )
            .where(Client.id == client_id)
        )
        return result.scalar_one_or_none()




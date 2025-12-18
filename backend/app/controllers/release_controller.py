"""
Release controller.
"""

from typing import Optional
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.base_controller import BaseController
from app.services.release_service import ReleaseService
from app.schemas.release import ReleaseCreate, ReleaseUpdate, ReleaseResponse, ReleaseListResponse
from app.schemas.relationships import LinkRolesToReleaseRequest, UnlinkRequest


class ReleaseController(BaseController):
    """Controller for release operations."""
    
    def __init__(self, session: AsyncSession):
        self.release_service = ReleaseService(session)
    
    async def create_release(self, release_data: ReleaseCreate) -> ReleaseResponse:
        """Create a new release."""
        return await self.release_service.create_release(release_data)
    
    async def get_release(self, release_id: UUID, include_relationships: bool = False) -> Optional[ReleaseResponse]:
        """Get release by ID."""
        if include_relationships:
            return await self.release_service.get_release_with_relationships(release_id)
        return await self.release_service.get_release(release_id)
    
    async def list_releases(
        self,
        skip: int = 0,
        limit: int = 100,
        engagement_id: Optional[UUID] = None,
        status: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> ReleaseListResponse:
        """List releases with optional filters."""
        releases, total = await self.release_service.list_releases(
            skip=skip,
            limit=limit,
            engagement_id=engagement_id,
            status=status,
            start_date=start_date,
            end_date=end_date,
        )
        return ReleaseListResponse(items=releases, total=total)
    
    async def update_release(
        self,
        release_id: UUID,
        release_data: ReleaseUpdate,
    ) -> Optional[ReleaseResponse]:
        """Update a release."""
        return await self.release_service.update_release(release_id, release_data)
    
    async def delete_release(self, release_id: UUID) -> bool:
        """Delete a release."""
        return await self.release_service.delete_release(release_id)
    
    async def link_roles_to_release(
        self,
        release_id: UUID,
        request: LinkRolesToReleaseRequest,
    ) -> bool:
        """Link roles to a release."""
        return await self.release_service.link_roles_to_release(
            release_id,
            request.role_ids,
        )
    
    async def unlink_roles_from_release(
        self,
        release_id: UUID,
        request: UnlinkRequest,
    ) -> bool:
        """Unlink roles from a release."""
        return await self.release_service.unlink_roles_from_release(
            release_id,
            request.ids,
        )




"""
Release repository for database operations.
"""

from typing import Optional, List
from uuid import UUID
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.repositories.base_repository import BaseRepository
from app.models.release import Release, ReleaseStatus


class ReleaseRepository(BaseRepository[Release]):
    """Repository for release operations."""
    
    def __init__(self, session: AsyncSession):
        super().__init__(Release, session)
    
    def _base_query(self):
        """Base query with eager loading of engagement, billing_term, and delivery_center relationships."""
        return select(Release).options(
            selectinload(Release.engagement),
            selectinload(Release.billing_term),
            selectinload(Release.delivery_center)
        )
    
    async def list(
        self,
        skip: int = 0,
        limit: int = 100,
        **filters,
    ) -> List[Release]:
        """List releases with pagination and filters, eagerly loading engagement."""
        query = self._base_query()
        
        # Apply filters
        for key, value in filters.items():
            if hasattr(Release, key):
                query = query.where(getattr(Release, key) == value)
        
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get(self, id: UUID) -> Optional[Release]:
        """Get release by ID with engagement relationship loaded."""
        query = self._base_query().where(Release.id == id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def list_by_engagement(
        self,
        engagement_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Release]:
        """List releases by engagement."""
        query = self._base_query().where(Release.engagement_id == engagement_id)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_by_status(
        self,
        status: ReleaseStatus,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Release]:
        """List releases by status."""
        query = self._base_query().where(Release.status == status)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def list_by_date_range(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Release]:
        """List releases within date range."""
        query = self._base_query()
        if start_date:
            query = query.where(Release.start_date >= start_date)
        if end_date:
            query = query.where(Release.end_date <= end_date)
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_with_relationships(self, release_id: UUID) -> Optional[Release]:
        """Get release with related entities."""
        # Note: Employees are now loaded from ESTIMATE_LINE_ITEMS where ACTIVE_VERSION = TRUE
        # This is handled in the service layer, not the repository
        result = await self.session.execute(
            select(Release)
            .options(
                selectinload(Release.engagement),
                selectinload(Release.billing_term),
                selectinload(Release.delivery_center),
            )
            .where(Release.id == release_id)
        )
        return result.scalar_one_or_none()




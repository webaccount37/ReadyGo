"""
Health repository.
Provides database health check functionality.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


class HealthRepository:
    """Repository for health check operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def check_database(self) -> bool:
        """
        Check database connectivity.
        
        Returns:
            True if database is accessible, False otherwise
        """
        try:
            result = await self.session.execute(text("SELECT 1"))
            return result.scalar() == 1
        except Exception:
            return False

"""
Health service.
Provides health check functionality.
"""

import time
from app.services.base_service import BaseService
from app.schemas.health import HealthResponse


class HealthService(BaseService):
    """Service for health check operations."""
    
    def __init__(self):
        self.start_time = time.time()
    
    async def get_health(self) -> HealthResponse:
        """
        Get system health status.
        
        Returns:
            HealthResponse with status, uptime, and checks
        """
        # Calculate uptime
        uptime_seconds = int(time.time() - self.start_time)
        uptime_str = f"PT{uptime_seconds}S"  # ISO 8601 duration format
        
        # Perform health checks
        checks = {}
        
        # Check database connectivity
        try:
            from app.db.session import async_session_maker
            from app.db.repositories.health_repository import HealthRepository
            
            async with async_session_maker() as session:
                repo = HealthRepository(session=session)
                db_status = await repo.check_database()
                checks["database"] = "ok" if db_status else "error"
        except Exception as e:
            checks["database"] = f"error: {str(e)}"
        
        # Determine overall status
        status = "ok" if all(check == "ok" for check in checks.values()) else "degraded"
        
        return HealthResponse(
            status=status,
            uptime=uptime_str,
            checks=checks,
        )

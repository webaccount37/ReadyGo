"""
Health controller.
Coordinates health service to return health status.
"""

from app.controllers.base_controller import BaseController
from app.schemas.health import HealthResponse
from app.services.health_service import HealthService


class HealthController(BaseController):
    """Controller for health check operations."""
    
    def __init__(self, health_service: HealthService = None):
        self.health_service = health_service or HealthService()
    
    async def get_health(self) -> HealthResponse:
        """
        Get system health status.
        
        Returns:
            HealthResponse with status, uptime, and checks
        """
        return await self.health_service.get_health()


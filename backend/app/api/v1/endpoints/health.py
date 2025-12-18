"""
Health check endpoint.
Returns system status and uptime information.
"""

from fastapi import APIRouter, Depends, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

from app.schemas.health import HealthResponse
from app.services.health_service import HealthService
from app.deps.di_container import get_container

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def get_health(
    request: Request,
) -> HealthResponse:
    """
    Health check endpoint.
    Returns system status, uptime, and health checks.
    """
    container = get_container()
    controller = container.health_controller()
    return await controller.get_health()


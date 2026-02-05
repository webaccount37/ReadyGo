"""
Router configuration utilities for consistent authentication enforcement.
"""

from fastapi import APIRouter, Depends
from app.api.v1.middleware import require_authentication
from app.models.employee import Employee


def create_protected_router(*args, **kwargs) -> APIRouter:
    """
    Create a router with authentication required for all routes.
    
    Usage:
        router = create_protected_router(prefix="/employees", tags=["employees"])
        # All routes on this router will require authentication
    
    Args:
        *args: Arguments to pass to APIRouter
        **kwargs: Keyword arguments to pass to APIRouter
        
    Returns:
        APIRouter with authentication dependency applied
    """
    router = APIRouter(*args, **kwargs)
    # Apply authentication dependency to all routes in this router
    router.dependencies = [Depends(require_authentication)]
    return router


def create_public_router(*args, **kwargs) -> APIRouter:
    """
    Create a router without authentication requirement.
    Use for public endpoints like health checks and auth endpoints.
    
    Usage:
        router = create_public_router(prefix="/health", tags=["health"])
    
    Args:
        *args: Arguments to pass to APIRouter
        **kwargs: Keyword arguments to pass to APIRouter
        
    Returns:
        APIRouter without authentication dependency
    """
    return APIRouter(*args, **kwargs)

"""
Debug endpoint to check authentication configuration.
REMOVE THIS IN PRODUCTION - it exposes configuration details.
"""

from fastapi import APIRouter
from app.core.config import settings
from app.core.integrations.entra_id import get_entra_id_auth

router = APIRouter()


@router.get("/debug/auth-config")
async def debug_auth_config():
    """
    Debug endpoint to check what auth configuration is loaded.
    WARNING: This exposes configuration - remove in production!
    """
    entra_id = get_entra_id_auth()
    
    return {
        "tenant_id": settings.AZURE_TENANT_ID,
        "client_id": settings.AZURE_CLIENT_ID,
        "client_secret_length": len(settings.AZURE_CLIENT_SECRET) if settings.AZURE_CLIENT_SECRET else 0,
        "client_secret_preview": settings.AZURE_CLIENT_SECRET[:10] + "..." if settings.AZURE_CLIENT_SECRET and len(settings.AZURE_CLIENT_SECRET) > 10 else "EMPTY",
        "client_secret_ends_with": settings.AZURE_CLIENT_SECRET[-5:] if settings.AZURE_CLIENT_SECRET and len(settings.AZURE_CLIENT_SECRET) > 5 else "EMPTY",
        "redirect_uri": settings.AZURE_REDIRECT_URI,
        "authority": settings.AZURE_AUTHORITY,
        "scopes": settings.AZURE_SCOPES,
        "config_valid": entra_id.validate_config(),
    }

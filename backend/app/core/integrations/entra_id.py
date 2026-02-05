"""
Entra ID (Azure AD) authentication integration.
Handles SSO authentication using Microsoft Entra ID.
"""

import httpx
from typing import Optional, Dict, Any
from msal import ConfidentialClientApplication
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class EntraIDAuth:
    """Entra ID authentication handler."""
    
    def __init__(self):
        """Initialize Entra ID client."""
        self.authority = f"{settings.AZURE_AUTHORITY}/{settings.AZURE_TENANT_ID}"
        self.client_id = settings.AZURE_CLIENT_ID
        self.client_secret = settings.AZURE_CLIENT_SECRET
        self.redirect_uri = settings.AZURE_REDIRECT_URI
        self.scopes = settings.AZURE_SCOPES
        
        # Log configuration (without sensitive data)
        logger.info(
            "Initializing Entra ID client",
            extra={
                "authority": self.authority,
                "client_id": self.client_id[:8] + "..." if self.client_id else None,
                "client_secret_length": len(self.client_secret) if self.client_secret else 0,
                "client_secret_preview": self.client_secret[:5] + "..." if self.client_secret and len(self.client_secret) > 5 else "EMPTY",
                "redirect_uri": self.redirect_uri,
                "scopes": self.scopes,
            }
        )
        
        # Validate configuration
        if not self.client_secret or len(self.client_secret) < 20:
            logger.warning(
                "Client secret appears to be invalid",
                extra={
                    "client_secret_length": len(self.client_secret) if self.client_secret else 0,
                    "client_secret_preview": self.client_secret[:10] if self.client_secret else "EMPTY",
                }
            )
        
        # Initialize MSAL app
        self.app = ConfidentialClientApplication(
            client_id=self.client_id,
            client_credential=self.client_secret,
            authority=self.authority,
        )
    
    def get_authorization_url(self, state: Optional[str] = None) -> str:
        """
        Generate authorization URL for SSO login.
        
        Args:
            state: Optional state parameter for CSRF protection
            
        Returns:
            Authorization URL to redirect user to
        """
        auth_url = self.app.get_authorization_request_url(
            scopes=self.scopes,
            redirect_uri=self.redirect_uri,
            state=state,
        )
        return auth_url
    
    async def acquire_token_by_authorization_code(
        self, 
        code: str, 
        state: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Exchange authorization code for access token.
        
        Args:
            code: Authorization code from callback
            state: State parameter for validation
            
        Returns:
            Token response dictionary or None if failed
        """
        # Note: MSAL's acquire_token_by_authorization_code is synchronous
        # but we keep it as async for consistency with the rest of the codebase
        logger.info(
            "Exchanging authorization code for token",
            extra={
                "redirect_uri": self.redirect_uri,
                "scopes": self.scopes,
            }
        )
        
        result = self.app.acquire_token_by_authorization_code(
            code=code,
            scopes=self.scopes,
            redirect_uri=self.redirect_uri,
        )
        
        if "error" in result:
            # Log the error for debugging
            error_code = result.get("error", "Unknown error")
            error_details = result.get("error_description", "No description provided")
            error_correlation_id = result.get("correlation_id", "N/A")
            
            logger.error(
                "MSAL token acquisition failed",
                extra={
                    "error": error_code,
                    "error_description": error_details,
                    "correlation_id": error_correlation_id,
                    "redirect_uri_used": self.redirect_uri,
                }
            )
            
            raise ValueError(
                f"MSAL token acquisition failed: {error_code} - {error_details} "
                f"(Correlation ID: {error_correlation_id})"
            )
        
        logger.info("Successfully acquired access token from Entra ID")
        return result
    
    async def get_user_info(self, access_token: str) -> Optional[Dict[str, Any]]:
        """
        Get user information from Microsoft Graph API.
        
        Args:
            access_token: Access token from Entra ID
            
        Returns:
            User information dictionary or None if failed
        """
        graph_endpoint = "https://graph.microsoft.com/v1.0/me"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(graph_endpoint, headers=headers)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError:
                return None
    
    def validate_config(self) -> bool:
        """
        Validate that Entra ID configuration is complete.
        
        Returns:
            True if configuration is valid, False otherwise
        """
        return all([
            self.client_id,
            self.client_secret,
            self.redirect_uri,
            settings.AZURE_TENANT_ID,
        ])


# Global instance (lazy initialization)
_entra_id_auth_instance: Optional[EntraIDAuth] = None


def get_entra_id_auth() -> EntraIDAuth:
    """Get or create Entra ID auth instance."""
    global _entra_id_auth_instance
    if _entra_id_auth_instance is None:
        _entra_id_auth_instance = EntraIDAuth()
    return _entra_id_auth_instance

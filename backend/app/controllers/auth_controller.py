"""
Authentication controller for Entra ID SSO.
"""

from typing import Optional
from app.controllers.base_controller import BaseController
from app.services.auth_service import AuthService
from app.schemas.user import LoginResponse


class AuthController(BaseController):
    """Controller for authentication operations."""
    
    def __init__(self, session):
        super().__init__(session)
        self.auth_service = AuthService(session)
    
    async def login(self, authorization_code: str, state: Optional[str] = None) -> LoginResponse:
        """
        Authenticate user with Entra ID authorization code.
        
        Args:
            authorization_code: Authorization code from OAuth callback
            state: Optional state parameter
            
        Returns:
            LoginResponse with token and user info
        """
        return await self.auth_service.authenticate_with_entra_id(
            authorization_code=authorization_code,
            state=state
        )
    
    def get_authorization_url(self, state: Optional[str] = None) -> str:
        """
        Get Entra ID authorization URL for SSO login.
        
        Args:
            state: Optional state parameter for CSRF protection
            
        Returns:
            Authorization URL
        """
        return self.auth_service.get_authorization_url(state=state)













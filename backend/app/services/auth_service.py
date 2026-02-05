"""
Authentication service for Entra ID SSO.
Handles authentication flow and links to Employee records.
"""

from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.core.integrations.entra_id import get_entra_id_auth
from app.core.security import create_access_token
from app.db.repositories.employee_repository import EmployeeRepository
from app.services.base_service import BaseService
from app.schemas.user import TokenResponse, UserInfo, LoginResponse
from datetime import timedelta
from app.core.config import settings


class AuthService(BaseService):
    """Service for authentication operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.employee_repo = EmployeeRepository(session)
    
    async def authenticate_with_entra_id(
        self, 
        authorization_code: str,
        state: Optional[str] = None
    ) -> LoginResponse:
        """
        Authenticate user with Entra ID authorization code.
        
        Args:
            authorization_code: Authorization code from OAuth callback
            state: Optional state parameter
            
        Returns:
            LoginResponse with token and user info
            
        Raises:
            HTTPException: If authentication fails or employee not found
        """
        # Get Entra ID auth instance
        entra_id = get_entra_id_auth()
        
        # Exchange code for token
        try:
            token_result = await entra_id.acquire_token_by_authorization_code(
                code=authorization_code,
                state=state
            )
        except ValueError as e:
            # MSAL error details
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=str(e)
            )
        
        if not token_result or "access_token" not in token_result:
            error_msg = token_result.get("error_description", token_result.get("error", "Unknown error")) if token_result else "No response from MSAL"
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Failed to acquire access token from Entra ID: {error_msg}"
            )
        
        access_token = token_result["access_token"]
        
        # Get user info from Microsoft Graph
        user_info = await entra_id.get_user_info(access_token)
        
        if not user_info:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Failed to retrieve user information from Entra ID"
            )
        
        email = user_info.get("mail") or user_info.get("userPrincipalName")
        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User email not found in Entra ID profile"
            )
        
        # Find employee by email
        employee = await self.employee_repo.get_by_email(email)
        
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Employee record not found for email: {email}. "
                       "Please contact your administrator to create your employee account."
            )
        
        # Check if employee is active
        if employee.status.value != "active":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Employee account is not active. Status: {employee.status.value}"
            )
        
        # Create JWT token for the session
        token_data = {
            "sub": str(employee.id),
            "email": email,
            "employee_id": str(employee.id),
        }
        
        expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        jwt_token = create_access_token(data=token_data, expires_delta=expires_delta)
        
        # Build response
        token_response = TokenResponse(
            access_token=jwt_token,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        )
        
        user_info_response = UserInfo(
            email=email,
            name=user_info.get("displayName"),
            given_name=user_info.get("givenName"),
            family_name=user_info.get("surname"),
            employee_id=employee.id
        )
        
        return LoginResponse(
            token=token_response,
            user=user_info_response
        )
    
    def get_authorization_url(self, state: Optional[str] = None) -> str:
        """
        Get Entra ID authorization URL for SSO login.
        
        Args:
            state: Optional state parameter for CSRF protection
            
        Returns:
            Authorization URL
        """
        entra_id = get_entra_id_auth()
        return entra_id.get_authorization_url(state=state)

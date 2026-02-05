"""
Authentication API endpoints for Entra ID SSO.
"""

import secrets
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.db.session import get_db
from app.services.auth_service import AuthService
from app.schemas.user import LoginResponse, AuthCallbackRequest
from app.core.config import settings

router = APIRouter()


@router.get("/login", response_class=RedirectResponse)
async def login(
    redirect_uri: Optional[str] = Query(None, description="Frontend redirect URI after login"),
    db: AsyncSession = Depends(get_db),
):
    """
    Initiate SSO login flow with Entra ID.
    Redirects user to Microsoft Entra ID login page.
    
    Args:
        redirect_uri: Optional frontend redirect URI (stored in state for later use)
        db: Database session
    
    Note:
        The redirect_uri parameter is stored in state but NOT used as the OAuth redirect_uri.
        The OAuth redirect_uri must be the backend callback URL (configured in AZURE_REDIRECT_URI)
        to match what's registered in Azure App Registration.
    """
    # Generate state for CSRF protection
    # Store the frontend redirect_uri in state so we can use it after authentication
    state = secrets.token_urlsafe(32)
    if redirect_uri:
        # Encode redirect_uri in state (in production, use proper state management)
        state = f"{state}:{redirect_uri}"
    
    auth_service = AuthService(db)
    # Use the configured backend callback URL (not the frontend redirect_uri)
    auth_url = auth_service.get_authorization_url(state=state)
    
    return RedirectResponse(url=auth_url)


@router.get("/callback")
async def callback(
    code: str = Query(..., description="Authorization code from Entra ID"),
    state: Optional[str] = Query(None, description="State parameter for CSRF protection"),
    db: AsyncSession = Depends(get_db),
):
    """
    Handle OAuth callback from Entra ID.
    Exchanges authorization code for tokens and redirects to frontend with token.
    
    Args:
        code: Authorization code from Entra ID
        state: State parameter (may contain frontend redirect URI)
        db: Database session
        
    Returns:
        RedirectResponse to frontend callback page with token in query params
    """
    auth_service = AuthService(db)
    
    try:
        login_response = await auth_service.authenticate_with_entra_id(
            authorization_code=code,
            state=state
        )
        
        # Extract frontend redirect URI and returnUrl from state
        # State format from login: "random_state:http://frontend/callback?returnUrl=/"
        frontend_redirect_uri = "http://localhost:3000/auth/callback"
        return_url = "/"
        
        if state and ":" in state:
            try:
                # Split state: "random_state:http://frontend/callback?returnUrl=/"
                parts = state.split(":", 1)
                if len(parts) == 2:
                    frontend_url = parts[1]
                    # Extract base URL and returnUrl
                    if "?" in frontend_url:
                        base_url, query_string = frontend_url.split("?", 1)
                        frontend_redirect_uri = base_url
                        # Extract returnUrl from query string
                        from urllib.parse import parse_qs, unquote
                        query_params = parse_qs(query_string)
                        if "returnUrl" in query_params:
                            return_url = unquote(query_params["returnUrl"][0])
                    else:
                        frontend_redirect_uri = frontend_url
            except (IndexError, ValueError, KeyError) as e:
                # Log error but use defaults
                import logging
                logging.warning(f"Error parsing state parameter: {e}, using defaults")
        
        # Build redirect URL with token and user info as query parameters
        from urllib.parse import urlencode, quote
        params = {
            "token": login_response.token.access_token,
            "email": login_response.user.email,
        }
        if login_response.user.name:
            params["name"] = login_response.user.name
        if login_response.user.employee_id:
            params["employee_id"] = str(login_response.user.employee_id)
        params["returnUrl"] = return_url
        
        redirect_url = f"{frontend_redirect_uri}?{urlencode(params)}"
        
        return RedirectResponse(url=redirect_url)
    except HTTPException as e:
        # Redirect to frontend with error
        frontend_error_url = f"http://localhost:3000/auth/login?error={e.detail.replace(' ', '_')}"
        return RedirectResponse(url=frontend_error_url)
    except Exception as e:
        frontend_error_url = f"http://localhost:3000/auth/login?error=auth_failed"
        return RedirectResponse(url=frontend_error_url)


@router.post("/callback", response_model=LoginResponse)
async def callback_post(
    callback_data: AuthCallbackRequest,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    """
    Handle OAuth callback from Entra ID (POST method).
    Alternative endpoint for frontend to handle callback programmatically.
    
    Args:
        callback_data: Callback request with authorization code
        db: Database session
        
    Returns:
        LoginResponse with JWT token and user info
    """
    auth_service = AuthService(db)
    
    try:
        login_response = await auth_service.authenticate_with_entra_id(
            authorization_code=callback_data.code,
            state=callback_data.state
        )
        return login_response
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Authentication failed: {str(e)}"
        )


@router.get("/logout")
async def logout():
    """
    Logout endpoint.
    In a stateless JWT system, logout is handled client-side by removing the token.
    This endpoint can be used to redirect to Entra ID logout if needed.
    """
    # For Entra ID logout, redirect to Microsoft logout endpoint
    logout_url = f"{settings.AZURE_AUTHORITY}/{settings.AZURE_TENANT_ID}/oauth2/v2.0/logout"
    return {"message": "Logout successful. Please clear your token client-side.", "logout_url": logout_url}

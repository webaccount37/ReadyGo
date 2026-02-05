"""
User and authentication schemas.
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID


class TokenResponse(BaseModel):
    """JWT token response."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserInfo(BaseModel):
    """User information from Entra ID."""
    email: str
    name: Optional[str] = None
    given_name: Optional[str] = None
    family_name: Optional[str] = None
    employee_id: Optional[UUID] = None


class LoginResponse(BaseModel):
    """Login response with token and user info."""
    token: TokenResponse
    user: UserInfo


class AuthCallbackRequest(BaseModel):
    """OAuth callback request."""
    code: str
    state: Optional[str] = None













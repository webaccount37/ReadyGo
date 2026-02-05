"""
Token refresh endpoint for extending session without re-authentication.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.api.v1.middleware import require_authentication
from app.models.employee import Employee
from app.core.security import create_access_token
from app.schemas.user import TokenResponse
from datetime import timedelta
from app.core.config import settings

router = APIRouter()


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    current_employee: Employee = Depends(require_authentication),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Refresh the authentication token.
    Creates a new token with extended expiration without requiring re-authentication.
    
    Args:
        current_employee: Current authenticated employee (from existing token)
        db: Database session
        
    Returns:
        New TokenResponse with refreshed token
    """
    # Verify employee is still active
    if current_employee.status.value != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Employee account is not active. Status: {current_employee.status.value}",
        )
    
    # Create new token with same claims
    token_data = {
        "sub": str(current_employee.id),
        "email": current_employee.email,
        "employee_id": str(current_employee.id),
    }
    
    expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    jwt_token = create_access_token(data=token_data, expires_delta=expires_delta)
    
    return TokenResponse(
        access_token=jwt_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )

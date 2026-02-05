"""
API middleware for authentication and common concerns.
Centralized authentication enforcement for all protected routes.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.core.security import decode_access_token
from app.db.session import get_db
from app.db.repositories.employee_repository import EmployeeRepository
from app.models.employee import Employee

security = HTTPBearer()


async def require_authentication(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Employee:
    """
    Centralized authentication dependency.
    This should be used as a dependency on all protected routes.
    
    Usage:
        @router.get("/endpoint")
        async def my_endpoint(
            current_employee: Employee = Depends(require_authentication)
        ):
            ...
    
    Args:
        credentials: HTTP Bearer token credentials (injected by FastAPI)
        db: Database session
        
    Returns:
        Current authenticated Employee
        
    Raises:
        HTTPException: If authentication fails
    """
    token = credentials.credentials
    
    # Decode token
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get employee ID from token
    employee_id_str = payload.get("employee_id") or payload.get("sub")
    if not employee_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing employee ID",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        employee_id = UUID(employee_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid employee ID in token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get employee from database
    employee_repo = EmployeeRepository(db)
    employee = await employee_repo.get(employee_id)
    
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Employee not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if employee is active
    if employee.status.value != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Employee account is not active. Status: {employee.status.value}",
        )
    
    return employee

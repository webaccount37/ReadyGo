"""
Employee API endpoints.
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.db.session import get_db
from app.controllers.employee_controller import EmployeeController
from app.schemas.employee import (
    EmployeeCreate,
    EmployeeUpdate,
    EmployeeResponse,
    EmployeeListResponse,
)
from app.schemas.relationships import (
    LinkEmployeesToOpportunityRequest,
    LinkEmployeesToReleaseRequest,
    LinkEmployeeToOpportunityRequest,
    LinkEmployeeToReleaseRequest,
    UnlinkRequest,
)

router = APIRouter()


@router.post("", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
async def create_employee(
    employee_data: EmployeeCreate,
    db: AsyncSession = Depends(get_db),
) -> EmployeeResponse:
    """Create a new employee."""
    try:
        controller = EmployeeController(db)
        return await controller.create_employee(employee_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("", response_model=EmployeeListResponse)
async def list_employees(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    status: str = Query(None),
    employee_type: str = Query(None),
    billable: bool = Query(None),
    db: AsyncSession = Depends(get_db),
) -> EmployeeListResponse:
    """List employees with optional filters."""
    controller = EmployeeController(db)
    return await controller.list_employees(
        skip=skip,
        limit=limit,
        status=status,
        employee_type=employee_type,
        billable=billable,
    )


@router.get("/{employee_id}", response_model=EmployeeResponse)
async def get_employee(
    employee_id: UUID,
    include_relationships: bool = Query(False),
    db: AsyncSession = Depends(get_db),
) -> EmployeeResponse:
    """Get employee by ID."""
    controller = EmployeeController(db)
    employee = await controller.get_employee(employee_id, include_relationships)
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )
    return employee


@router.put("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: UUID,
    employee_data: EmployeeUpdate,
    db: AsyncSession = Depends(get_db),
) -> EmployeeResponse:
    """Update an employee."""
    try:
        controller = EmployeeController(db)
        employee = await controller.update_employee(employee_id, employee_data)
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found",
            )
        return employee
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(
    employee_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete an employee."""
    controller = EmployeeController(db)
    deleted = await controller.delete_employee(employee_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )


@router.post("/{employee_id}/opportunities/{opportunity_id}/link", status_code=status.HTTP_204_NO_CONTENT)
async def link_employee_to_opportunity(
    employee_id: UUID,
    opportunity_id: UUID,
    link_data: LinkEmployeeToOpportunityRequest,
    db: AsyncSession = Depends(get_db),
):
    """Link an employee to an opportunity with required association fields."""
    try:
        controller = EmployeeController(db)
        request = LinkEmployeesToOpportunityRequest(
            employee_ids=[employee_id],
            releases=link_data.releases,
        )
        success = await controller.link_employees_to_opportunity(opportunity_id, request)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee, opportunity, or role not found",
            )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        import logging
        import traceback
        logger = logging.getLogger(__name__)
        error_traceback = traceback.format_exc()
        logger.error(f"Error linking employee to opportunity: {e}")
        logger.error(f"Traceback: {error_traceback}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}",
        )


@router.delete("/{employee_id}/opportunities/{opportunity_id}/unlink", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_employee_from_opportunity(
    employee_id: UUID,
    opportunity_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Unlink an employee from an opportunity."""
    controller = EmployeeController(db)
    request = UnlinkRequest(ids=[employee_id])
    success = await controller.unlink_employees_from_opportunity(opportunity_id, request)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee or opportunity not found",
        )


@router.post("/{employee_id}/releases/{release_id}/link", status_code=status.HTTP_204_NO_CONTENT)
async def link_employee_to_release(
    employee_id: UUID,
    release_id: UUID,
    link_data: LinkEmployeeToReleaseRequest,
    db: AsyncSession = Depends(get_db),
):
    """Link an employee to a release with required association fields."""
    controller = EmployeeController(db)
    request = LinkEmployeesToReleaseRequest(
        employee_ids=[employee_id],
        role_id=link_data.role_id,
        start_date=link_data.start_date,
        end_date=link_data.end_date,
        project_rate=link_data.project_rate,
        delivery_center=link_data.delivery_center,
    )
    success = await controller.link_employees_to_release(release_id, request)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee or release not found",
        )


@router.delete("/{employee_id}/releases/{release_id}/unlink", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_employee_from_release(
    employee_id: UUID,
    release_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Unlink an employee from a release."""
    controller = EmployeeController(db)
    request = UnlinkRequest(ids=[employee_id])
    success = await controller.unlink_employees_from_release(release_id, request)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee or release not found",
        )



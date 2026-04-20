"""
Opportunity API endpoints.
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from datetime import date

from app.db.session import get_db
from app.controllers.opportunity_controller import OpportunityController
from app.schemas.opportunity import (
    OpportunityCreate,
    OpportunityUpdate,
    OpportunityResponse,
    OpportunityListResponse,
    OpportunityAverageDealValueResponse,
)
from app.schemas.relationships import LinkRolesToOpportunityRequest, UnlinkRequest

router = APIRouter()


@router.post("", response_model=OpportunityResponse, status_code=status.HTTP_201_CREATED)
async def create_opportunity(
    opportunity_data: OpportunityCreate,
    db: AsyncSession = Depends(get_db),
) -> OpportunityResponse:
    """Create a new opportunity."""
    controller = OpportunityController(db)
    return await controller.create_opportunity(opportunity_data)


@router.get("", response_model=OpportunityListResponse)
async def list_opportunities(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    account_id: UUID = Query(None),
    status: str = Query(None),
    start_date: date = Query(None),
    end_date: date = Query(None),
    search: str = Query(None),
    sort_by: str = Query(
        None,
        description="name, status, start_date, end_date, account, deal_value_usd, forecast_value_usd, default_currency, delivery_center, owner",
    ),
    sort_order: str = Query("asc"),
    db: AsyncSession = Depends(get_db),
) -> OpportunityListResponse:
    """List opportunities with optional filters."""
    controller = OpportunityController(db)
    return await controller.list_opportunities(
        skip=skip,
        limit=limit,
        account_id=account_id,
        status=status,
        start_date=start_date,
        end_date=end_date,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.post("/sync-forecasts")
async def sync_opportunity_forecasts(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Recompute deal_value_usd and forecast_value_usd for all opportunities. Fixes stale data."""
    controller = OpportunityController(db)
    updated = await controller.sync_forecast_values()
    return {"updated": updated}


@router.get("/stats/average-deal-value", response_model=OpportunityAverageDealValueResponse)
async def get_average_deal_value(
    currency: str = Query("USD", description="Currency code (e.g. USD)"),
    db: AsyncSession = Depends(get_db),
) -> OpportunityAverageDealValueResponse:
    """Get average deal value for opportunities with the given currency."""
    controller = OpportunityController(db)
    return await controller.get_average_deal_value_by_currency(currency)


@router.post("/sharepoint/provision-stale")
async def provision_sharepoint_stale(
    limit: int = Query(200, ge=1, le=2000),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Backfill: find or create SharePoint folders for opportunities with no linked folder."""
    controller = OpportunityController(db)
    try:
        return await controller.provision_sharepoint_backfill(limit=limit)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{opportunity_id}", response_model=OpportunityResponse)
async def get_opportunity(
    opportunity_id: UUID,
    include_relationships: bool = Query(False),
    db: AsyncSession = Depends(get_db),
) -> OpportunityResponse:
    """Get opportunity by ID."""
    controller = OpportunityController(db)
    opportunity = await controller.get_opportunity(opportunity_id, include_relationships)
    if not opportunity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found",
        )
    return opportunity


@router.post("/{opportunity_id}/sharepoint/provision", response_model=OpportunityResponse)
async def reprovision_sharepoint_for_opportunity(
    opportunity_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> OpportunityResponse:
    """Retry SharePoint folder link/create for this opportunity."""
    controller = OpportunityController(db)
    try:
        opportunity = await controller.reprovision_sharepoint(opportunity_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    if not opportunity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found",
        )
    return opportunity


@router.get("/{opportunity_id}/children", response_model=OpportunityListResponse)
async def list_child_opportunities(
    opportunity_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> OpportunityListResponse:
    """List child opportunities of a parent."""
    controller = OpportunityController(db)
    return await controller.list_child_opportunities(opportunity_id, skip, limit)


@router.put("/{opportunity_id}", response_model=OpportunityResponse)
async def update_opportunity(
    opportunity_id: UUID,
    opportunity_data: OpportunityUpdate,
    db: AsyncSession = Depends(get_db),
) -> OpportunityResponse:
    """Update an opportunity."""
    controller = OpportunityController(db)
    try:
        opportunity = await controller.update_opportunity(opportunity_id, opportunity_data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    if not opportunity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found",
        )
    return opportunity


@router.delete("/{opportunity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_opportunity(
    opportunity_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete an opportunity."""
    controller = OpportunityController(db)
    deleted = await controller.delete_opportunity(opportunity_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found",
        )


@router.post("/{opportunity_id}/roles/link", status_code=status.HTTP_204_NO_CONTENT)
async def link_roles_to_opportunity(
    opportunity_id: UUID,
    request: LinkRolesToOpportunityRequest,
    db: AsyncSession = Depends(get_db),
):
    """Link roles to an opportunity."""
    controller = OpportunityController(db)
    success = await controller.link_roles_to_opportunity(opportunity_id, request)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found",
        )


@router.delete("/{opportunity_id}/roles/unlink", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_roles_from_opportunity(
    opportunity_id: UUID,
    request: UnlinkRequest,
    db: AsyncSession = Depends(get_db),
):
    """Unlink roles from an opportunity."""
    controller = OpportunityController(db)
    success = await controller.unlink_roles_from_opportunity(opportunity_id, request)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Opportunity not found",
        )



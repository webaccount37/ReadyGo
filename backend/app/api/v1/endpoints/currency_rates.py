"""
Currency rate API endpoints.
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.db.session import get_db
from app.controllers.currency_rate_controller import CurrencyRateController
from app.schemas.currency_rate import (
    CurrencyRateCreate,
    CurrencyRateUpdate,
    CurrencyRateResponse,
    CurrencyRateListResponse,
)

router = APIRouter()


@router.post("", response_model=CurrencyRateResponse, status_code=status.HTTP_201_CREATED)
async def create_currency_rate(
    currency_rate_data: CurrencyRateCreate,
    db: AsyncSession = Depends(get_db),
) -> CurrencyRateResponse:
    """Create a new currency rate."""
    controller = CurrencyRateController(db)
    try:
        return await controller.create_currency_rate(currency_rate_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("", response_model=CurrencyRateListResponse)
async def list_currency_rates(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> CurrencyRateListResponse:
    """List currency rates with pagination."""
    controller = CurrencyRateController(db)
    return await controller.list_currency_rates(
        skip=skip,
        limit=limit,
    )


@router.get("/{currency_rate_id}", response_model=CurrencyRateResponse)
async def get_currency_rate(
    currency_rate_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> CurrencyRateResponse:
    """Get currency rate by ID."""
    controller = CurrencyRateController(db)
    currency_rate = await controller.get_currency_rate(currency_rate_id)
    if not currency_rate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Currency rate not found",
        )
    return currency_rate


@router.get("/code/{currency_code}", response_model=CurrencyRateResponse)
async def get_currency_rate_by_code(
    currency_code: str,
    db: AsyncSession = Depends(get_db),
) -> CurrencyRateResponse:
    """Get currency rate by currency code."""
    controller = CurrencyRateController(db)
    currency_rate = await controller.get_currency_rate_by_code(currency_code)
    if not currency_rate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Currency rate for {currency_code} not found",
        )
    return currency_rate


@router.put("/{currency_rate_id}", response_model=CurrencyRateResponse)
async def update_currency_rate(
    currency_rate_id: UUID,
    currency_rate_data: CurrencyRateUpdate,
    db: AsyncSession = Depends(get_db),
) -> CurrencyRateResponse:
    """Update a currency rate."""
    controller = CurrencyRateController(db)
    currency_rate = await controller.update_currency_rate(currency_rate_id, currency_rate_data)
    if not currency_rate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Currency rate not found",
        )
    return currency_rate


@router.put("/code/{currency_code}", response_model=CurrencyRateResponse)
async def update_currency_rate_by_code(
    currency_code: str,
    currency_rate_data: CurrencyRateUpdate,
    db: AsyncSession = Depends(get_db),
) -> CurrencyRateResponse:
    """Update a currency rate by currency code."""
    controller = CurrencyRateController(db)
    currency_rate = await controller.update_currency_rate_by_code(currency_code, currency_rate_data)
    if not currency_rate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Currency rate for {currency_code} not found",
        )
    return currency_rate


@router.delete("/{currency_rate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_currency_rate(
    currency_rate_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a currency rate."""
    controller = CurrencyRateController(db)
    try:
        deleted = await controller.delete_currency_rate(currency_rate_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Currency rate not found",
        )


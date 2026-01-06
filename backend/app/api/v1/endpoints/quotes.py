"""
Quote API endpoints.
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.db.session import get_db
from app.controllers.quote_controller import QuoteController
from app.schemas.quote import (
    QuoteCreate,
    QuoteResponse,
    QuoteDetailResponse,
    QuoteListResponse,
    QuoteStatusUpdate,
)

router = APIRouter()


@router.post("", response_model=QuoteResponse, status_code=status.HTTP_201_CREATED)
async def create_quote(
    quote_data: QuoteCreate,
    db: AsyncSession = Depends(get_db),
) -> QuoteResponse:
    """Create a new quote from an active estimate."""
    controller = QuoteController(db)
    try:
        # TODO: Get created_by from authenticated user
        return await controller.create_quote(quote_data, created_by=None)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("", response_model=QuoteListResponse)
async def list_quotes(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    opportunity_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> QuoteListResponse:
    """List quotes with optional filters."""
    controller = QuoteController(db)
    return await controller.list_quotes(
        skip=skip,
        limit=limit,
        opportunity_id=opportunity_id,
    )


@router.get("/{quote_id}", response_model=QuoteResponse)
async def get_quote(
    quote_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> QuoteResponse:
    """Get quote by ID."""
    controller = QuoteController(db)
    quote = await controller.get_quote(quote_id)
    if not quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found",
        )
    return quote


@router.get("/{quote_id}/detail", response_model=QuoteDetailResponse)
async def get_quote_detail(
    quote_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> QuoteDetailResponse:
    """Get quote with all relationships."""
    controller = QuoteController(db)
    quote = await controller.get_quote_detail(quote_id)
    if not quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found",
        )
    return quote


@router.patch("/{quote_id}/status", response_model=QuoteResponse)
async def update_quote_status(
    quote_id: UUID,
    status_data: QuoteStatusUpdate,
    db: AsyncSession = Depends(get_db),
) -> QuoteResponse:
    """Update quote status."""
    controller = QuoteController(db)
    quote = await controller.update_quote_status(quote_id, status_data)
    if not quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found",
        )
    return quote


@router.post("/{quote_id}/deactivate", response_model=QuoteResponse)
async def deactivate_quote(
    quote_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> QuoteResponse:
    """Deactivate quote and unlock opportunity/estimates."""
    controller = QuoteController(db)
    quote = await controller.deactivate_quote(quote_id)
    if not quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quote not found",
        )
    return quote


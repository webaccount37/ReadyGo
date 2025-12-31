"""
Delivery Center API endpoints.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.controllers.delivery_center_controller import DeliveryCenterController
from app.schemas.delivery_center import DeliveryCenterListResponse

router = APIRouter()


@router.get("", response_model=DeliveryCenterListResponse)
async def list_delivery_centers(
    db: AsyncSession = Depends(get_db),
) -> DeliveryCenterListResponse:
    """List all delivery centers."""
    controller = DeliveryCenterController(db)
    return await controller.list_delivery_centers()









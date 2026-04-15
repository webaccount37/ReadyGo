"""Expense category admin API."""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.controllers.expense_category_controller import ExpenseCategoryController
from app.schemas.expense_category import (
    ExpenseCategoryCreate,
    ExpenseCategoryUpdate,
    ExpenseCategoryResponse,
    ExpenseCategoryListResponse,
)

router = APIRouter()


@router.get("", response_model=ExpenseCategoryListResponse)
async def list_expense_categories(
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> ExpenseCategoryListResponse:
    controller = ExpenseCategoryController(db)
    return await controller.list_categories(skip=skip, limit=limit)


@router.post("", response_model=ExpenseCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_expense_category(
    data: ExpenseCategoryCreate,
    db: AsyncSession = Depends(get_db),
) -> ExpenseCategoryResponse:
    controller = ExpenseCategoryController(db)
    try:
        return await controller.create(data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/{category_id}", response_model=ExpenseCategoryResponse)
async def update_expense_category(
    category_id: int,
    data: ExpenseCategoryUpdate,
    db: AsyncSession = Depends(get_db),
) -> ExpenseCategoryResponse:
    controller = ExpenseCategoryController(db)
    try:
        return await controller.update(category_id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense_category(category_id: int, db: AsyncSession = Depends(get_db)):
    controller = ExpenseCategoryController(db)
    try:
        await controller.delete(category_id)
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))

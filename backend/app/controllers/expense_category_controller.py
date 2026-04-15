"""Expense category controller."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.expense_category_service import ExpenseCategoryService
from app.schemas.expense_category import (
    ExpenseCategoryCreate,
    ExpenseCategoryUpdate,
    ExpenseCategoryResponse,
    ExpenseCategoryListResponse,
)


class ExpenseCategoryController:
    def __init__(self, session: AsyncSession):
        self.service = ExpenseCategoryService(session)

    async def list_categories(self, skip: int = 0, limit: int = 500) -> ExpenseCategoryListResponse:
        return await self.service.list_categories(skip=skip, limit=limit)

    async def create(self, data: ExpenseCategoryCreate) -> ExpenseCategoryResponse:
        return await self.service.create(data)

    async def update(self, category_id: int, data: ExpenseCategoryUpdate) -> ExpenseCategoryResponse:
        return await self.service.update(category_id, data)

    async def delete(self, category_id: int) -> None:
        await self.service.delete(category_id)

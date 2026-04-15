"""Expense category CRUD."""

from typing import List
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories.expense_category_repository import ExpenseCategoryRepository
from app.schemas.expense_category import (
    ExpenseCategoryCreate,
    ExpenseCategoryUpdate,
    ExpenseCategoryResponse,
    ExpenseCategoryListResponse,
)


class ExpenseCategoryService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = ExpenseCategoryRepository(session)

    async def list_categories(self, skip: int = 0, limit: int = 500) -> ExpenseCategoryListResponse:
        rows = await self.repo.list_all(skip=skip, limit=limit)
        total = await self.repo.count_all()
        items: List[ExpenseCategoryResponse] = []
        for c in rows:
            n = await self.repo.count_lines(c.id)
            items.append(ExpenseCategoryResponse(id=c.id, name=c.name, in_use=n > 0))
        return ExpenseCategoryListResponse(items=items, total=total)

    async def create(self, data: ExpenseCategoryCreate) -> ExpenseCategoryResponse:
        if await self.repo.get_by_name(data.name):
            raise ValueError("A category with this name already exists")
        c = await self.repo.create(data.name)
        await self.session.commit()
        return ExpenseCategoryResponse(id=c.id, name=c.name, in_use=False)

    async def update(self, category_id: int, data: ExpenseCategoryUpdate) -> ExpenseCategoryResponse:
        other = await self.repo.get_by_name(data.name)
        if other and other.id != category_id:
            raise ValueError("A category with this name already exists")
        c = await self.repo.update(category_id, data.name)
        if not c:
            raise ValueError("Category not found")
        n = await self.repo.count_lines(category_id)
        await self.session.commit()
        return ExpenseCategoryResponse(id=c.id, name=c.name, in_use=n > 0)

    async def delete(self, category_id: int) -> None:
        if await self.repo.count_lines(category_id) > 0:
            raise ValueError("Category is in use and cannot be deleted")
        ok = await self.repo.delete(category_id)
        if not ok:
            raise ValueError("Category not found")
        await self.session.commit()

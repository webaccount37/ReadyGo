"""Expense category repository."""

from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.expense_category import ExpenseCategory
from app.models.expense import ExpenseLine


class ExpenseCategoryRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_all(self, skip: int = 0, limit: int = 500) -> List[ExpenseCategory]:
        result = await self.session.execute(
            select(ExpenseCategory).order_by(ExpenseCategory.id).offset(skip).limit(limit)
        )
        return list(result.scalars().all())

    async def count_all(self) -> int:
        r = await self.session.execute(select(func.count()).select_from(ExpenseCategory))
        return int(r.scalar_one() or 0)

    async def get(self, category_id: int) -> Optional[ExpenseCategory]:
        return await self.session.get(ExpenseCategory, category_id)

    async def get_by_name(self, name: str) -> Optional[ExpenseCategory]:
        r = await self.session.execute(select(ExpenseCategory).where(ExpenseCategory.name == name))
        return r.scalar_one_or_none()

    async def create(self, name: str) -> ExpenseCategory:
        c = ExpenseCategory(name=name.strip())
        self.session.add(c)
        await self.session.flush()
        await self.session.refresh(c)
        return c

    async def update(self, category_id: int, name: str) -> Optional[ExpenseCategory]:
        c = await self.get(category_id)
        if not c:
            return None
        c.name = name.strip()
        await self.session.flush()
        await self.session.refresh(c)
        return c

    async def count_lines(self, category_id: int) -> int:
        r = await self.session.execute(
            select(func.count()).select_from(ExpenseLine).where(ExpenseLine.expense_category_id == category_id)
        )
        return int(r.scalar_one() or 0)

    async def delete(self, category_id: int) -> bool:
        c = await self.get(category_id)
        if not c:
            return False
        await self.session.delete(c)
        await self.session.flush()
        return True

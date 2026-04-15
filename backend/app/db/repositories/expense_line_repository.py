"""Expense line repository."""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from sqlalchemy.orm import selectinload

from app.models.expense import ExpenseLine


class ExpenseLineRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, line_id: UUID) -> Optional[ExpenseLine]:
        result = await self.session.execute(
            select(ExpenseLine)
            .options(
                selectinload(ExpenseLine.sheet),
                selectinload(ExpenseLine.account),
                selectinload(ExpenseLine.engagement),
                selectinload(ExpenseLine.opportunity),
                selectinload(ExpenseLine.engagement_phase),
                selectinload(ExpenseLine.category),
                selectinload(ExpenseLine.receipts),
            )
            .where(ExpenseLine.id == line_id)
        )
        return result.scalar_one_or_none()

    async def list_by_sheet(self, sheet_id: UUID) -> List[ExpenseLine]:
        result = await self.session.execute(
            select(ExpenseLine)
            .options(
                selectinload(ExpenseLine.account),
                selectinload(ExpenseLine.engagement),
                selectinload(ExpenseLine.opportunity),
                selectinload(ExpenseLine.engagement_phase),
                selectinload(ExpenseLine.category),
                selectinload(ExpenseLine.receipts),
            )
            .where(ExpenseLine.expense_sheet_id == sheet_id)
            .order_by(ExpenseLine.row_order)
        )
        return list(result.scalars().all())

    async def create(self, **kwargs) -> ExpenseLine:
        row = ExpenseLine(**kwargs)
        self.session.add(row)
        await self.session.flush()
        await self.session.refresh(row)
        return row

    async def update(self, line_id: UUID, **kwargs) -> Optional[ExpenseLine]:
        await self.session.execute(update(ExpenseLine).where(ExpenseLine.id == line_id).values(**kwargs))
        await self.session.flush()
        return await self.get(line_id)

    async def delete(self, line_id: UUID) -> bool:
        r = await self.session.execute(delete(ExpenseLine).where(ExpenseLine.id == line_id))
        await self.session.flush()
        return r.rowcount > 0

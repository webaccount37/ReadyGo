"""Expense receipt metadata repository."""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.models.expense import ExpenseReceipt


class ExpenseReceiptRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, receipt_id: UUID) -> Optional[ExpenseReceipt]:
        return await self.session.get(ExpenseReceipt, receipt_id)

    async def list_by_line(self, line_id: UUID) -> List[ExpenseReceipt]:
        r = await self.session.execute(
            select(ExpenseReceipt).where(ExpenseReceipt.expense_line_id == line_id).order_by(ExpenseReceipt.created_at)
        )
        return list(r.scalars().all())

    async def create(self, **kwargs) -> ExpenseReceipt:
        rec = ExpenseReceipt(**kwargs)
        self.session.add(rec)
        await self.session.flush()
        await self.session.refresh(rec)
        return rec

    async def delete(self, receipt_id: UUID) -> bool:
        r = await self.session.execute(delete(ExpenseReceipt).where(ExpenseReceipt.id == receipt_id))
        await self.session.flush()
        return r.rowcount > 0

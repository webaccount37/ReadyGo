"""Engagement expense approver repository."""

from typing import List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from app.models.engagement_expense_approver import EngagementExpenseApprover


class EngagementExpenseApproverRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_engagement_ids_by_approver(self, employee_id: UUID) -> List[UUID]:
        result = await self.session.execute(
            select(EngagementExpenseApprover.engagement_id).where(
                EngagementExpenseApprover.employee_id == employee_id
            )
        )
        return [r[0] for r in result.fetchall()]

    async def list_by_engagement(self, engagement_id: UUID) -> List[EngagementExpenseApprover]:
        result = await self.session.execute(
            select(EngagementExpenseApprover)
            .options(selectinload(EngagementExpenseApprover.employee))
            .where(EngagementExpenseApprover.engagement_id == engagement_id)
        )
        return list(result.scalars().all())

    async def set_approvers(self, engagement_id: UUID, employee_ids: List[UUID]) -> List[EngagementExpenseApprover]:
        await self.session.execute(
            delete(EngagementExpenseApprover).where(
                EngagementExpenseApprover.engagement_id == engagement_id
            )
        )
        approvers = []
        for emp_id in employee_ids:
            a = EngagementExpenseApprover(engagement_id=engagement_id, employee_id=emp_id)
            self.session.add(a)
            approvers.append(a)
        await self.session.flush()
        return approvers

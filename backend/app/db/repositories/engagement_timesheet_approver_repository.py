"""
Engagement timesheet approver repository for database operations.
"""

from typing import List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.models.engagement_timesheet_approver import EngagementTimesheetApprover


class EngagementTimesheetApproverRepository:
    """Repository for engagement timesheet approver operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_by_engagement(self, engagement_id: UUID) -> List[EngagementTimesheetApprover]:
        """List approvers for an engagement."""
        from sqlalchemy.orm import selectinload

        result = await self.session.execute(
            select(EngagementTimesheetApprover)
            .options(selectinload(EngagementTimesheetApprover.employee))
            .where(EngagementTimesheetApprover.engagement_id == engagement_id)
        )
        return list(result.scalars().all())

    async def set_approvers(self, engagement_id: UUID, employee_ids: List[UUID]) -> List[EngagementTimesheetApprover]:
        """Replace approvers for an engagement."""
        await self.session.execute(
            delete(EngagementTimesheetApprover).where(
                EngagementTimesheetApprover.engagement_id == engagement_id
            )
        )
        approvers = []
        for emp_id in employee_ids:
            approver = EngagementTimesheetApprover(
                engagement_id=engagement_id,
                employee_id=emp_id,
            )
            self.session.add(approver)
            approvers.append(approver)
        await self.session.flush()
        return approvers

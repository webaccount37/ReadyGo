"""Expense sheet repository (parallel to timesheet repository patterns)."""

from typing import Optional, List, Dict
from uuid import UUID
from datetime import date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, union_all

from app.models.expense import ExpenseSheet, ExpenseLine, ExpenseStatusHistory
from app.models.timesheet import TimesheetStatus
from app.models.engagement_expense_approver import EngagementExpenseApprover
from app.models.delivery_center_approver import DeliveryCenterApprover
from app.models.engagement import Engagement, EngagementLineItem
from app.models.opportunity import Opportunity
from app.models.employee import Employee


class ExpenseSheetRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, sheet_id: UUID) -> Optional[ExpenseSheet]:
        from sqlalchemy.orm import selectinload

        r = await self.session.execute(
            select(ExpenseSheet)
            .options(
                selectinload(ExpenseSheet.employee),
                selectinload(ExpenseSheet.status_history).selectinload(ExpenseStatusHistory.changed_by_employee),
                selectinload(ExpenseSheet.lines).selectinload(ExpenseLine.account),
                selectinload(ExpenseSheet.lines).selectinload(ExpenseLine.engagement),
                selectinload(ExpenseSheet.lines).selectinload(ExpenseLine.opportunity),
                selectinload(ExpenseSheet.lines).selectinload(ExpenseLine.engagement_phase),
                selectinload(ExpenseSheet.lines).selectinload(ExpenseLine.category),
                selectinload(ExpenseSheet.lines).selectinload(ExpenseLine.receipts),
            )
            .where(ExpenseSheet.id == sheet_id)
        )
        return r.scalar_one_or_none()

    async def get_by_employee_and_week(self, employee_id: UUID, week_start_date: date) -> Optional[ExpenseSheet]:
        from sqlalchemy.orm import selectinload

        r = await self.session.execute(
            select(ExpenseSheet)
            .options(
                selectinload(ExpenseSheet.employee),
                selectinload(ExpenseSheet.status_history).selectinload(ExpenseStatusHistory.changed_by_employee),
                selectinload(ExpenseSheet.lines).selectinload(ExpenseLine.account),
                selectinload(ExpenseSheet.lines).selectinload(ExpenseLine.engagement),
                selectinload(ExpenseSheet.lines).selectinload(ExpenseLine.opportunity),
                selectinload(ExpenseSheet.lines).selectinload(ExpenseLine.engagement_phase),
                selectinload(ExpenseSheet.lines).selectinload(ExpenseLine.category),
                selectinload(ExpenseSheet.lines).selectinload(ExpenseLine.receipts),
            )
            .where(
                ExpenseSheet.employee_id == employee_id,
                ExpenseSheet.week_start_date == week_start_date,
            )
        )
        return r.scalar_one_or_none()

    async def create(self, **kwargs) -> ExpenseSheet:
        s = ExpenseSheet(**kwargs)
        self.session.add(s)
        await self.session.flush()
        await self.session.refresh(s)
        return s

    async def get_week_statuses(
        self,
        employee_id: UUID,
        start_date: date,
        end_date: date,
    ) -> Dict[str, str]:
        r = await self.session.execute(
            select(ExpenseSheet.week_start_date, ExpenseSheet.status).where(
                ExpenseSheet.employee_id == employee_id,
                ExpenseSheet.week_start_date >= start_date,
                ExpenseSheet.week_start_date <= end_date,
            )
        )
        return {row[0].isoformat(): row[1].value for row in r.fetchall()}

    def _approver_union_subqueries(self, approver_employee_id: UUID):
        eng_approver_subq = select(EngagementExpenseApprover.engagement_id).where(
            EngagementExpenseApprover.employee_id == approver_employee_id
        )
        dc_approver_subq = (
            select(Engagement.id.label("engagement_id"))
            .select_from(Engagement)
            .join(Opportunity, Engagement.opportunity_id == Opportunity.id)
            .join(DeliveryCenterApprover, Opportunity.delivery_center_id == DeliveryCenterApprover.delivery_center_id)
            .where(DeliveryCenterApprover.employee_id == approver_employee_id)
        )
        approver_engagement_ids = union_all(eng_approver_subq, dc_approver_subq).subquery()
        approver_dc_ids = select(DeliveryCenterApprover.delivery_center_id).where(
            DeliveryCenterApprover.employee_id == approver_employee_id
        )
        return approver_engagement_ids, approver_dc_ids

    async def list_pending_approvals_for_approver(
        self,
        approver_employee_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[ExpenseSheet]:
        from sqlalchemy.orm import selectinload

        approver_engagement_ids, approver_dc_ids = self._approver_union_subqueries(approver_employee_id)

        engagement_based = (
            select(ExpenseSheet.id)
            .join(ExpenseLine, ExpenseSheet.id == ExpenseLine.expense_sheet_id)
            .where(
                ExpenseSheet.status == TimesheetStatus.SUBMITTED,
                ExpenseLine.engagement_id.in_(select(approver_engagement_ids.c.engagement_id)),
            )
            .distinct()
        )
        engagement_line_item_based = (
            select(ExpenseSheet.id)
            .where(
                ExpenseSheet.status == TimesheetStatus.SUBMITTED,
                ExpenseSheet.employee_id.in_(
                    select(EngagementLineItem.employee_id)
                    .where(
                        EngagementLineItem.engagement_id.in_(select(approver_engagement_ids.c.engagement_id)),
                        EngagementLineItem.employee_id.isnot(None),
                    )
                ),
            )
        )
        sales_opp_based = (
            select(ExpenseSheet.id)
            .join(ExpenseLine, ExpenseSheet.id == ExpenseLine.expense_sheet_id)
            .join(Opportunity, ExpenseLine.opportunity_id == Opportunity.id)
            .join(DeliveryCenterApprover, Opportunity.delivery_center_id == DeliveryCenterApprover.delivery_center_id)
            .where(
                ExpenseSheet.status == TimesheetStatus.SUBMITTED,
                DeliveryCenterApprover.employee_id == approver_employee_id,
                ExpenseLine.opportunity_id.isnot(None),
            )
            .distinct()
        )
        employee_dc_based = (
            select(ExpenseSheet.id)
            .join(Employee, ExpenseSheet.employee_id == Employee.id)
            .where(
                ExpenseSheet.status == TimesheetStatus.SUBMITTED,
                Employee.delivery_center_id.in_(approver_dc_ids),
            )
        )
        union_ids = union_all(
            union_all(union_all(engagement_based, engagement_line_item_based), sales_opp_based),
            employee_dc_based,
        ).subquery()

        sunday_only = func.extract("dow", ExpenseSheet.week_start_date) == 0
        r = await self.session.execute(
            select(ExpenseSheet)
            .where(and_(ExpenseSheet.id.in_(select(union_ids.c.id)), sunday_only))
            .options(
                selectinload(ExpenseSheet.employee),
                selectinload(ExpenseSheet.lines).options(
                    selectinload(ExpenseLine.engagement),
                    selectinload(ExpenseLine.account),
                    selectinload(ExpenseLine.opportunity),
                ),
            )
            .order_by(ExpenseSheet.week_start_date.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(r.scalars().all())

    async def count_pending_approvals_for_approver(self, approver_employee_id: UUID) -> int:
        approver_engagement_ids, approver_dc_ids = self._approver_union_subqueries(approver_employee_id)
        sunday_only = func.extract("dow", ExpenseSheet.week_start_date) == 0

        engagement_based = (
            select(ExpenseSheet.id)
            .join(ExpenseLine, ExpenseSheet.id == ExpenseLine.expense_sheet_id)
            .where(
                ExpenseSheet.status == TimesheetStatus.SUBMITTED,
                sunday_only,
                ExpenseLine.engagement_id.in_(select(approver_engagement_ids.c.engagement_id)),
            )
            .distinct()
        )
        engagement_line_item_based = (
            select(ExpenseSheet.id)
            .where(
                ExpenseSheet.status == TimesheetStatus.SUBMITTED,
                sunday_only,
                ExpenseSheet.employee_id.in_(
                    select(EngagementLineItem.employee_id)
                    .where(
                        EngagementLineItem.engagement_id.in_(select(approver_engagement_ids.c.engagement_id)),
                        EngagementLineItem.employee_id.isnot(None),
                    )
                ),
            )
        )
        sales_opp_based = (
            select(ExpenseSheet.id)
            .join(ExpenseLine, ExpenseSheet.id == ExpenseLine.expense_sheet_id)
            .join(Opportunity, ExpenseLine.opportunity_id == Opportunity.id)
            .join(DeliveryCenterApprover, Opportunity.delivery_center_id == DeliveryCenterApprover.delivery_center_id)
            .where(
                ExpenseSheet.status == TimesheetStatus.SUBMITTED,
                sunday_only,
                DeliveryCenterApprover.employee_id == approver_employee_id,
                ExpenseLine.opportunity_id.isnot(None),
            )
            .distinct()
        )
        employee_dc_based = (
            select(ExpenseSheet.id)
            .join(Employee, ExpenseSheet.employee_id == Employee.id)
            .where(
                ExpenseSheet.status == TimesheetStatus.SUBMITTED,
                sunday_only,
                Employee.delivery_center_id.in_(approver_dc_ids),
            )
        )
        union_ids = union_all(
            union_all(union_all(engagement_based, engagement_line_item_based), sales_opp_based),
            employee_dc_based,
        ).subquery()
        from sqlalchemy import distinct as sql_distinct

        r = await self.session.execute(select(func.count(sql_distinct(union_ids.c.id))).select_from(union_ids))
        return int(r.scalar_one() or 0)

    async def list_approvable_expense_sheets_for_approver(
        self,
        approver_employee_id: UUID,
        status_filter: Optional[TimesheetStatus] = None,
        employee_id_filter: Optional[UUID] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[ExpenseSheet]:
        from sqlalchemy.orm import selectinload

        approver_engagement_ids, approver_dc_ids = self._approver_union_subqueries(approver_employee_id)
        status_val = status_filter.value if status_filter else None

        def _apply_filters(q):
            if status_val:
                q = q.where(ExpenseSheet.status == status_filter)
            if employee_id_filter:
                q = q.where(ExpenseSheet.employee_id == employee_id_filter)
            return q

        engagement_based = _apply_filters(
            select(ExpenseSheet.id)
            .join(ExpenseLine, ExpenseSheet.id == ExpenseLine.expense_sheet_id)
            .where(ExpenseLine.engagement_id.in_(select(approver_engagement_ids.c.engagement_id)))
            .distinct()
        )
        engagement_line_item_based = _apply_filters(
            select(ExpenseSheet.id).where(
                ExpenseSheet.employee_id.in_(
                    select(EngagementLineItem.employee_id)
                    .where(
                        EngagementLineItem.engagement_id.in_(select(approver_engagement_ids.c.engagement_id)),
                        EngagementLineItem.employee_id.isnot(None),
                    )
                )
            )
        )
        sales_opp_based = _apply_filters(
            select(ExpenseSheet.id)
            .join(ExpenseLine, ExpenseSheet.id == ExpenseLine.expense_sheet_id)
            .join(Opportunity, ExpenseLine.opportunity_id == Opportunity.id)
            .join(DeliveryCenterApprover, Opportunity.delivery_center_id == DeliveryCenterApprover.delivery_center_id)
            .where(
                DeliveryCenterApprover.employee_id == approver_employee_id,
                ExpenseLine.opportunity_id.isnot(None),
            )
            .distinct()
        )
        employee_dc_based = _apply_filters(
            select(ExpenseSheet.id)
            .join(Employee, ExpenseSheet.employee_id == Employee.id)
            .where(Employee.delivery_center_id.in_(approver_dc_ids))
        )
        union_ids = union_all(
            union_all(union_all(engagement_based, engagement_line_item_based), sales_opp_based),
            employee_dc_based,
        ).subquery()

        def _sunday_of(d: date) -> date:
            days_back = (d.weekday() + 1) % 7
            return d - timedelta(days=days_back)

        today = date.today()
        end_of_current_week = _sunday_of(today) + timedelta(days=6)
        exclude_future = or_(
            ~ExpenseSheet.status.in_([TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED]),
            ExpenseSheet.week_start_date <= end_of_current_week,
        )
        sunday_only = func.extract("dow", ExpenseSheet.week_start_date) == 0

        r = await self.session.execute(
            select(ExpenseSheet)
            .where(and_(ExpenseSheet.id.in_(select(union_ids.c.id)), exclude_future, sunday_only))
            .options(
                selectinload(ExpenseSheet.employee),
                selectinload(ExpenseSheet.lines).options(
                    selectinload(ExpenseLine.engagement),
                    selectinload(ExpenseLine.account),
                    selectinload(ExpenseLine.opportunity),
                ),
            )
            .order_by(ExpenseSheet.week_start_date.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(r.scalars().all())

    async def list_approvable_employee_ids_for_approver(self, approver_employee_id: UUID) -> List[UUID]:
        approver_engagement_ids, approver_dc_ids = self._approver_union_subqueries(approver_employee_id)
        sunday_only = func.extract("dow", ExpenseSheet.week_start_date) == 0
        engagement_based = (
            select(ExpenseSheet.employee_id)
            .join(ExpenseLine, ExpenseSheet.id == ExpenseLine.expense_sheet_id)
            .where(
                ExpenseLine.engagement_id.in_(select(approver_engagement_ids.c.engagement_id)),
                sunday_only,
            )
            .distinct()
        )
        employee_dc_based = (
            select(ExpenseSheet.employee_id)
            .join(Employee, ExpenseSheet.employee_id == Employee.id)
            .where(Employee.delivery_center_id.in_(approver_dc_ids), sunday_only)
        )
        union_ids = union_all(engagement_based, employee_dc_based).subquery()

        def _sunday_of(d: date) -> date:
            days_back = (d.weekday() + 1) % 7
            return d - timedelta(days=days_back)

        today = date.today()
        end_of_current_week = _sunday_of(today) + timedelta(days=6)
        exclude_future = or_(
            ~ExpenseSheet.status.in_([TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED]),
            ExpenseSheet.week_start_date <= end_of_current_week,
        )
        r = await self.session.execute(
            select(ExpenseSheet.employee_id)
            .where(ExpenseSheet.employee_id.in_(select(union_ids.c.employee_id)))
            .where(exclude_future)
            .where(sunday_only)
            .distinct()
        )
        return [row[0] for row in r.fetchall() if row[0]]

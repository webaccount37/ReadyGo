"""Expense sheet operations (parallel to timesheet service, without incomplete/holiday flows)."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import List, Optional, Tuple
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.db.repositories.expense_sheet_repository import ExpenseSheetRepository
from app.db.repositories.expense_line_repository import ExpenseLineRepository
from app.db.repositories.expense_status_history_repository import ExpenseStatusHistoryRepository
from app.db.repositories.opportunity_repository import OpportunityRepository
from app.db.repositories.engagement_repository import EngagementRepository
from app.models.expense import ExpenseSheet, ExpenseLine
from app.models.timesheet import TimesheetStatus, TimesheetEntryType
from app.models.employee import Employee
from app.utils.currency_converter import convert_currency
from app.schemas.expense import (
    ExpenseSheetResponse,
    ExpenseLineResponse,
    ExpenseLineUpsert,
    ExpenseReceiptResponse,
    ExpenseStatusHistoryResponse,
)

logger = logging.getLogger(__name__)

INITIAL_EMPTY_ROWS = 3


def _week_end(week_start: date) -> date:
    return week_start + timedelta(days=6)


class ExpenseService(BaseService):
    def __init__(self, session: AsyncSession):
        self.session = session
        self.sheet_repo = ExpenseSheetRepository(session)
        self.line_repo = ExpenseLineRepository(session)
        self.status_history_repo = ExpenseStatusHistoryRepository(session)
        self.opp_repo = OpportunityRepository(session)
        self.engagement_repo = EngagementRepository(session)

    async def _ensure_default_lines(self, sheet: ExpenseSheet) -> None:
        lines = await self.line_repo.list_by_sheet(sheet.id)
        if lines:
            return
        for i in range(INITIAL_EMPTY_ROWS):
            await self.line_repo.create(
                id=uuid4(),
                expense_sheet_id=sheet.id,
                row_order=i,
                entry_type=TimesheetEntryType.ENGAGEMENT,
                billable=True,
                reimburse=True,
                line_currency="USD",
                amount=Decimal("0"),
            )
        await self.session.flush()

    async def get_or_create_sheet(self, employee_id: UUID, week_start_date: date) -> ExpenseSheetResponse:
        sheet = await self.sheet_repo.get_by_employee_and_week(employee_id, week_start_date)
        if not sheet:
            emp = await self.session.get(Employee, employee_id)
            rc = (emp.default_currency or "USD").upper() if emp else "USD"
            sheet = await self.sheet_repo.create(
                id=uuid4(),
                employee_id=employee_id,
                week_start_date=week_start_date,
                status=TimesheetStatus.NOT_SUBMITTED,
                reimbursement_currency=rc,
            )
            await self._ensure_default_lines(sheet)
        else:
            await self._ensure_default_lines(sheet)
        await self.session.commit()
        sheet = await self.sheet_repo.get_by_employee_and_week(employee_id, week_start_date)
        lines = await self.line_repo.list_by_sheet(sheet.id) if sheet else []
        return await self._to_response(sheet, lines_override=lines)

    async def get_sheet(self, sheet_id: UUID, current_employee_id: UUID) -> Optional[ExpenseSheetResponse]:
        sheet = await self.sheet_repo.get(sheet_id)
        if not sheet:
            return None
        if sheet.employee_id != current_employee_id:
            from app.services.expense_approval_service import ExpenseApprovalService

            if not await ExpenseApprovalService(self.session)._can_approve_async(current_employee_id, sheet):
                return None
        lines = await self.line_repo.list_by_sheet(sheet_id)
        return await self._to_response(sheet, lines_override=lines)

    async def get_sheet_for_week(
        self,
        employee_id: UUID,
        week_start_date: date,
        current_employee_id: UUID,
    ) -> Optional[ExpenseSheetResponse]:
        if employee_id == current_employee_id:
            return await self.get_or_create_sheet(employee_id, week_start_date)

        sheet = await self.sheet_repo.get_by_employee_and_week(employee_id, week_start_date)
        if not sheet:
            emp = await self.session.get(Employee, employee_id)
            rc = (emp.default_currency or "USD").upper() if emp else "USD"
            sheet = await self.sheet_repo.create(
                id=uuid4(),
                employee_id=employee_id,
                week_start_date=week_start_date,
                status=TimesheetStatus.NOT_SUBMITTED,
                reimbursement_currency=rc,
            )
            await self._ensure_default_lines(sheet)
            await self.session.commit()
        sheet = await self.sheet_repo.get_by_employee_and_week(employee_id, week_start_date)
        from app.services.expense_approval_service import ExpenseApprovalService

        if sheet and not await ExpenseApprovalService(self.session)._can_approve_async(current_employee_id, sheet):
            return None
        lines = await self.line_repo.list_by_sheet(sheet.id) if sheet else []
        return await self._to_response(sheet, lines_override=lines) if sheet else None

    def _line_is_empty(self, account_id, amount: Optional[Decimal]) -> bool:
        if account_id:
            return False
        if amount is None:
            return True
        return Decimal(str(amount or 0)) == 0

    def _expense_line_has_values(self, line: ExpenseLine) -> bool:
        """True if the row is not blank (same idea as the expense UI partial-row detection)."""
        if line.account_id:
            return True
        if line.amount is not None and Decimal(str(line.amount)) != 0:
            return True
        if line.date_incurred:
            return True
        if line.expense_category_id:
            return True
        if (line.description or "").strip():
            return True
        if line.engagement_id or line.opportunity_id:
            return True
        if line.receipts and len(line.receipts) > 0:
            return True
        return False

    async def _validate_opportunity_week(self, opportunity_id: UUID, week_start: date) -> None:
        opp = await self.opp_repo.get(opportunity_id)
        if not opp:
            raise ValueError("Opportunity not found")
        we = _week_end(week_start)
        if opp.end_date < week_start or opp.start_date > we:
            raise ValueError("Selected project is not within opportunity dates for this expense week")

    async def save_entries(
        self,
        sheet_id: UUID,
        entries: List[ExpenseLineUpsert],
        current_employee_id: UUID,
        reimbursement_currency: Optional[str] = None,
    ) -> ExpenseSheetResponse:
        sheet = await self.sheet_repo.get(sheet_id)
        if not sheet:
            raise ValueError("Expense sheet not found")
        if sheet.status not in (TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED):
            raise ValueError("Cannot edit expense sheet in current status")
        if sheet.employee_id != current_employee_id:
            from app.services.expense_approval_service import ExpenseApprovalService

            if not await ExpenseApprovalService(self.session)._can_approve_async(current_employee_id, sheet):
                raise ValueError("Only the owner or an approver can edit this expense sheet")

        if reimbursement_currency:
            sheet.reimbursement_currency = reimbursement_currency.strip().upper()[:3]

        existing = await self.line_repo.list_by_sheet(sheet_id)
        ids_in = {e.id for e in entries if e.id}
        for ex in existing:
            if ex.id not in ids_in:
                await self.line_repo.delete(ex.id)
        await self.session.flush()

        for i, row in enumerate(entries):
            data = row.model_dump(exclude_unset=True)
            lid = data.pop("id", None)
            entry_type = data.get("entry_type")
            if entry_type is not None:
                ev = entry_type.value if hasattr(entry_type, "value") else str(entry_type)
                if ev == "HOLIDAY":
                    raise ValueError("Holiday is not a valid expense type")
                try:
                    data["entry_type"] = TimesheetEntryType(ev)
                except ValueError:
                    data["entry_type"] = TimesheetEntryType.ENGAGEMENT

            if lid:
                update_data = {k: v for k, v in data.items() if v is not None and k != "id"}
                update_data["row_order"] = i
                if "amount" in update_data and update_data["amount"] is not None:
                    update_data["amount"] = Decimal(str(update_data["amount"]))
                await self.line_repo.update(lid, **update_data)
                line = await self.line_repo.get(lid)
                if line and line.account_id and not self._line_is_empty(line.account_id, line.amount):
                    await self._validate_line(line, sheet.week_start_date)
                continue

            create_data = {k: v for k, v in data.items() if v is not None}
            create_data.setdefault("entry_type", TimesheetEntryType.ENGAGEMENT)
            create_data.setdefault("billable", True)
            create_data.setdefault("reimburse", True)
            create_data.setdefault("line_currency", "USD")
            create_data.setdefault("amount", Decimal("0"))
            et = create_data.get("entry_type")
            if hasattr(et, "value"):
                create_data["entry_type"] = TimesheetEntryType(et.value)
            elif isinstance(et, str):
                create_data["entry_type"] = TimesheetEntryType(et)
            if "amount" in create_data:
                create_data["amount"] = Decimal(str(create_data["amount"]))
            # Client may send row_order; server order is the enumerate index.
            create_data.pop("row_order", None)
            nl = await self.line_repo.create(
                id=uuid4(),
                expense_sheet_id=sheet_id,
                row_order=i,
                **create_data,
            )
            if nl.account_id and not self._line_is_empty(nl.account_id, nl.amount):
                await self._validate_line(nl, sheet.week_start_date)

        await self.status_history_repo.create(
            expense_sheet_id=sheet_id,
            from_status=sheet.status,
            to_status=sheet.status,
            changed_by_employee_id=current_employee_id,
            note="Entries saved",
        )
        await self.session.commit()
        sheet = await self.sheet_repo.get(sheet_id)
        lines = await self.line_repo.list_by_sheet(sheet_id)
        return await self._to_response(sheet, lines_override=lines)

    async def _validate_line(self, line: ExpenseLine, week_start: date) -> None:
        if line.entry_type == TimesheetEntryType.SALES:
            if not line.opportunity_id:
                raise ValueError("Sales expenses require a project (opportunity)")
            await self._validate_opportunity_week(line.opportunity_id, week_start)
            return
        if not line.engagement_id:
            raise ValueError("Engagement expenses require a project")
        eng = await self.engagement_repo.get(line.engagement_id)
        if not eng:
            raise ValueError("Engagement not found")
        await self._validate_opportunity_week(eng.opportunity_id, week_start)

    async def _validate_expense_line_for_submit(self, line: ExpenseLine, week_start: date) -> None:
        """All required fields for a non-blank expense line (matches product rules; phase is optional)."""
        if not line.account_id:
            raise ValueError("Each expense line with data must have an account")
        await self._validate_line(line, week_start)
        if not line.expense_category_id:
            raise ValueError("Each expense line must have a category")
        if not line.date_incurred:
            raise ValueError("Each expense line must have date incurred")
        if not line.line_currency or len(line.line_currency.strip()) < 3:
            raise ValueError("Each expense line must have a 3-letter currency")
        if not (line.description or "").strip():
            raise ValueError("Each expense line must have a description")
        if line.amount is None or Decimal(str(line.amount)) <= 0:
            raise ValueError("Each expense line must have a positive amount")

    async def submit_sheet(self, sheet_id: UUID, current_employee_id: UUID) -> ExpenseSheetResponse:
        sheet = await self.sheet_repo.get(sheet_id)
        if not sheet:
            raise ValueError("Expense sheet not found")
        if sheet.employee_id != current_employee_id:
            raise ValueError("Only the employee can submit their expense sheet")
        if sheet.status not in (TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED):
            raise ValueError("Expense sheet cannot be submitted in current status")

        lines = await self.line_repo.list_by_sheet(sheet_id)
        for line in lines:
            if not self._expense_line_has_values(line):
                continue
            await self._validate_expense_line_for_submit(line, sheet.week_start_date)

        old = sheet.status
        sheet.status = TimesheetStatus.SUBMITTED
        await self.status_history_repo.create(
            expense_sheet_id=sheet_id,
            from_status=old,
            to_status=TimesheetStatus.SUBMITTED,
            changed_by_employee_id=current_employee_id,
        )
        await self.session.commit()
        sheet = await self.sheet_repo.get(sheet_id)
        fresh = await self.line_repo.list_by_sheet(sheet_id)
        return await self._to_response(sheet, lines_override=fresh)

    async def get_week_statuses(
        self,
        employee_id: UUID,
        past_weeks: int = 52,
        future_weeks: int = 12,
    ) -> dict:
        today = date.today()
        days_since_sunday = (today.weekday() + 1) % 7
        this_sunday = today - timedelta(days=days_since_sunday)
        start_date = this_sunday - timedelta(weeks=past_weeks)
        end_date = this_sunday + timedelta(weeks=future_weeks)
        return await self.sheet_repo.get_week_statuses(employee_id, start_date, end_date)

    async def aggregate_expense_lines(
        self,
        sheet: ExpenseSheet,
        lines: List[ExpenseLine],
        *,
        build_line_responses: bool = True,
    ) -> Tuple[Decimal, Decimal, Decimal, str, List[ExpenseLineResponse]]:
        """Sum line amounts in reimbursement currency; optionally build full line DTOs."""
        rc = (sheet.reimbursement_currency or "USD").upper()
        total_reimb = Decimal("0")
        total_bill = Decimal("0")
        total_all = Decimal("0")
        lines_resp: List[ExpenseLineResponse] = []
        for line in sorted(lines, key=lambda x: x.row_order):
            amt = Decimal(str(line.amount or 0))
            lc = (line.line_currency or "USD").upper()
            conv = Decimal(str(await convert_currency(float(amt), lc, rc, self.session)))
            total_all += conv
            if line.reimburse:
                total_reimb += conv
            if line.billable:
                total_bill += conv
            if build_line_responses:
                lines_resp.append(
                    ExpenseLineResponse(
                        id=line.id,
                        expense_sheet_id=line.expense_sheet_id,
                        row_order=line.row_order,
                        entry_type=line.entry_type.value if line.entry_type else "ENGAGEMENT",
                        account_id=line.account_id,
                        engagement_id=line.engagement_id,
                        opportunity_id=line.opportunity_id,
                        engagement_line_item_id=line.engagement_line_item_id,
                        engagement_phase_id=line.engagement_phase_id,
                        billable=line.billable,
                        reimburse=line.reimburse,
                        date_incurred=line.date_incurred.isoformat() if line.date_incurred else None,
                        expense_category_id=line.expense_category_id,
                        category_name=line.category.name if line.category else None,
                        description=line.description,
                        line_currency=lc,
                        amount=amt,
                        account_name=line.account.company_name if line.account else None,
                        engagement_name=line.engagement.name if line.engagement else None,
                        opportunity_name=line.opportunity.name if line.opportunity else None,
                        phase_name=line.engagement_phase.name if line.engagement_phase else None,
                        receipts=[
                            ExpenseReceiptResponse(
                                id=r.id,
                                expense_line_id=r.expense_line_id,
                                original_filename=r.original_filename,
                                content_type=r.content_type,
                                size_bytes=r.size_bytes or 0,
                                created_at=r.created_at.isoformat() if r.created_at else "",
                            )
                            for r in (line.receipts or [])
                        ],
                    )
                )
        return total_all, total_bill, total_reimb, rc, lines_resp

    async def _to_response(
        self,
        sheet: Optional[ExpenseSheet],
        lines_override: Optional[List[ExpenseLine]] = None,
    ) -> ExpenseSheetResponse:
        if not sheet:
            raise ValueError("Expense sheet not found")
        lines = lines_override if lines_override is not None else await self.line_repo.list_by_sheet(sheet.id)
        total_all, total_bill, total_reimb, rc, lines_resp = await self.aggregate_expense_lines(
            sheet, lines, build_line_responses=True
        )

        rejection_note = None
        hist_resp: List[ExpenseStatusHistoryResponse] = []
        sh = sheet.status_history or []
        for h in reversed(sorted(sh, key=lambda x: x.changed_at or "")):
            if h.from_status == TimesheetStatus.SUBMITTED and h.to_status == TimesheetStatus.REOPENED and h.note:
                rejection_note = h.note
                break
        for h in sorted(sh, key=lambda x: x.changed_at or "", reverse=True):
            cb = None
            if h.changed_by_employee:
                cb = f"{h.changed_by_employee.first_name} {h.changed_by_employee.last_name}"
            hist_resp.append(
                ExpenseStatusHistoryResponse(
                    id=h.id,
                    expense_sheet_id=h.expense_sheet_id,
                    from_status=h.from_status.value if h.from_status else None,
                    to_status=h.to_status.value if h.to_status else "",
                    changed_by_employee_id=h.changed_by_employee_id,
                    changed_by_name=cb,
                    changed_at=h.changed_at.isoformat() if h.changed_at else "",
                    note=h.note,
                )
            )

        emp_name = None
        if sheet.employee:
            emp_name = f"{sheet.employee.first_name} {sheet.employee.last_name}"
        return ExpenseSheetResponse(
            id=sheet.id,
            employee_id=sheet.employee_id,
            week_start_date=sheet.week_start_date.isoformat(),
            status=sheet.status.value,
            reimbursement_currency=rc,
            created_at=sheet.created_at.isoformat() if sheet.created_at else "",
            updated_at=sheet.updated_at.isoformat() if sheet.updated_at else "",
            employee_name=emp_name,
            total_reimbursement=total_reimb,
            total_billable=total_bill,
            total_amount=total_all,
            lines=lines_resp,
            rejection_note=rejection_note,
            status_history=hist_resp,
        )

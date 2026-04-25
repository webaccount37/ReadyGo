"""Orchestrate time export (Excel or Replicon Analytics CSV) → engagement prep → per-week kill/fill → submit/approve."""

from __future__ import annotations

import json
import logging
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories.engagement_line_item_repository import EngagementLineItemRepository
from app.db.repositories.engagement_weekly_hours_repository import EngagementWeeklyHoursRepository
from app.db.repositories.timesheet_dismissed_row_repository import TimesheetDismissedRowRepository
from app.db.repositories.timesheet_entry_repository import TimesheetEntryRepository
from app.db.repositories.timesheet_repository import TimesheetRepository
from app.integrations.replicon.analytics_client import RepliconAnalyticsClient, parse_csv_rows
from app.integrations.replicon.auth_client import get_access_token
from app.integrations.replicon.column_mapping import dict_rows_to_raw
from app.integrations.replicon.excel_timesheet_export import (
    load_time_export_xlsx_detailed,
    write_row_status_workbook,
)
from app.integrations.replicon.mapping_workbook import load_mapping_workbook
from app.integrations.replicon.models import (
    AggregatedEntryKey,
    AggregatedHours,
    CortexMappedRow,
    RawTimeRow,
)
from app.integrations.replicon.normalize import (
    aggregate_by_week_and_entry,
    build_login_to_employee_id,
    map_raw_row,
    merge_line_item_date_bounds_for_replicon_import,
    min_max_dates_per_employee_engagement,
    multi_contract_date_miss,
    should_exclude_raw,
    week_end_saturday,
    week_start_sunday,
)
from app.integrations.replicon.settings import RepliconImportSettings
from app.models.employee import Employee
from app.models.engagement import EngagementPhase
from app.models.role import Role
from app.models.timesheet import TimesheetEntry, TimesheetEntryType, TimesheetStatus
from app.schemas.engagement import EngagementLineItemCreate, EngagementLineItemUpdate
from app.services.engagement_service import EngagementService
from app.services.internal_holiday_timesheet_links import resolve_holiday_row_targets
from app.services.timesheet_approval_service import TimesheetApprovalService
from app.services.timesheet_service import TimesheetService

logger = logging.getLogger(__name__)

IMPORT_SOURCE_NOTE = "replicon_import"


@dataclass
class ImportSummary:
    raw_rows: int
    mapped_rows: int
    weeks_processed: int
    weeks_skipped_invoiced: int
    engagement_lines_created: int
    rows_skipped_no_line_item: int
    errors: list[str]
    row_status_output_path: Path | None = None


_MAPPING_LOG_CAP = 30


class RepliconTimesheetImportService:
    def __init__(self, session: AsyncSession, settings: RepliconImportSettings):
        self.session = session
        self.settings = settings
        self.timesheet_repo = TimesheetRepository(session)
        self.entry_repo = TimesheetEntryRepository(session)
        self.dismissed_repo = TimesheetDismissedRowRepository(session)
        self.line_item_repo = EngagementLineItemRepository(session)
        self.weekly_hours_repo = EngagementWeeklyHoursRepository(session)
        self.timesheet_svc = TimesheetService(session)
        self.approval_svc = TimesheetApprovalService(session)
        self.engagement_svc = EngagementService(session)

    async def _consultant_role_id(self) -> UUID:
        r = await self.session.execute(select(Role).where(func.lower(Role.role_name) == "consultant"))
        role = r.scalar_one_or_none()
        if not role:
            raise RuntimeError('No Role with role_name "Consultant" found in database')
        return role.id

    async def _validate_phase(self, engagement_id: UUID, phase_id: UUID | None) -> UUID | None:
        if not phase_id:
            return None
        r = await self.session.execute(
            select(EngagementPhase.id).where(
                EngagementPhase.id == phase_id,
                EngagementPhase.engagement_id == engagement_id,
            )
        )
        return r.scalar_one_or_none()

    async def _append_engagement_created_log(self, line: dict[str, Any]) -> None:
        path = self.settings.engagement_created_log_path
        path.parent.mkdir(parents=True, exist_ok=True)
        line["source"] = IMPORT_SOURCE_NOTE
        line["logged_at"] = datetime.utcnow().isoformat() + "Z"
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(line, default=str) + "\n")

    async def _load_employees(self) -> list[tuple[UUID, str]]:
        r = await self.session.execute(select(Employee.id, Employee.email))
        return [(row[0], row[1] or "") for row in r.fetchall()]

    def _filter_since_2024(
        self,
        rows: list[RawTimeRow],
        row_status: dict[int, tuple[str, str]],
    ) -> list[RawTimeRow]:
        cutoff = date(2024, 1, 1)
        out: list[RawTimeRow] = []
        for r in rows:
            if r.entry_date < cutoff:
                if r.source_excel_row is not None:
                    row_status[r.source_excel_row] = (
                        "Skipped",
                        "Entry date before 2024-01-01 (not imported)",
                    )
                continue
            out.append(r)
        return out

    async def load_csv_text(
        self,
        *,
        from_cache_path: Path | None,
        cache_extract: bool,
    ) -> str:
        if from_cache_path:
            return from_cache_path.read_text(encoding="utf-8", errors="replace")
        client = RepliconAnalyticsClient(self.settings)
        csv_text = await client.fetch_timesheet_csv()
        if cache_extract:
            self.settings.cache_dir.mkdir(parents=True, exist_ok=True)
            ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            p = self.settings.cache_dir / f"extract_{ts}.csv"
            p.write_text(csv_text, encoding="utf-8")
            logger.info("Wrote extract cache to %s", p)
        return csv_text

    async def run(
        self,
        *,
        dry_run: bool = False,
        from_cache_path: Path | None = None,
        timesheet_export_path: Path | None = None,
        allow_zero_rows_after_filter: bool = False,
        cache_extract: bool = True,
        row_status_output: Path | None = None,
    ) -> ImportSummary:
        errors: list[str] = []
        excel_source_path: Path | None = None
        row_status: dict[int, tuple[str, str]] = {}

        if from_cache_path:
            csv_text = await self.load_csv_text(from_cache_path=from_cache_path, cache_extract=False)
            headers, dict_rows = parse_csv_rows(csv_text)
            try:
                raw_full = dict_rows_to_raw(headers, dict_rows)
            except ValueError as e:
                raise RuntimeError(f"CSV parse failed: {e}") from e
        elif timesheet_export_path is not None:
            if not timesheet_export_path.is_file():
                raise FileNotFoundError(f"Timesheet export not found: {timesheet_export_path}")
            logger.info("Loading timesheet rows from Excel export: %s", timesheet_export_path)
            det = load_time_export_xlsx_detailed(timesheet_export_path)
            raw_full = det.rows
            excel_source_path = timesheet_export_path
            for rn, msg in det.parse_notes_by_row.items():
                row_status[rn] = ("Skipped", msg)
        elif self.settings.uses_excel_timesheet_export():
            assert self.settings.timesheet_export_xlsx is not None
            logger.info(
                "Loading timesheet rows from Excel export: %s", self.settings.timesheet_export_xlsx
            )
            det = load_time_export_xlsx_detailed(self.settings.timesheet_export_xlsx)
            raw_full = det.rows
            excel_source_path = self.settings.timesheet_export_xlsx
            for rn, msg in det.parse_notes_by_row.items():
                row_status[rn] = ("Skipped", msg)
        else:
            csv_text = await self.load_csv_text(from_cache_path=None, cache_extract=cache_extract)
            headers, dict_rows = parse_csv_rows(csv_text)
            try:
                raw_full = dict_rows_to_raw(headers, dict_rows)
            except ValueError as e:
                raise RuntimeError(f"CSV parse failed: {e}") from e

        raw = self._filter_since_2024(raw_full, row_status)
        if not raw and not allow_zero_rows_after_filter and not dry_run:
            raise RuntimeError(
                "Extract produced zero time rows after 2024-01-01 filter — refusing DB changes. "
                "Use --allow-zero-rows-after-filter only if intentional."
            )

        mapping = await load_mapping_workbook(self.session, self.settings.mapping_xlsx_path)
        employees = await self._load_employees()
        login_to_emp = build_login_to_employee_id(employees)

        mapped_list: list[CortexMappedRow] = []
        unmapped_count = 0
        incomplete_engagement_count = 0
        multi_contract_window_miss_count = 0
        unknown_login_count = 0
        unmapped_samples: list[str] = []
        incomplete_eng_samples: list[str] = []
        multi_contract_window_samples: list[str] = []
        unknown_login_samples: list[str] = []

        for row in raw:
            sr = row.source_excel_row
            if should_exclude_raw(row):
                if sr is not None:
                    row_status[sr] = ("Skipped", "Excluded client/project per import rules")
                continue
            key = (row.project_name.strip().lower(), row.client_name.strip().lower())
            rule = mapping.get(key)
            emp_id = login_to_emp.get(row.login.strip().lower())
            m = map_raw_row(row, mapping, employee_id=emp_id)
            if not m:
                if rule is None:
                    unmapped_count += 1
                    if len(unmapped_samples) < _MAPPING_LOG_CAP:
                        unmapped_samples.append(f"{row.project_name!r} / {row.client_name!r}")
                    if sr is not None:
                        row_status[sr] = (
                            "Failed",
                            "No mapping workbook entry for this Replicon project and client",
                        )
                elif multi_contract_date_miss(rule, row.entry_date, emp_id):
                    multi_contract_window_miss_count += 1
                    if len(multi_contract_window_samples) < _MAPPING_LOG_CAP:
                        multi_contract_window_samples.append(f"{row.project_name!r} / {row.client_name!r}")
                    if sr is not None:
                        row_status[sr] = (
                            "Failed",
                            "Multi-contract mapping: no engagement assignment window contains this entry date",
                        )
                elif (
                    len(rule.candidates) == 1
                    and rule.candidates[0].record.cortex_type == "ENGAGEMENT"
                    and not rule.candidates[0].record.engagement_id
                ):
                    incomplete_engagement_count += 1
                    if len(incomplete_eng_samples) < _MAPPING_LOG_CAP:
                        incomplete_eng_samples.append(f"{row.project_name!r} / {row.client_name!r}")
                    if sr is not None:
                        row_status[sr] = (
                            "Failed",
                            "Mapping is ENGAGEMENT but engagement could not be resolved in the database",
                        )
                continue
            if not emp_id:
                unknown_login_count += 1
                if len(unknown_login_samples) < _MAPPING_LOG_CAP:
                    unknown_login_samples.append(f"{row.login!r}")
                if sr is not None:
                    row_status[sr] = (
                        "Failed",
                        "User email/login not matched to any employee record",
                    )
                continue
            mapped_list.append(m)

        if unmapped_count:
            logger.warning(
                "Replicon import: %d raw row(s) had no mapping workbook entry (sample project/client): %s",
                unmapped_count,
                "; ".join(unmapped_samples),
            )
        if incomplete_engagement_count:
            logger.error(
                "Replicon import: %d raw row(s) mapped to ENGAGEMENT but engagement unresolved "
                "(sample project/client): %s",
                incomplete_engagement_count,
                "; ".join(incomplete_eng_samples),
            )
        if multi_contract_window_miss_count:
            logger.warning(
                "Replicon import: %d raw row(s) on multi-contract mapping had no assignment window "
                "containing the entry date (sample project/client): %s",
                multi_contract_window_miss_count,
                "; ".join(multi_contract_window_samples),
            )
        if unknown_login_count:
            logger.warning(
                "Replicon import: %d mapped row(s) skipped — login not found on any employee email "
                "(sample login): %s",
                unknown_login_count,
                "; ".join(unknown_login_samples),
            )

        if dry_run:
            for m in mapped_list:
                if m.source_excel_row is not None:
                    row_status[m.source_excel_row] = ("OK", "Dry-run — no database changes")
            written: Path | None = None
            if excel_source_path and row_status:
                explicit = row_status_output or self.settings.row_status_output_xlsx
                written = write_row_status_workbook(excel_source_path, row_status, explicit)
                if written:
                    logger.info("Wrote per-row import status workbook to %s", written)
            return ImportSummary(
                raw_rows=len(raw),
                mapped_rows=len(mapped_list),
                weeks_processed=0,
                weeks_skipped_invoiced=0,
                engagement_lines_created=0,
                rows_skipped_no_line_item=0,
                errors=[],
                row_status_output_path=written,
            )

        if self.settings.approver_employee_id is None:
            raise ValueError(
                "REPLICON_IMPORT_APPROVER_EMPLOYEE_ID is required for a full import "
                "(UUID of a delivery-center or engagement timesheet approver). "
                "Omit it only when using --dry-run."
            )

        if not mapped_list and not allow_zero_rows_after_filter:
            raise RuntimeError(
                "Zero rows after mapping to Cortex — refusing DB changes. "
                "Fix mapping workbook or CSV; or pass --allow-zero-rows-after-filter."
            )

        consultant_role_id = await self._consultant_role_id()

        # --- Global: auto-create missing resource plan rows ---
        mm = min_max_dates_per_employee_engagement(mapped_list, login_to_emp)
        created_lines = 0
        for (emp_id, eng_id), (min_d, max_d) in mm.items():
            rp_start = week_start_sunday(min_d)
            rp_end = week_end_saturday(max_d)
            lines = await self.line_item_repo.list_by_engagement(eng_id)
            mine = [li for li in lines if li.employee_id == emp_id]
            if mine:
                continue
            emp = await self.session.get(Employee, emp_id)
            if not emp or not emp.delivery_center_id:
                errors.append(f"Skip auto line: employee {emp_id} missing delivery_center_id")
                continue
            eng = await self.engagement_svc.engagement_repo.get(eng_id)
            if not eng:
                continue
            opp = await self.engagement_svc.opportunity_repo.get(eng.opportunity_id)
            if not opp or not opp.delivery_center_id:
                errors.append(f"Skip auto line: opportunity missing for engagement {eng_id}")
                continue
            billable_any = any(
                r.billable
                for r in mapped_list
                if r.cortex_type == "ENGAGEMENT"
                and r.engagement_id == eng_id
                and login_to_emp.get(r.login.strip().lower()) == emp_id
            )
            try:
                li = await self.engagement_svc.create_line_item(
                    eng_id,
                    EngagementLineItemCreate(
                        role_id=consultant_role_id,
                        delivery_center_id=opp.delivery_center_id,
                        payable_center_id=emp.delivery_center_id,
                        employee_id=emp_id,
                        rate=Decimal("0"),
                        cost=Decimal("0"),
                        currency=(opp.default_currency or "USD").strip() or "USD",
                        start_date=rp_start,
                        end_date=rp_end,
                        billable=billable_any,
                    ),
                )
                created_lines += 1
                await self._append_engagement_created_log(
                    {
                        "engagement_id": str(eng_id),
                        "line_item_id": str(li.id),
                        "employee_id": str(emp_id),
                        "opportunity_id": str(eng.opportunity_id),
                        "start_date": str(rp_start),
                        "end_date": str(rp_end),
                    }
                )
            except Exception as e:
                errors.append(f"create_line_item engagement={eng_id} emp={emp_id}: {e}")
                logger.exception("create_line_item failed")

        # --- Global: widen line item dates ---
        for (emp_id, eng_id), (min_d, max_d) in mm.items():
            lines = await self.line_item_repo.list_by_engagement(eng_id)
            mine = [li for li in lines if li.employee_id == emp_id]
            if not mine:
                continue
            li = mine[0]
            cur_s = EngagementService._as_line_date(li.start_date)
            cur_e = EngagementService._as_line_date(li.end_date)
            approved_weeks = await self.engagement_svc.get_approved_week_starts_for_line_item(li.id)
            new_s, new_e = merge_line_item_date_bounds_for_replicon_import(
                cur_s, cur_e, min_d, max_d, approved_weeks
            )
            if new_s == cur_s and new_e == cur_e:
                continue
            try:
                await self.engagement_svc.update_line_item(
                    eng_id,
                    li.id,
                    EngagementLineItemUpdate(start_date=new_s, end_date=new_e),
                )
            except Exception as e:
                errors.append(f"widen dates line={li.id}: {e}")

        # --- Aggregate ---
        buckets = aggregate_by_week_and_entry(mapped_list, login_to_emp)
        weeks_set: set[tuple[UUID, date]] = set()
        for k in buckets:
            weeks_set.add((k.employee_id, k.week_start))

        processed = 0
        skipped_inv = 0
        rows_skipped_no_line_item = 0
        failed_week_messages: dict[tuple[UUID, date], str] = {}
        invoiced_weeks: set[tuple[UUID, date]] = set()
        for emp_id, week_start in sorted(weeks_set, key=lambda x: (str(x[0]), x[1].isoformat())):
            try:
                no_li: list[int] = [0]
                sk = await self._process_one_week(
                    emp_id,
                    week_start,
                    buckets,
                    login_to_emp,
                    no_line_item_skips=no_li,
                )
                rows_skipped_no_line_item += no_li[0]
                if sk == "invoiced":
                    skipped_inv += 1
                    invoiced_weeks.add((emp_id, week_start))
                else:
                    processed += 1
            except Exception as e:
                msg = str(e)
                errors.append(f"Week emp={emp_id} week={week_start}: {msg}")
                failed_week_messages[(emp_id, week_start)] = msg[:4000]
                logger.exception("week failed")

        for m in mapped_list:
            er = m.source_excel_row
            if er is None:
                continue
            emp = login_to_emp.get(m.login.strip().lower())
            if not emp:
                continue
            ws = week_start_sunday(m.entry_date)
            wk = (emp, ws)
            if wk in failed_week_messages:
                row_status[er] = ("Failed", failed_week_messages[wk])
            elif wk in invoiced_weeks:
                row_status[er] = (
                    "Skipped",
                    "Timesheet for this week is INVOICED — week not modified",
                )
            else:
                row_status[er] = ("OK", "Imported (kill/fill, submit, approve)")

        state = {
            "last_run_utc": datetime.utcnow().isoformat() + "Z",
            "weeks_processed": processed,
            "weeks_skipped_invoiced": skipped_inv,
            "mapped_rows": len(mapped_list),
        }
        self.settings.state_json_path.parent.mkdir(parents=True, exist_ok=True)
        self.settings.state_json_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

        if rows_skipped_no_line_item:
            logger.info(
                "Replicon import: skipped %d engagement hour row(s) (no resource-plan line overlapping "
                "that employee/week/engagement); see debug logs for detail",
                rows_skipped_no_line_item,
            )

        written_full: Path | None = None
        if excel_source_path and row_status:
            explicit = row_status_output or self.settings.row_status_output_xlsx
            written_full = write_row_status_workbook(excel_source_path, row_status, explicit)
            if written_full:
                logger.info("Wrote per-row import status workbook to %s", written_full)

        return ImportSummary(
            raw_rows=len(raw),
            mapped_rows=len(mapped_list),
            weeks_processed=processed,
            weeks_skipped_invoiced=skipped_inv,
            engagement_lines_created=created_lines,
            rows_skipped_no_line_item=rows_skipped_no_line_item,
            errors=errors,
            row_status_output_path=written_full,
        )

    async def _resolve_line_item_for_week(
        self, employee_id: UUID, week_start: date, engagement_id: UUID
    ) -> UUID | None:
        lis = await self.line_item_repo.list_by_employee_and_week(employee_id, week_start)
        for li in lis:
            if li.engagement_id == engagement_id:
                return li.id
        return None

    async def _process_one_week(
        self,
        employee_id: UUID,
        week_start: date,
        buckets: dict[AggregatedEntryKey, AggregatedHours],
        login_to_emp: dict[str, UUID],
        *,
        no_line_item_skips: list[int] | None = None,
    ) -> str:
        """Return 'ok' or 'invoiced'."""
        await self.timesheet_svc.get_or_create_timesheet(employee_id, week_start)
        ts = await self.timesheet_repo.get_by_employee_and_week(employee_id, week_start)
        if not ts:
            raise RuntimeError("timesheet missing after get_or_create")
        if ts.status == TimesheetStatus.INVOICED:
            logger.warning("Skip INVOICED timesheet %s", ts.id)
            return "invoiced"

        approver = self.settings.approver_employee_id
        assert approver is not None
        if ts.status in (TimesheetStatus.SUBMITTED, TimesheetStatus.APPROVED):
            is_approver = ts.status == TimesheetStatus.APPROVED
            await self.approval_svc.reopen_timesheet(ts.id, approver, is_approver=is_approver)

        await self.dismissed_repo.clear_for_timesheet(ts.id)
        for entry in await self.entry_repo.list_by_timesheet(ts.id):
            await self.entry_repo.delete(entry.id)
        await self.session.flush()

        await self.timesheet_svc._add_holiday_entries(ts)

        week_keys = [k for k in buckets if k.employee_id == employee_id and k.week_start == week_start]
        week_keys.sort(key=lambda k: (k.entry_type, str(k.engagement_id), str(k.opportunity_id)))

        entries: list[TimesheetEntry] = []
        row_order = 0
        plan_hours_by_line: dict[UUID, Decimal] = defaultdict(lambda: Decimal("0"))
        for k in week_keys:
            agg = buckets[k]
            h = agg.hours_by_dow
            if sum(h) <= 0:
                continue

            if k.entry_type == "ENGAGEMENT":
                if not k.engagement_id:
                    continue
                li_id = await self._resolve_line_item_for_week(
                    employee_id, week_start, k.engagement_id
                )
                if not li_id:
                    if no_line_item_skips is not None:
                        no_line_item_skips[0] += 1
                    logger.debug(
                        "No resource-plan line overlapping week for emp=%s eng=%s week=%s",
                        employee_id,
                        k.engagement_id,
                        week_start,
                    )
                    continue
                phase_id = await self._validate_phase(k.engagement_id, k.engagement_phase_id)
                plan_hours_by_line[li_id] += sum(h)
                entries.append(
                    TimesheetEntry(
                        id=uuid.uuid4(),
                        timesheet_id=ts.id,
                        row_order=row_order,
                        entry_type=TimesheetEntryType.ENGAGEMENT,
                        account_id=k.account_id,
                        engagement_id=k.engagement_id,
                        opportunity_id=k.opportunity_id,
                        engagement_line_item_id=li_id,
                        engagement_phase_id=phase_id,
                        billable=agg.billable_any,
                        sun_hours=h[0],
                        mon_hours=h[1],
                        tue_hours=h[2],
                        wed_hours=h[3],
                        thu_hours=h[4],
                        fri_hours=h[5],
                        sat_hours=h[6],
                    )
                )
                row_order += 1

            elif k.entry_type == "SALES":
                entries.append(
                    TimesheetEntry(
                        id=uuid.uuid4(),
                        timesheet_id=ts.id,
                        row_order=row_order,
                        entry_type=TimesheetEntryType.SALES,
                        account_id=k.account_id,
                        engagement_id=None,
                        opportunity_id=k.opportunity_id,
                        engagement_line_item_id=None,
                        engagement_phase_id=None,
                        billable=False,
                        sun_hours=h[0],
                        mon_hours=h[1],
                        tue_hours=h[2],
                        wed_hours=h[3],
                        thu_hours=h[4],
                        fri_hours=h[5],
                        sat_hours=h[6],
                    )
                )
                row_order += 1

            elif k.entry_type == "HOLIDAY":
                emp = await self.session.get(Employee, employee_id)
                dc = emp.delivery_center_id if emp else None
                link = await resolve_holiday_row_targets(self.session, dc, week_start)
                entries.append(
                    TimesheetEntry(
                        id=uuid.uuid4(),
                        timesheet_id=ts.id,
                        row_order=row_order,
                        entry_type=TimesheetEntryType.HOLIDAY,
                        account_id=link["account_id"],
                        account_display_name=link.get("account_display_name"),
                        engagement_display_name=link.get("engagement_display_name"),
                        engagement_id=link.get("engagement_id"),
                        opportunity_id=link.get("opportunity_id"),
                        engagement_line_item_id=None,
                        engagement_phase_id=link.get("engagement_phase_id"),
                        billable=False,
                        is_holiday_row=False,
                        sun_hours=h[0],
                        mon_hours=h[1],
                        tue_hours=h[2],
                        wed_hours=h[3],
                        thu_hours=h[4],
                        fri_hours=h[5],
                        sat_hours=h[6],
                    )
                )
                row_order += 1

        for li_id, hrs in plan_hours_by_line.items():
            await self.weekly_hours_repo.upsert(li_id, week_start, float(hrs))

        await self.entry_repo.add_all_with_flush(entries)
        ts2 = await self.timesheet_repo.get(ts.id)
        if ts2:
            await self.timesheet_svc._sync_engagement_timesheet_rows_from_resource_plan(ts2)
        await self.session.flush()

        await self.timesheet_svc.submit_timesheet(
            ts.id,
            current_employee_id=employee_id,
            force=True,
            allow_short_week=True,
        )
        await self.approval_svc.approve_timesheet(ts.id, approver_employee_id=approver)
        return "ok"


async def prefetch_token_check(settings: RepliconImportSettings) -> None:
    """Validate Replicon API credentials before any DB work (skipped for Excel export mode)."""
    if settings.uses_excel_timesheet_export():
        return
    if not settings.access_token:
        await get_access_token(settings)

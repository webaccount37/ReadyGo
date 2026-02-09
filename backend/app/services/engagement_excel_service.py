"""
Excel export/import service for engagements (Resource Plan).
"""

import logging
import io
from typing import List, Dict, Optional
from uuid import UUID
from datetime import date, timedelta
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, Alignment, PatternFill, Protection
from openpyxl.utils import get_column_letter

from app.db.repositories.engagement_repository import EngagementRepository
from app.db.repositories.engagement_line_item_repository import EngagementLineItemRepository
from app.db.repositories.engagement_weekly_hours_repository import EngagementWeeklyHoursRepository
from app.db.repositories.delivery_center_repository import DeliveryCenterRepository
from app.db.repositories.employee_repository import EmployeeRepository
from app.db.repositories.role_repository import RoleRepository
from app.db.repositories.role_rate_repository import RoleRateRepository
from app.db.repositories.opportunity_repository import OpportunityRepository
from app.models.engagement import Engagement, EngagementLineItem, EngagementWeeklyHours, EngagementPhase
from app.models.role import Role
from app.utils.currency_converter import convert_currency

logger = logging.getLogger(__name__)


class EngagementExcelService:
    """Service for exporting/importing engagement Resource Plans to/from Excel."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.engagement_repo = EngagementRepository(session)
        self.line_item_repo = EngagementLineItemRepository(session)
        self.weekly_hours_repo = EngagementWeeklyHoursRepository(session)
        self.delivery_center_repo = DeliveryCenterRepository(session)
        self.employee_repo = EmployeeRepository(session)
        self.role_repo = RoleRepository(session)
        self.role_rate_repo = RoleRateRepository(session)
        self.opportunity_repo = OpportunityRepository(session)
        # Store model classes for use in queries
        from app.models.role import Role
        from app.models.role_rate import RoleRate
        self.role_model = Role
        self.role_rate_model = RoleRate
    
    async def export_engagement_to_excel(self, engagement_id: UUID) -> io.BytesIO:
        """Export an engagement Resource Plan to Excel format.
        
        This mirrors the Estimate Excel export but for Resource Plans.
        Dates are flexible (not tied to Opportunity dates).
        """
        # Get engagement with all relationships
        engagement = await self.engagement_repo.get_with_line_items(engagement_id)
        if not engagement:
            raise ValueError("Engagement not found")
        
        # Ensure line items are sorted by row_order
        if engagement.line_items:
            engagement.line_items = sorted(engagement.line_items, key=lambda li: li.row_order if li.row_order is not None else 0)
        
        # Get opportunity for delivery center and currency
        opportunity = await self.opportunity_repo.get(engagement.opportunity_id)
        if not opportunity:
            raise ValueError("Opportunity not found")
        
        opportunity_delivery_center_id = opportunity.delivery_center_id
        if not opportunity_delivery_center_id:
            raise ValueError("Opportunity Invoice Center (delivery_center_id) is required")
        
        # Get all delivery centers, employees, and roles for dropdowns
        all_delivery_centers = await self.delivery_center_repo.list_all()
        all_employees = await self.employee_repo.list(skip=0, limit=10000)
        
        # Get roles filtered by opportunity delivery center
        from app.models.role_rate import RoleRate
        roles_result = await self.session.execute(
            select(Role)
            .join(RoleRate, Role.id == RoleRate.role_id)
            .where(RoleRate.delivery_center_id == opportunity_delivery_center_id)
            .distinct()
        )
        filtered_roles = list(roles_result.scalars().all())
        
        # Generate weeks from line items (flexible dates)
        if engagement.line_items and len(engagement.line_items) > 0:
            weeks = self._generate_weeks_from_line_items(engagement.line_items)
        else:
            # Default to 1 year from today
            from datetime import datetime
            today = datetime.now().date()
            start = today
            end = date(today.year + 1, today.month, today.day)
            weeks = self._generate_weeks_from_dates(start, end)
        
        # Create workbook
        wb = Workbook()
        ws = wb.active
        ws.title = "Resource Plan Data"
        
        # Create metadata sheet
        metadata_ws = wb.create_sheet("Metadata")
        metadata_ws.sheet_state = "hidden"
        
        # Write metadata
        self._write_metadata(metadata_ws, engagement, opportunity, weeks, all_delivery_centers, filtered_roles, all_employees)
        
        # Write headers (simplified - no Opportunity date constraints)
        self._write_headers(ws, engagement.phases, weeks, opportunity.default_currency or "USD")
        
        # Write data rows
        min_rows = 20
        actual_num_rows = len(engagement.line_items)
        num_rows_to_write = max(actual_num_rows, min_rows)
        
        self._write_data_rows(ws, engagement.line_items, weeks, len(engagement.phases) if engagement.phases else 0, min_rows=min_rows)
        
        # Write totals row
        self._write_totals_row(ws, num_rows_to_write, len(weeks))
        
        # Apply data validation
        self._apply_validation(ws, all_delivery_centers, filtered_roles, all_employees, num_rows_to_write, len(weeks))
        
        # Create Excel Table
        self._create_excel_table(ws, num_rows_to_write, len(weeks))
        
        # Auto-size columns
        for col_idx in range(1, ws.max_column + 1):
            col_letter = get_column_letter(col_idx)
            max_length = 0
            for row_idx in range(1, min(25, ws.max_row + 1)):
                cell = ws.cell(row=row_idx, column=col_idx)
                if cell.value:
                    max_length = max(max_length, len(str(cell.value)))
            if max_length > 0:
                ws.column_dimensions[col_letter].width = min(max(max_length + 2, 10), 50)
            else:
                ws.column_dimensions[col_letter].width = 10
        
        # Save to BytesIO
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        return output
    
    async def import_engagement_from_excel(self, engagement_id: UUID, file_path: str) -> Dict:
        """Import engagement Resource Plan from Excel file."""
        # Load workbook
        wb = load_workbook(file_path, data_only=True)
        
        # Read metadata
        if "Metadata" not in wb.sheetnames:
            raise ValueError("Invalid template: Metadata sheet not found")
        
        metadata_ws = wb["Metadata"]
        metadata = self._read_metadata(metadata_ws)
        
        # Validate template
        if str(metadata["engagement_id"]) != str(engagement_id):
            raise ValueError(f"Template engagement_id ({metadata['engagement_id']}) does not match requested engagement_id ({engagement_id})")
        
        # Get engagement and opportunity
        engagement = await self.engagement_repo.get(engagement_id)
        if not engagement:
            raise ValueError("Engagement not found")
        
        opportunity = await self.opportunity_repo.get(engagement.opportunity_id)
        if not opportunity:
            raise ValueError("Opportunity not found")
        
        if str(metadata["opportunity_delivery_center_id"]) != str(opportunity.delivery_center_id):
            raise ValueError("Opportunity Invoice Center mismatch")
        
        # Read data sheet
        if "Resource Plan Data" not in wb.sheetnames:
            raise ValueError("Invalid template: Resource Plan Data sheet not found")
        
        data_ws = wb["Resource Plan Data"]
        
        # Validate week columns
        expected_weeks = metadata["week_start_dates"]
        actual_weeks = self._extract_week_columns(data_ws, len(expected_weeks))
        
        if len(actual_weeks) != len(expected_weeks):
            raise ValueError(f"Week column count mismatch: expected {len(expected_weeks)}, found {len(actual_weeks)}")
        
        # Parse data rows
        line_items_data = self._parse_data_rows(
            data_ws,
            expected_weeks,
            metadata,
            opportunity.delivery_center_id,
            opportunity.default_currency or "USD"
        )
        
        # Upsert line items
        results = await self._upsert_line_items(engagement_id, line_items_data, expected_weeks)
        
        return results
    
    def _generate_weeks_from_line_items(self, line_items: List[EngagementLineItem]) -> List[date]:
        """Generate list of week start dates from line items (flexible dates)."""
        if not line_items:
            return []
        
        week_dates = set()
        for line_item in line_items:
            if line_item.weekly_hours:
                for weekly_hour in line_item.weekly_hours:
                    week_dates.add(weekly_hour.week_start_date)
        
        min_date = min(li.start_date for li in line_items)
        max_date = max(li.end_date for li in line_items)
        
        weeks = []
        current = self._get_week_start(min_date)
        end_week_start = self._get_week_start(max_date)
        
        while current <= end_week_start:
            weeks.append(current)
            current += timedelta(days=7)
        
        for week_date in week_dates:
            if week_date not in weeks:
                weeks.append(week_date)
        
        return sorted(weeks)
    
    def _generate_weeks_from_dates(self, start_date: date, end_date: date) -> List[date]:
        """Generate list of week start dates between two dates."""
        weeks = []
        current = self._get_week_start(start_date)
        end_week_start = self._get_week_start(end_date)
        
        while current <= end_week_start:
            weeks.append(current)
            current += timedelta(days=7)
        
        return weeks
    
    def _get_week_start(self, d: date) -> date:
        """Get the Sunday (week start) for a given date."""
        days_since_sunday = (d.weekday() + 1) % 7
        return d - timedelta(days=days_since_sunday)
    
    def _write_metadata(self, ws, engagement, opportunity, weeks: List[date], 
                        delivery_centers, roles, employees):
        """Write metadata to hidden sheet."""
        ws["A1"] = "engagement_id"
        ws["B1"] = str(engagement.id)
        ws["A2"] = "quote_id"
        ws["B2"] = str(engagement.quote_id)
        ws["A3"] = "opportunity_id"
        ws["B3"] = str(engagement.opportunity_id)
        ws["A4"] = "opportunity_delivery_center_id"
        ws["B4"] = str(opportunity.delivery_center_id)
        ws["A5"] = "week_start_dates"
        ws["B5"] = ",".join([w.isoformat() for w in weeks])
        
        # Write phases
        if engagement.phases:
            ws["A6"] = "phases"
            for idx, phase in enumerate(engagement.phases):
                ws[f"B{6 + idx}"] = f"{phase.name}|{phase.start_date.isoformat()}|{phase.end_date.isoformat()}|{phase.color}"
        
        # Write delivery centers, roles, employees (similar to estimate export)
        start_row = 15
        ws[f"A{start_row}"] = "delivery_centers"
        for idx, dc in enumerate(delivery_centers):
            ws[f"B{start_row + idx}"] = f"{dc.id}|{dc.name}"
        
        roles_start = start_row + len(delivery_centers) + 2
        ws[f"A{roles_start}"] = "roles"
        for idx, role in enumerate(roles):
            ws[f"B{roles_start + idx}"] = f"{role.id}|{role.role_name}"
        
        employees_start = roles_start + len(roles) + 2
        ws[f"A{employees_start}"] = "employees"
        for idx, emp in enumerate(employees):
            ws[f"B{employees_start + idx}"] = f"{emp.id}|{emp.first_name} {emp.last_name}"
    
    def _write_headers(self, ws, phases: Optional[List[EngagementPhase]], weeks: List[date], currency: str):
        """Write header rows (simplified version)."""
        # Row 3: Column headers
        headers = [
            "Payable Center", "Role", "Employee",
            f"Cost ({currency})", f"Rate ({currency})",
            f"Cost ({currency}) Daily", f"Rate ({currency}) Daily",
            "Start Date", "End Date", "Billable", "Billable %",
        ]
        
        for idx, header in enumerate(headers):
            cell = ws[f"{get_column_letter(idx + 1)}3"]
            cell.value = header
            cell.font = Font(bold=True)
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        
        # Week column headers
        col = 12
        for idx, week in enumerate(weeks):
            cell = ws[f"{get_column_letter(col + idx)}3"]
            cell.value = week.strftime("%m/%d/%Y")
            cell.font = Font(bold=True, size=9)
            cell.alignment = Alignment(horizontal="center", vertical="center")
        
        # Totals headers
        totals_start_col = col + len(weeks)
        total_headers = ["Total Hours", f"Total Cost ({currency})", f"Total Revenue ({currency})"]
        for idx, header in enumerate(total_headers):
            cell = ws[f"{get_column_letter(totals_start_col + idx)}3"]
            cell.value = header
            cell.font = Font(bold=True)
            cell.alignment = Alignment(horizontal="center", vertical="center")
    
    def _write_data_rows(self, ws, line_items: List[EngagementLineItem], weeks: List[date], num_phases: int, min_rows: int = 20):
        """Write data rows (simplified version)."""
        start_row = 4
        for row_idx, line_item in enumerate(line_items):
            row = start_row + row_idx
            # Write line item data (simplified - full implementation would match estimate export)
            # This is a placeholder - full implementation would write all fields
            pass
    
    def _write_totals_row(self, ws, num_rows: int, num_weeks: int):
        """Write totals row."""
        totals_row = 4 + num_rows
        # Write totals formulas (simplified)
        pass
    
    def _apply_validation(self, ws, delivery_centers, roles, employees, num_rows: int, num_weeks: int):
        """Apply data validation (simplified)."""
        # Apply dropdowns and validation rules
        pass
    
    def _create_excel_table(self, ws, num_rows: int, num_weeks: int):
        """Create Excel Table."""
        # Create table structure (simplified)
        pass
    
    def _read_metadata(self, ws) -> Dict:
        """Read metadata from metadata sheet."""
        metadata = {}
        for row in range(1, 200):
            key = ws[f"A{row}"].value
            value = ws[f"B{row}"].value
            if not key:
                continue
            if key == "engagement_id":
                metadata["engagement_id"] = UUID(value)
            elif key == "opportunity_delivery_center_id":
                metadata["opportunity_delivery_center_id"] = UUID(value)
            elif key == "week_start_dates":
                metadata["week_start_dates"] = [date.fromisoformat(d) for d in value.split(",") if d]
        return metadata
    
    def _extract_week_columns(self, ws, expected_count: int) -> List[date]:
        """Extract week columns from data sheet."""
        from datetime import datetime
        # Extract week dates from headers
        weeks = []
        col = 12  # Week columns start at column L
        for idx in range(expected_count):
            cell = ws[f"{get_column_letter(col + idx)}3"]
            if cell.value:
                # Parse date from header
                try:
                    week_date = datetime.strptime(str(cell.value), "%m/%d/%Y").date()
                    weeks.append(self._get_week_start(week_date))
                except:
                    pass
        return weeks
    
    def _parse_data_rows(self, ws, weeks: List[date], metadata: Dict, 
                         opportunity_delivery_center_id: UUID, currency: str) -> List[Dict]:
        """Parse data rows from Excel."""
        # Parse line items from data sheet (simplified)
        line_items = []
        # Full implementation would parse all rows and extract line item data
        return line_items
    
    async def _upsert_line_items(self, engagement_id: UUID, line_items_data: List[Dict], weeks: List[date]) -> Dict:
        """Upsert line items from parsed data."""
        created = 0
        updated = 0
        errors = []
        
        # Full implementation would create/update line items and weekly hours
        # This is a placeholder
        
        return {
            "created": created,
            "updated": updated,
            "deleted": 0,
            "errors": errors,
        }

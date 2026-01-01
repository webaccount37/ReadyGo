"""
Excel import service for estimates.
"""

import logging
from typing import List, Dict, Optional, Tuple
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from openpyxl import load_workbook

from app.db.repositories.estimate_repository import EstimateRepository
from app.db.repositories.estimate_line_item_repository import EstimateLineItemRepository
from app.db.repositories.estimate_weekly_hours_repository import EstimateWeeklyHoursRepository
from app.db.repositories.delivery_center_repository import DeliveryCenterRepository
from app.db.repositories.employee_repository import EmployeeRepository
from app.db.repositories.role_repository import RoleRepository
from app.db.repositories.role_rate_repository import RoleRateRepository
from app.db.repositories.engagement_repository import EngagementRepository
from app.models.estimate import EstimateLineItem, EstimateWeeklyHours
from app.models.delivery_center import DeliveryCenter
from app.models.employee import Employee
from app.models.role import Role
from app.models.role_rate import RoleRate

logger = logging.getLogger(__name__)


class ExcelImportService:
    """Service for importing estimates from Excel."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.estimate_repo = EstimateRepository(session)
        self.line_item_repo = EstimateLineItemRepository(session)
        self.weekly_hours_repo = EstimateWeeklyHoursRepository(session)
        self.delivery_center_repo = DeliveryCenterRepository(session)
        self.employee_repo = EmployeeRepository(session)
        self.role_repo = RoleRepository(session)
        self.role_rate_repo = RoleRateRepository(session)
        self.engagement_repo = EngagementRepository(session)
    
    async def import_estimate_from_excel(self, estimate_id: UUID, file_path: str) -> Dict:
        """Import estimate data from Excel file."""
        # Load workbook
        wb = load_workbook(file_path, data_only=True)
        
        # Read metadata
        if "Metadata" not in wb.sheetnames:
            raise ValueError("Invalid template: Metadata sheet not found")
        
        metadata_ws = wb["Metadata"]
        metadata = self._read_metadata(metadata_ws)
        
        # Validate template
        if str(metadata["estimate_id"]) != str(estimate_id):
            raise ValueError(f"Template estimate_id ({metadata['estimate_id']}) does not match requested estimate_id ({estimate_id})")
        
        # Get estimate and engagement
        estimate = await self.estimate_repo.get(estimate_id)
        if not estimate:
            raise ValueError("Estimate not found")
        
        engagement = await self.engagement_repo.get(estimate.engagement_id)
        if not engagement:
            raise ValueError("Engagement not found")
        
        if str(metadata["engagement_delivery_center_id"]) != str(engagement.delivery_center_id):
            raise ValueError("Engagement Invoice Center mismatch")
        
        # Read data sheet
        if "Estimate Data" not in wb.sheetnames:
            raise ValueError("Invalid template: Estimate Data sheet not found")
        
        data_ws = wb["Estimate Data"]
        
        # Validate week columns match
        expected_weeks = metadata["week_start_dates"]
        actual_weeks = self._extract_week_columns(data_ws, len(expected_weeks))
        
        if len(actual_weeks) != len(expected_weeks):
            raise ValueError(f"Week column count mismatch: expected {len(expected_weeks)}, found {len(actual_weeks)}")
        
        for idx, (expected, actual) in enumerate(zip(expected_weeks, actual_weeks)):
            if expected != actual:
                raise ValueError(f"Week column {idx + 1} mismatch: expected {expected}, found {actual}")
        
        # Parse data rows
        line_items_data = self._parse_data_rows(
            data_ws, 
            expected_weeks,
            metadata,
            engagement.delivery_center_id,
            engagement.default_currency or "USD"
        )
        
        # Upsert line items
        results = await self._upsert_line_items(estimate_id, line_items_data, expected_weeks)
        
        return results
    
    def _read_metadata(self, ws) -> Dict:
        """Read metadata from metadata sheet."""
        metadata = {}
        
        # Read basic fields
        for row in range(1, 20):
            key = ws[f"A{row}"].value
            value = ws[f"B{row}"].value
            
            if key == "estimate_id":
                metadata["estimate_id"] = UUID(value)
            elif key == "engagement_id":
                metadata["engagement_id"] = UUID(value)
            elif key == "engagement_delivery_center_id":
                metadata["engagement_delivery_center_id"] = UUID(value)
            elif key == "week_start_dates":
                metadata["week_start_dates"] = [date.fromisoformat(d) for d in value.split(",") if d]
            elif key == "phases":
                metadata["phases"] = []
                row_idx = row
                while ws[f"B{row_idx}"].value:
                    phase_str = ws[f"B{row_idx}"].value
                    parts = phase_str.split("|")
                    if len(parts) >= 4:
                        metadata["phases"].append({
                            "name": parts[0],
                            "start_date": date.fromisoformat(parts[1]),
                            "end_date": date.fromisoformat(parts[2]),
                            "color": parts[3],
                        })
                    row_idx += 1
            elif key == "delivery_centers":
                metadata["delivery_centers"] = {}
                row_idx = row
                while ws[f"B{row_idx}"].value:
                    dc_str = ws[f"B{row_idx}"].value
                    parts = dc_str.split("|")
                    if len(parts) >= 2:
                        metadata["delivery_centers"][parts[1]] = UUID(parts[0])
                    row_idx += 1
            elif key == "roles":
                metadata["roles"] = {}
                row_idx = row
                while ws[f"B{row_idx}"].value:
                    role_str = ws[f"B{row_idx}"].value
                    parts = role_str.split("|")
                    if len(parts) >= 2:
                        metadata["roles"][parts[1]] = UUID(parts[0])
                    row_idx += 1
            elif key == "employees":
                metadata["employees"] = {}
                row_idx = row
                while ws[f"B{row_idx}"].value:
                    emp_str = ws[f"B{row_idx}"].value
                    parts = emp_str.split("|")
                    if len(parts) >= 2:
                        metadata["employees"][parts[1]] = UUID(parts[0])
                    row_idx += 1
        
        return metadata
    
    def _extract_week_columns(self, ws, expected_count: int) -> List[date]:
        """Extract week start dates from week header row (row 3)."""
        weeks = []
        col = 10  # Start after fixed columns
        
        for idx in range(expected_count):
            cell = ws[f"{self._get_column_letter(col + idx)}3"]
            if cell.value:
                # Parse date from cell value
                if isinstance(cell.value, datetime):
                    week_date = cell.value.date()
                elif isinstance(cell.value, date):
                    week_date = cell.value
                else:
                    # Try parsing string
                    try:
                        week_date = datetime.strptime(str(cell.value), "%m/%d/%Y").date()
                    except:
                        week_date = None
                
                if week_date:
                    weeks.append(week_date)
        
        return weeks
    
    def _get_column_letter(self, col: int) -> str:
        """Get Excel column letter from 1-based column number."""
        from openpyxl.utils import get_column_letter
        return get_column_letter(col)
    
    def _parse_data_rows(self, ws, weeks: List[date], metadata: Dict, 
                        engagement_delivery_center_id: UUID, currency: str) -> List[Dict]:
        """Parse data rows from worksheet."""
        line_items = []
        start_row = 5  # Data starts at row 5
        
        # Find end of data (look for empty row or totals row)
        row = start_row
        while True:
            # Check if row is empty or contains "TOTALS"
            payable_center = ws[f"A{row}"].value
            if payable_center == "TOTALS" or (payable_center is None and row > start_row):
                break
            
            if payable_center is None:
                row += 1
                continue
            
            # Parse row data
            try:
                line_item = self._parse_line_item_row(ws, row, weeks, metadata, engagement_delivery_center_id, currency)
                if line_item:
                    line_items.append(line_item)
            except Exception as e:
                logger.warning(f"Error parsing row {row}: {e}")
                # Continue with next row
            
            row += 1
        
        return line_items
    
    def _parse_line_item_row(self, ws, row: int, weeks: List[date], metadata: Dict,
                            engagement_delivery_center_id: UUID, currency: str) -> Optional[Dict]:
        """Parse a single line item row."""
        # Payable Center (Column A)
        payable_center_name = ws[f"A{row}"].value
        if not payable_center_name:
            return None  # Skip empty rows
        
        delivery_centers = metadata.get("delivery_centers", {})
        delivery_center_id = delivery_centers.get(payable_center_name)
        if not delivery_center_id:
            raise ValueError(f"Row {row}: Invalid Payable Center '{payable_center_name}'")
        
        # Role (Column B)
        role_name = ws[f"B{row}"].value
        if not role_name:
            raise ValueError(f"Row {row}: Role is required")
        
        roles = metadata.get("roles", {})
        role_id = roles.get(role_name)
        if not role_id:
            raise ValueError(f"Row {row}: Invalid Role '{role_name}'")
        
        # Verify role has relationship with engagement delivery center
        # This will be checked during upsert
        
        # Employee (Column C) - optional
        employee_name = ws[f"C{row}"].value
        employee_id = None
        if employee_name:
            employees = metadata.get("employees", {})
            employee_id = employees.get(employee_name)
            if not employee_id:
                raise ValueError(f"Row {row}: Invalid Employee '{employee_name}'")
        
        # Cost (Column D)
        cost_value = ws[f"D{row}"].value
        if cost_value is None:
            raise ValueError(f"Row {row}: Cost is required")
        cost = Decimal(str(cost_value))
        
        # Rate (Column E)
        rate_value = ws[f"E{row}"].value
        if rate_value is None:
            raise ValueError(f"Row {row}: Rate is required")
        rate = Decimal(str(rate_value))
        
        # Start Date (Column F)
        start_date_value = ws[f"F{row}"].value
        if not start_date_value:
            raise ValueError(f"Row {row}: Start Date is required")
        if isinstance(start_date_value, datetime):
            start_date = start_date_value.date()
        elif isinstance(start_date_value, date):
            start_date = start_date_value
        else:
            try:
                start_date = datetime.strptime(str(start_date_value), "%Y-%m-%d").date()
            except:
                raise ValueError(f"Row {row}: Invalid Start Date format")
        
        # End Date (Column G)
        end_date_value = ws[f"G{row}"].value
        if not end_date_value:
            raise ValueError(f"Row {row}: End Date is required")
        if isinstance(end_date_value, datetime):
            end_date = end_date_value.date()
        elif isinstance(end_date_value, date):
            end_date = end_date_value
        else:
            try:
                end_date = datetime.strptime(str(end_date_value), "%Y-%m-%d").date()
            except:
                raise ValueError(f"Row {row}: Invalid End Date format")
        
        if start_date > end_date:
            raise ValueError(f"Row {row}: Start Date must be <= End Date")
        
        # Billable (Column H)
        billable_value = ws[f"H{row}"].value
        billable = True
        if billable_value:
            billable_str = str(billable_value).strip().lower()
            billable = billable_str in ["yes", "true", "1", "y"]
        
        # Billable % (Column I)
        billable_pct_value = ws[f"I{row}"].value
        billable_pct = Decimal("0")
        if billable_pct_value is not None:
            billable_pct = Decimal(str(billable_pct_value))
            if billable_pct < 0 or billable_pct > 100:
                raise ValueError(f"Row {row}: Billable % must be between 0 and 100")
        
        # Weekly hours (Columns J onwards)
        weekly_hours = {}
        week_col_start = 10
        for idx, week in enumerate(weeks):
            col = week_col_start + idx
            col_letter = self._get_column_letter(col)
            hours_value = ws[f"{col_letter}{row}"].value
            
            if hours_value is not None:
                hours = Decimal(str(hours_value))
                if hours < 0:
                    raise ValueError(f"Row {row}, Week {week.isoformat()}: Hours must be >= 0")
                weekly_hours[week] = hours
        
        return {
            "delivery_center_id": delivery_center_id,
            "role_id": role_id,
            "employee_id": employee_id,
            "cost": cost,
            "rate": rate,
            "currency": currency,
            "start_date": start_date,
            "end_date": end_date,
            "billable": billable,
            "billable_expense_percentage": billable_pct,
            "weekly_hours": weekly_hours,
        }
    
    async def _upsert_line_items(self, estimate_id: UUID, line_items_data: List[Dict], 
                                 weeks: List[date]) -> Dict:
        """Upsert line items from parsed data."""
        # Get existing line items
        existing_line_items = await self.line_item_repo.list_by_estimate(estimate_id)
        existing_by_key = {}
        
        for li in existing_line_items:
            # Create key from Payable Center + Role + Employee + Start Date
            key = (
                str(li.role_rate.delivery_center_id) if li.role_rate else None,
                str(li.role_rate.role_id) if li.role_rate and li.role_rate.role else None,
                str(li.employee_id) if li.employee_id else None,
                str(li.start_date),
            )
            existing_by_key[key] = li
        
        created_count = 0
        updated_count = 0
        errors = []
        
        # Get estimate for currency
        estimate = await self.estimate_repo.get(estimate_id)
        engagement = await self.engagement_repo.get(estimate.engagement_id)
        engagement_delivery_center_id = engagement.delivery_center_id
        
        # Get max row_order
        max_order = await self.line_item_repo.get_max_row_order(estimate_id)
        next_order = max_order + 1
        
        for idx, item_data in enumerate(line_items_data):
            try:
                # Verify role has relationship with engagement delivery center
                role_rate_result = await self.session.execute(
                    select(RoleRate).where(
                        RoleRate.role_id == item_data["role_id"],
                        RoleRate.delivery_center_id == engagement_delivery_center_id,
                    )
                )
                role_rate_for_lookup = role_rate_result.scalar_one_or_none()
                
                if not role_rate_for_lookup:
                    raise ValueError(f"Row {idx + 5}: Role does not have relationship with Engagement Invoice Center")
                
                # Get or create role_rate for Payable Center
                payable_role_rate_result = await self.session.execute(
                    select(RoleRate).where(
                        RoleRate.role_id == item_data["role_id"],
                        RoleRate.delivery_center_id == item_data["delivery_center_id"],
                        RoleRate.default_currency == item_data["currency"],
                    )
                )
                payable_role_rate = payable_role_rate_result.scalar_one_or_none()
                
                if not payable_role_rate:
                    # Create new role_rate
                    payable_role_rate = RoleRate(
                        role_id=item_data["role_id"],
                        delivery_center_id=item_data["delivery_center_id"],
                        default_currency=item_data["currency"],
                        internal_cost_rate=float(item_data["cost"]),
                        external_rate=float(item_data["rate"]),
                    )
                    self.session.add(payable_role_rate)
                    await self.session.flush()
                
                # Create key for matching
                key = (
                    str(item_data["delivery_center_id"]),
                    str(item_data["role_id"]),
                    str(item_data["employee_id"]) if item_data["employee_id"] else None,
                    str(item_data["start_date"]),
                )
                
                # Find or create line item
                if key in existing_by_key:
                    # Update existing
                    line_item = existing_by_key[key]
                    await self.line_item_repo.update(
                        line_item.id,
                        role_rates_id=payable_role_rate.id,
                        employee_id=item_data["employee_id"],
                        rate=item_data["rate"],
                        cost=item_data["cost"],
                        start_date=item_data["start_date"],
                        end_date=item_data["end_date"],
                        billable=item_data["billable"],
                        billable_expense_percentage=item_data["billable_expense_percentage"],
                    )
                    updated_count += 1
                else:
                    # Create new
                    line_item = await self.line_item_repo.create(
                        estimate_id=estimate_id,
                        role_rates_id=payable_role_rate.id,
                        employee_id=item_data["employee_id"],
                        rate=item_data["rate"],
                        cost=item_data["cost"],
                        currency=item_data["currency"],
                        start_date=item_data["start_date"],
                        end_date=item_data["end_date"],
                        row_order=next_order,
                        billable=item_data["billable"],
                        billable_expense_percentage=item_data["billable_expense_percentage"],
                    )
                    next_order += 1
                    created_count += 1
                
                await self.session.flush()
                
                # Update weekly hours
                # Delete existing weekly hours
                await self.weekly_hours_repo.delete_by_line_item(line_item.id)
                
                # Create new weekly hours
                for week, hours in item_data["weekly_hours"].items():
                    if hours > 0:
                        await self.weekly_hours_repo.create(
                            estimate_line_item_id=line_item.id,
                            week_start_date=week,
                            hours=hours,
                        )
                
            except Exception as e:
                error_msg = f"Row {idx + 5}: {str(e)}"
                errors.append(error_msg)
                logger.error(error_msg, exc_info=True)
        
        await self.session.commit()
        
        return {
            "created": created_count,
            "updated": updated_count,
            "errors": errors,
        }


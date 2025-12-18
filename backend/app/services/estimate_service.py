"""
Estimate service with business logic.
"""

import logging
from typing import List, Optional, Tuple, Dict
from uuid import UUID
from datetime import date, timedelta, datetime
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

logger = logging.getLogger(__name__)

from app.services.base_service import BaseService
from app.db.repositories.estimate_repository import EstimateRepository
from app.db.repositories.estimate_line_item_repository import EstimateLineItemRepository
from app.db.repositories.estimate_weekly_hours_repository import EstimateWeeklyHoursRepository
from app.db.repositories.role_rate_repository import RoleRateRepository
from app.db.repositories.role_repository import RoleRepository
from app.db.repositories.employee_repository import EmployeeRepository
from app.db.repositories.release_repository import ReleaseRepository
from app.models.estimate import Estimate, EstimateLineItem, EstimateWeeklyHours, EstimateStatus
from app.models.role_rate import RoleRate
from app.models.role import Role
from app.models.employee import Employee
from app.schemas.estimate import (
    EstimateCreate, EstimateUpdate, EstimateResponse, EstimateDetailResponse, EstimateListResponse,
    EstimateLineItemCreate, EstimateLineItemUpdate, EstimateLineItemResponse,
    EstimateWeeklyHoursCreate, EstimateWeeklyHoursResponse,
    AutoFillRequest, AutoFillPattern,
    EstimateTotalsResponse, WeeklyTotal, MonthlyTotal, RoleTotal,
    EstimatePhaseResponse,
)


class EstimateService(BaseService):
    """Service for estimate operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.estimate_repo = EstimateRepository(session)
        self.line_item_repo = EstimateLineItemRepository(session)
        self.weekly_hours_repo = EstimateWeeklyHoursRepository(session)
        self.role_rate_repo = RoleRateRepository(session)
        self.role_repo = RoleRepository(session)
        self.employee_repo = EmployeeRepository(session)
        self.release_repo = ReleaseRepository(session)
    
    async def create_estimate(self, estimate_data: EstimateCreate) -> EstimateResponse:
        """Create a new estimate."""
        # Get release with employee associations to inherit employees
        # Use the same method the Release service uses to get correct dates
        release = await self.release_repo.get_with_relationships(estimate_data.release_id)
        if not release:
            raise ValueError("Release not found")
        
        # Also get the release via ReleaseService to ensure we have the same data structure
        # This ensures dates are handled the same way as the Release page
        from app.services.release_service import ReleaseService
        release_service = ReleaseService(self.session)
        release_response = await release_service.get_release_with_relationships(estimate_data.release_id)
        if not release_response:
            raise ValueError("Release not found")
        
        estimate_dict = estimate_data.model_dump(exclude_unset=True)
        if not estimate_dict.get("currency") and release.default_currency:
            estimate_dict["currency"] = release.default_currency
        
        estimate = await self.estimate_repo.create(**estimate_dict)
        await self.session.flush()  # Flush to get estimate.id
        
        # Create default line items from release employees
        # Get the release response to use the same dates that the Release page shows
        from app.services.release_service import ReleaseService
        release_service = ReleaseService(self.session)
        release_response = await release_service.get_release_with_relationships(estimate_data.release_id)
        
        # Create a map of employee_id -> dates from the release response (these are correct)
        employee_date_map = {}
        if release_response and release_response.employees:
            logger.info(f"Release response has {len(release_response.employees)} employees")
            for emp in release_response.employees:
                if emp.get("start_date") and emp.get("end_date"):
                    employee_date_map[emp["id"]] = {
                        "start_date": emp["start_date"],
                        "end_date": emp["end_date"],
                    }
                    logger.info(f"  Mapped employee {emp['id']}: start_date={emp['start_date']}, end_date={emp['end_date']}")
        logger.info(f"Created employee_date_map with {len(employee_date_map)} entries")
        
        if release.employee_associations:
            logger.info(f"Creating default line items from {len(release.employee_associations)} release employees for estimate {estimate.id}")
            row_order = 0
            
            for emp_assoc in release.employee_associations:
                logger.info(f"  Processing employee {emp_assoc.employee_id}, role {emp_assoc.role_id}, dc {emp_assoc.delivery_center_id}")
                
                # LOG: What does Release service see?
                logger.info(f"  === DATE DEBUG ===")
                logger.info(f"  emp_assoc.start_date = {emp_assoc.start_date} (type: {type(emp_assoc.start_date)})")
                logger.info(f"  emp_assoc.end_date = {emp_assoc.end_date} (type: {type(emp_assoc.end_date)})")
                if isinstance(emp_assoc.start_date, date):
                    logger.info(f"  emp_assoc.start_date.isoformat() = {emp_assoc.start_date.isoformat()}")
                if isinstance(emp_assoc.end_date, date):
                    logger.info(f"  emp_assoc.end_date.isoformat() = {emp_assoc.end_date.isoformat()}")
                
                # Use project_rate from EmployeeRelease association as the rate
                # Get cost from employee's internal_cost_rate
                employee = await self.employee_repo.get(emp_assoc.employee_id)
                if employee:
                    project_rate = Decimal(str(emp_assoc.project_rate))
                    internal_cost = Decimal(str(employee.internal_cost_rate))
                else:
                    # Fallback to default rates if employee not found
                    project_rate, internal_cost = await self._get_default_rates(
                        emp_assoc.role_id,
                        emp_assoc.delivery_center_id,
                        estimate_dict.get("currency", "USD"),
                        emp_assoc.employee_id,
                    )
                
                logger.info(f"  Using project_rate={project_rate}, cost={internal_cost}")
                
                # CRITICAL: Use the exact same date values as Release service
                # Release service does: assoc.start_date.isoformat() which produces "2025-12-31"
                # We must use the exact same date objects, ensuring no timezone conversion
                
                # Extract dates exactly as they are stored in EmployeeRelease
                # Use year/month/day directly to avoid any timezone conversion
                if isinstance(emp_assoc.start_date, date):
                    # Pure date object - use directly (same as Release service does)
                    start_date_val = date(emp_assoc.start_date.year, emp_assoc.start_date.month, emp_assoc.start_date.day)
                elif isinstance(emp_assoc.start_date, datetime):
                    # If datetime, extract date part using year/month/day directly
                    # This avoids any timezone conversion
                    start_date_val = date(emp_assoc.start_date.year, emp_assoc.start_date.month, emp_assoc.start_date.day)
                    logger.warning(f"  emp_assoc.start_date is datetime! Original: {emp_assoc.start_date}, Extracted: {start_date_val}")
                else:
                    # String - parse as date
                    date_str = str(emp_assoc.start_date).split("T")[0].split(" ")[0]
                    parsed = date.fromisoformat(date_str)
                    start_date_val = date(parsed.year, parsed.month, parsed.day)
                
                if isinstance(emp_assoc.end_date, date):
                    end_date_val = date(emp_assoc.end_date.year, emp_assoc.end_date.month, emp_assoc.end_date.day)
                elif isinstance(emp_assoc.end_date, datetime):
                    end_date_val = date(emp_assoc.end_date.year, emp_assoc.end_date.month, emp_assoc.end_date.day)
                    logger.warning(f"  emp_assoc.end_date is datetime! Original: {emp_assoc.end_date}, Extracted: {end_date_val}")
                else:
                    date_str = str(emp_assoc.end_date).split("T")[0].split(" ")[0]
                    parsed = date.fromisoformat(date_str)
                    end_date_val = date(parsed.year, parsed.month, parsed.day)
                
                logger.info(f"  === DATE PROCESSING ===")
                logger.info(f"  emp_assoc.start_date = {emp_assoc.start_date} (type: {type(emp_assoc.start_date)})")
                logger.info(f"  emp_assoc.end_date = {emp_assoc.end_date} (type: {type(emp_assoc.end_date)})")
                logger.info(f"  Final start_date_val = {start_date_val} (isoformat: {start_date_val.isoformat()})")
                logger.info(f"  Final end_date_val = {end_date_val} (isoformat: {end_date_val.isoformat()})")
                if isinstance(emp_assoc.start_date, date):
                    logger.info(f"  Release service would send: start_date={emp_assoc.start_date.isoformat()}, end_date={emp_assoc.end_date.isoformat()}")
                
                # Create line item for this employee
                # Log the exact date values before storing
                logger.info(f"  STORING dates: start_date={start_date_val} (type: {type(start_date_val)}), end_date={end_date_val} (type: {type(end_date_val)})")
                logger.info(f"  Date ISO strings: start_date={start_date_val.isoformat()}, end_date={end_date_val.isoformat()}")
                
                line_item_dict = {
                    "quote_id": estimate.id,  # Database column name is still quote_id
                    "role_id": emp_assoc.role_id,
                    "delivery_center_id": emp_assoc.delivery_center_id,
                    "employee_id": emp_assoc.employee_id,
                    "rate": project_rate,
                    "cost": internal_cost,
                    "currency": estimate_dict.get("currency", "USD"),
                    "start_date": start_date_val,
                    "end_date": end_date_val,
                    "row_order": row_order,
                }
                
                logger.info(f"  === STORING IN DB ===")
                logger.info(f"  About to store: start_date={start_date_val} (type: {type(start_date_val)}), end_date={end_date_val} (type: {type(end_date_val)})")
                
                line_item = await self.line_item_repo.create(**line_item_dict)
                await self.session.flush()  # Flush to ensure it's saved
                
                # Query the database directly to see what's actually stored
                from sqlalchemy import text
                result = await self.session.execute(
                    text("SELECT start_date, end_date FROM quote_line_items WHERE id = :id"),
                    {"id": str(line_item.id)}
                )
                db_row = result.fetchone()
                if db_row:
                    logger.info(f"  === DIRECT DB QUERY (AFTER STORE) ===")
                    logger.info(f"  DB start_date = {db_row[0]} (type: {type(db_row[0])})")
                    logger.info(f"  DB end_date = {db_row[1]} (type: {type(db_row[1])})")
                    if isinstance(db_row[0], date):
                        logger.info(f"  DB start_date.isoformat() = {db_row[0].isoformat()}")
                    if isinstance(db_row[1], date):
                        logger.info(f"  DB end_date.isoformat() = {db_row[1].isoformat()}")
                
                # Log what SQLAlchemy returns
                logger.info(f"  === SQLALCHEMY RETRIEVAL (AFTER STORE) ===")
                logger.info(f"  line_item.start_date = {line_item.start_date} (type: {type(line_item.start_date)})")
                logger.info(f"  line_item.end_date = {line_item.end_date} (type: {type(line_item.end_date)})")
                if isinstance(line_item.start_date, date):
                    logger.info(f"  line_item.start_date.isoformat() = {line_item.start_date.isoformat()}")
                elif isinstance(line_item.start_date, datetime):
                    logger.info(f"  line_item.start_date.isoformat() = {line_item.start_date.isoformat()}")
                    logger.info(f"  line_item.start_date.date() = {line_item.start_date.date()}")
                    logger.info(f"  line_item.start_date.date().isoformat() = {line_item.start_date.date().isoformat()}")
                if isinstance(line_item.end_date, date):
                    logger.info(f"  line_item.end_date.isoformat() = {line_item.end_date.isoformat()}")
                elif isinstance(line_item.end_date, datetime):
                    logger.info(f"  line_item.end_date.isoformat() = {line_item.end_date.isoformat()}")
                    logger.info(f"  line_item.end_date.date() = {line_item.end_date.date()}")
                    logger.info(f"  line_item.end_date.date().isoformat() = {line_item.end_date.date().isoformat()}")
                row_order += 1
            
            logger.info(f"Created {row_order} default line items from release employees")
        else:
            logger.warning(f"Release {estimate_data.release_id} has no employee associations")
        
        await self.session.commit()
        
        # Refresh the session to ensure line items are loaded
        await self.session.refresh(estimate)
        
        estimate = await self.estimate_repo.get_with_line_items(estimate.id)
        if not estimate:
            raise ValueError("Failed to retrieve created estimate")
        
        # Log line items for debugging
        logger.info(f"Estimate {estimate.id} has {len(estimate.line_items) if estimate.line_items else 0} line items after creation")
        if estimate.line_items:
            for li in estimate.line_items:
                logger.info(f"  Line item {li.id}: employee_id={li.employee_id}, role_id={li.role_id}")
        
        response = self._to_response(estimate, include_line_items=True)
        logger.info(f"Response has {len(response.line_items) if response.line_items else 0} line items")
        return response
    
    async def get_estimate(self, estimate_id: UUID) -> Optional[EstimateResponse]:
        """Get estimate by ID."""
        estimate = await self.estimate_repo.get(estimate_id)
        if not estimate:
            return None
        return self._to_response(estimate, include_line_items=False)
    
    async def get_estimate_detail(self, estimate_id: UUID) -> Optional[EstimateDetailResponse]:
        """Get estimate with all line items and weekly hours."""
        estimate = await self.estimate_repo.get_with_line_items(estimate_id)
        if not estimate:
            return None
        return self._to_detail_response(estimate)
    
    async def list_estimates(
        self,
        skip: int = 0,
        limit: int = 100,
        release_id: Optional[UUID] = None,
        status: Optional[str] = None,
    ) -> Tuple[List[EstimateResponse], int]:
        """List estimates with optional filters."""
        filters = {}
        if release_id:
            filters["release_id"] = release_id
        if status:
            try:
                filters["status"] = EstimateStatus(status)
            except ValueError:
                pass
        
        estimates = await self.estimate_repo.list(skip=skip, limit=limit, **filters)
        total = await self.estimate_repo.count(**filters)
        
        return [self._to_response(e, include_line_items=False) for e in estimates], total
    
    async def update_estimate(
        self,
        estimate_id: UUID,
        estimate_data: EstimateUpdate,
    ) -> Optional[EstimateResponse]:
        """Update an estimate."""
        estimate = await self.estimate_repo.get(estimate_id)
        if not estimate:
            return None
        
        update_dict = estimate_data.model_dump(exclude_unset=True)
        updated = await self.estimate_repo.update(estimate_id, **update_dict)
        await self.session.commit()
        
        updated = await self.estimate_repo.get(estimate_id)
        if not updated:
            return None
        return self._to_response(updated, include_line_items=False)
    
    async def delete_estimate(self, estimate_id: UUID) -> bool:
        """Delete an estimate."""
        deleted = await self.estimate_repo.delete(estimate_id)
        await self.session.commit()
        return deleted
    
    async def clone_estimate(self, estimate_id: UUID, new_name: str) -> EstimateResponse:
        """Clone an estimate to create a variation."""
        estimate = await self.estimate_repo.get_with_line_items(estimate_id)
        if not estimate:
            raise ValueError("Estimate not found")
        
        # Create new estimate
        new_estimate_dict = {
            "release_id": estimate.release_id,
            "name": new_name,
            "currency": estimate.currency,
            "status": EstimateStatus.DRAFT,
            "description": estimate.description,
            "attributes": estimate.attributes.copy() if estimate.attributes else {},
        }
        new_estimate = await self.estimate_repo.create(**new_estimate_dict)
        
        # Clone phases
        from app.db.repositories.estimate_phase_repository import EstimatePhaseRepository
        phase_repo = EstimatePhaseRepository(self.session)
        if estimate.phases:
            for phase in estimate.phases:
                await phase_repo.create(
                    quote_id=new_estimate.id,  # Database column name is still quote_id
                    name=phase.name,
                    start_date=phase.start_date,
                    end_date=phase.end_date,
                    color=phase.color,
                    row_order=phase.row_order,
                )
        
        # Clone line items
        if estimate.line_items:
            for line_item in estimate.line_items:
                new_line_item_dict = {
                    "quote_id": new_estimate.id,  # Database column name is still quote_id
                    "role_id": line_item.role_id,
                    "delivery_center_id": line_item.delivery_center_id,
                    "employee_id": line_item.employee_id,
                    "rate": line_item.rate,
                    "cost": line_item.cost,
                    "currency": line_item.currency,
                    "start_date": line_item.start_date,
                    "end_date": line_item.end_date,
                    "row_order": line_item.row_order,
                }
                new_line_item = await self.line_item_repo.create(**new_line_item_dict)
                
                # Clone weekly hours
                if line_item.weekly_hours:
                    for weekly_hour in line_item.weekly_hours:
                        await self.weekly_hours_repo.create(
                            quote_line_item_id=new_line_item.id,  # Database column name is still quote_line_item_id
                            week_start_date=weekly_hour.week_start_date,
                            hours=weekly_hour.hours,
                        )
        
        await self.session.commit()
        
        new_estimate = await self.estimate_repo.get_with_line_items(new_estimate.id)
        if not new_estimate:
            raise ValueError("Failed to retrieve cloned estimate")
        return self._to_detail_response(new_estimate)
    
    async def _get_default_rates(
        self,
        role_id: UUID,
        delivery_center_id: UUID,
        currency: str,
        employee_id: Optional[UUID] = None,
    ) -> Tuple[Decimal, Decimal]:
        """Get default rate and cost for a role/delivery center/currency combination.
        
        Priority:
        1. Employee rates (if employee_id provided)
        2. RoleRate for (role_id, delivery_center_id, currency)
        3. Role default rates
        
        Returns:
            Tuple of (rate, cost)
        """
        # If employee is provided, use employee rates
        if employee_id:
            employee = await self.employee_repo.get(employee_id)
            if employee:
                return Decimal(str(employee.external_bill_rate)), Decimal(str(employee.internal_cost_rate))
        
        # Try to get RoleRate
        result = await self.session.execute(
            select(RoleRate).where(
                and_(
                    RoleRate.role_id == role_id,
                    RoleRate.delivery_center_id == delivery_center_id,
                    RoleRate.currency == currency
                )
            )
        )
        role_rate = result.scalar_one_or_none()
        if role_rate:
            return Decimal(str(role_rate.external_rate)), Decimal(str(role_rate.internal_cost_rate))
        
        # Fallback to Role default rates
        role = await self.role_repo.get(role_id)
        if role:
            rate = Decimal(str(role.role_external_rate)) if role.role_external_rate else Decimal("0")
            cost = Decimal(str(role.role_internal_cost_rate)) if role.role_internal_cost_rate else Decimal("0")
            return rate, cost
        
        return Decimal("0"), Decimal("0")
    
    async def create_line_item(
        self,
        estimate_id: UUID,
        line_item_data: EstimateLineItemCreate,
    ) -> EstimateLineItemResponse:
        """Create a new line item with auto-defaulted rates."""
        estimate = await self.estimate_repo.get(estimate_id)
        if not estimate:
            raise ValueError("Estimate not found")
        
        # Get default rates if not provided
        rate = line_item_data.rate
        cost = line_item_data.cost
        
        if rate == 0 or cost == 0:
            default_rate, default_cost = await self._get_default_rates(
                line_item_data.role_id,
                line_item_data.delivery_center_id,
                line_item_data.currency or estimate.currency,
                line_item_data.employee_id,
            )
            if rate == 0:
                rate = default_rate
            if cost == 0:
                cost = default_cost
        
        # Get max row_order
        max_order = await self.line_item_repo.get_max_row_order(estimate_id)
        row_order = max_order + 1
        
        line_item_dict = line_item_data.model_dump(exclude_unset=True)
        line_item_dict["quote_id"] = estimate_id  # Database column name is still quote_id
        line_item_dict["rate"] = rate
        line_item_dict["cost"] = cost
        line_item_dict["currency"] = line_item_dict.get("currency") or estimate.currency
        line_item_dict["row_order"] = row_order
        
        line_item = await self.line_item_repo.create(**line_item_dict)
        await self.session.flush()  # Flush to get the line item ID
        
        # Sync to EmployeeRelease if employee is assigned
        if line_item.employee_id:
            await self._sync_line_item_to_employee_release(line_item, estimate.release_id)
        
        await self.session.commit()
        
        line_item = await self.line_item_repo.get(line_item.id)
        if not line_item:
            raise ValueError("Failed to retrieve created line item")
        return self._line_item_to_response(line_item)
    
    async def _sync_line_item_to_employee_release(self, line_item: EstimateLineItem, release_id: UUID) -> None:
        """Sync an estimate line item to EmployeeRelease association."""
        from app.models.association_models import EmployeeRelease
        
        if not line_item.employee_id:
            return  # No employee assigned, nothing to sync
        
        # Check if EmployeeRelease association already exists
        result = await self.session.execute(
            select(EmployeeRelease).where(
                EmployeeRelease.release_id == release_id,
                EmployeeRelease.employee_id == line_item.employee_id
            )
        )
        association = result.scalar_one_or_none()
        
        if association:
            # Update existing association with values from line item
            association.role_id = line_item.role_id
            association.start_date = line_item.start_date
            association.end_date = line_item.end_date
            association.project_rate = float(line_item.rate)  # Use rate as project_rate
            association.delivery_center_id = line_item.delivery_center_id
            logger.info(f"Updated EmployeeRelease: employee_id={line_item.employee_id}, release_id={release_id}")
        else:
            # Create new association
            association = EmployeeRelease(
                employee_id=line_item.employee_id,
                release_id=release_id,
                role_id=line_item.role_id,
                start_date=line_item.start_date,
                end_date=line_item.end_date,
                project_rate=float(line_item.rate),  # Use rate as project_rate
                delivery_center_id=line_item.delivery_center_id,
            )
            self.session.add(association)
            logger.info(f"Created EmployeeRelease: employee_id={line_item.employee_id}, release_id={release_id}")
    
    async def _sync_employee_with_release(self, estimate_id: UUID, employee_id: UUID) -> None:
        """Remove employee from release if they're no longer in any estimate line items."""
        from app.models.association_models import EmployeeRelease
        
        # Get the estimate to find the release
        estimate = await self.estimate_repo.get(estimate_id)
        if not estimate:
            return
        
        # Check if employee is still in any line items for this estimate
        line_items = await self.line_item_repo.list_by_estimate(estimate_id)
        employee_still_in_estimate = any(
            item.employee_id == employee_id for item in line_items if item.employee_id
        )
        
        if not employee_still_in_estimate:
            # Employee is no longer in any line items, remove from release
            logger.info(f"Employee {employee_id} no longer in estimate {estimate_id}, removing from release {estimate.release_id}")
            
            # Find and delete the EmployeeRelease association
            result = await self.session.execute(
                select(EmployeeRelease).where(
                    EmployeeRelease.release_id == estimate.release_id,
                    EmployeeRelease.employee_id == employee_id
                )
            )
            association = result.scalar_one_or_none()
            
            if association:
                await self.session.delete(association)
                await self.session.commit()
                logger.info(f"Removed employee {employee_id} from release {estimate.release_id}")
    
    async def update_line_item(
        self,
        estimate_id: UUID,
        line_item_id: UUID,
        line_item_data: EstimateLineItemUpdate,
    ) -> Optional[EstimateLineItemResponse]:
        """Update a line item."""
        line_item = await self.line_item_repo.get(line_item_id)
        if not line_item or line_item.quote_id != estimate_id:  # Database column name is still quote_id
            return None
        
        # Store old employee_id before update to check if we need to remove from release
        old_employee_id = line_item.employee_id
        
        update_dict = line_item_data.model_dump(exclude_unset=True)
        
        # Recalculate rates if role/delivery_center/employee changed
        if "role_id" in update_dict or "delivery_center_id" in update_dict or "employee_id" in update_dict:
            new_role_id = update_dict.get("role_id", line_item.role_id)
            new_dc_id = update_dict.get("delivery_center_id", line_item.delivery_center_id)
            new_employee_id = update_dict.get("employee_id", line_item.employee_id)
            new_currency = update_dict.get("currency", line_item.currency)
            
            default_rate, default_cost = await self._get_default_rates(
                new_role_id,
                new_dc_id,
                new_currency,
                new_employee_id,
            )
            
            # Only update if rates weren't explicitly provided
            if "rate" not in update_dict:
                update_dict["rate"] = default_rate
            if "cost" not in update_dict:
                update_dict["cost"] = default_cost
        
        updated = await self.line_item_repo.update(line_item_id, **update_dict)
        await self.session.flush()  # Flush to get updated values
        
        # Get the estimate to access release_id
        estimate = await self.estimate_repo.get(estimate_id)
        if not estimate:
            return None
        
        # Check if employee was removed or changed - if so, check if old employee should be removed from release
        new_employee_id = update_dict.get("employee_id", old_employee_id)
        if old_employee_id and old_employee_id != new_employee_id:
            await self._sync_employee_with_release(estimate_id, old_employee_id)
        
        # Sync to EmployeeRelease if employee is assigned (new or existing)
        if new_employee_id:
            updated_line_item = await self.line_item_repo.get(line_item_id)
            if updated_line_item:
                await self._sync_line_item_to_employee_release(updated_line_item, estimate.release_id)
        
        await self.session.commit()
        
        updated = await self.line_item_repo.get(line_item_id)
        if not updated:
            return None
        return self._line_item_to_response(updated)
    
    async def delete_line_item(self, estimate_id: UUID, line_item_id: UUID) -> bool:
        """Delete a line item."""
        logger.info(f"Attempting to delete line item {line_item_id} from estimate {estimate_id}")
        
        line_item = await self.line_item_repo.get(line_item_id)
        if not line_item:
            logger.warning(f"Line item {line_item_id} not found")
            return False
        
        if line_item.quote_id != estimate_id:  # Database column name is still quote_id
            logger.warning(f"Line item {line_item_id} belongs to estimate {line_item.quote_id}, not {estimate_id}")
            return False
        
        # Store employee_id before deletion to check if we need to remove from release
        employee_id_to_check = line_item.employee_id
        
        logger.info(f"Line item found, deleting weekly hours first")
        # Explicitly delete weekly hours first (cascade should handle this, but being explicit)
        deleted_hours_count = await self.weekly_hours_repo.delete_by_line_item(line_item_id)
        logger.info(f"Deleted {deleted_hours_count} weekly hours records")
        
        logger.info(f"Deleting line item {line_item_id}")
        deleted = await self.line_item_repo.delete(line_item_id)
        
        if deleted:
            logger.info(f"Line item {line_item_id} deleted successfully, committing transaction")
            await self.session.commit()
            logger.info(f"Transaction committed for line item {line_item_id}")
            
            # Check if employee should be removed from release
            if employee_id_to_check:
                await self._sync_employee_with_release(estimate_id, employee_id_to_check)
        else:
            logger.warning(f"Delete operation returned False for line item {line_item_id}")
            await self.session.rollback()
        
        return deleted
    
    async def auto_fill_hours(
        self,
        estimate_id: UUID,
        line_item_id: UUID,
        auto_fill_data: AutoFillRequest,
    ) -> List[EstimateLineItemResponse]:
        """Auto-fill weekly hours for a line item based on pattern."""
        line_item = await self.line_item_repo.get(line_item_id)
        if not line_item or line_item.quote_id != estimate_id:  # Database column name is still quote_id
            raise ValueError("Line item not found")
        
        # Generate weeks between start_date and end_date
        weeks = self._generate_weeks(line_item.start_date, line_item.end_date)
        
        # Calculate hours based on pattern
        hours_by_week = {}
        if auto_fill_data.pattern == AutoFillPattern.UNIFORM:
            hours_per_week = auto_fill_data.hours_per_week or Decimal("0")
            for week_start in weeks:
                hours_by_week[week_start] = hours_per_week
        
        elif auto_fill_data.pattern in [AutoFillPattern.RAMP_UP, AutoFillPattern.RAMP_DOWN]:
            start_hours = auto_fill_data.start_hours or Decimal("0")
            end_hours = auto_fill_data.end_hours or Decimal("0")
            num_weeks = len(weeks)
            
            for i, week_start in enumerate(weeks):
                if num_weeks == 1:
                    hours_by_week[week_start] = start_hours
                else:
                    if auto_fill_data.pattern == AutoFillPattern.RAMP_UP:
                        # Linear increase from start to end
                        ratio = Decimal(str(i)) / Decimal(str(num_weeks - 1))
                        hours_by_week[week_start] = start_hours + (end_hours - start_hours) * ratio
                    else:  # RAMP_DOWN
                        # Linear decrease from start to end
                        ratio = Decimal(str(i)) / Decimal(str(num_weeks - 1))
                        hours_by_week[week_start] = start_hours - (start_hours - end_hours) * ratio
        
        elif auto_fill_data.pattern == AutoFillPattern.CUSTOM:
            if auto_fill_data.custom_hours:
                for week_str, hours in auto_fill_data.custom_hours.items():
                    week_start = date.fromisoformat(week_str)
                    hours_by_week[week_start] = Decimal(str(hours))
        
        # Create or update weekly hours
        weekly_hours_list = []
        for week_start, hours in hours_by_week.items():
            weekly_hour = await self.weekly_hours_repo.create(
                quote_line_item_id=line_item_id,
                week_start_date=week_start,
                hours=hours,
            )
            weekly_hours_list.append(weekly_hour)
        
        await self.session.commit()
        
        # Reload and return the updated line item
        updated_line_item = await self.line_item_repo.get_with_weekly_hours(line_item_id)
        if updated_line_item:
            return [self._line_item_to_response(updated_line_item)]
        return []
    
    def _generate_weeks(self, start_date: date, end_date: date) -> List[date]:
        """Generate list of week start dates (Mondays) between start and end dates."""
        weeks = []
        current = self._get_week_start(start_date)
        end_week_start = self._get_week_start(end_date)
        
        while current <= end_week_start:
            weeks.append(current)
            current += timedelta(days=7)
        
        return weeks
    
    def _get_week_start(self, d: date) -> date:
        """Get the Monday (week start) for a given date."""
        days_since_monday = d.weekday()
        return d - timedelta(days=days_since_monday)
    
    async def calculate_totals(self, estimate_id: UUID) -> EstimateTotalsResponse:
        """Calculate totals for an estimate."""
        estimate = await self.estimate_repo.get_with_line_items(estimate_id)
        if not estimate:
            raise ValueError("Estimate not found")
        
        weekly_totals_dict: Dict[date, Dict[str, Decimal]] = {}
        role_totals_dict: Dict[UUID, Dict[str, Decimal]] = {}
        
        overall_total_hours = Decimal("0")
        overall_total_cost = Decimal("0")
        overall_total_revenue = Decimal("0")
        
        for line_item in estimate.line_items:
            role_id = line_item.role_id
            rate = Decimal(str(line_item.rate))
            cost_rate = Decimal(str(line_item.cost))
            
            # Initialize role totals if needed
            if role_id not in role_totals_dict:
                role_totals_dict[role_id] = {
                    "hours": Decimal("0"),
                    "cost": Decimal("0"),
                    "revenue": Decimal("0"),
                }
            
            # Process weekly hours
            if line_item.weekly_hours:
                for weekly_hour in line_item.weekly_hours:
                    week_start = weekly_hour.week_start_date
                    hours = Decimal(str(weekly_hour.hours))
                    
                    # Initialize week totals if needed
                    if week_start not in weekly_totals_dict:
                        weekly_totals_dict[week_start] = {
                            "hours": Decimal("0"),
                            "cost": Decimal("0"),
                            "revenue": Decimal("0"),
                        }
                    
                    # Calculate values
                    week_cost = hours * cost_rate
                    week_revenue = hours * rate
                    
                    # Update week totals
                    weekly_totals_dict[week_start]["hours"] += hours
                    weekly_totals_dict[week_start]["cost"] += week_cost
                    weekly_totals_dict[week_start]["revenue"] += week_revenue
                    
                    # Update role totals
                    role_totals_dict[role_id]["hours"] += hours
                    role_totals_dict[role_id]["cost"] += week_cost
                    role_totals_dict[role_id]["revenue"] += week_revenue
                    
                    # Update overall totals
                    overall_total_hours += hours
                    overall_total_cost += week_cost
                    overall_total_revenue += week_revenue
        
        # Build weekly totals list
        weekly_totals = [
            WeeklyTotal(
                week_start_date=week_start,
                total_hours=week_data["hours"],
                total_cost=week_data["cost"],
                total_revenue=week_data["revenue"],
            )
            for week_start, week_data in sorted(weekly_totals_dict.items())
        ]
        
        # Build monthly totals
        monthly_totals_dict: Dict[Tuple[int, int], Dict[str, Decimal]] = {}
        for weekly_total in weekly_totals:
            year = weekly_total.week_start_date.year
            month = weekly_total.week_start_date.month
            key = (year, month)
            
            if key not in monthly_totals_dict:
                monthly_totals_dict[key] = {
                    "hours": Decimal("0"),
                    "cost": Decimal("0"),
                    "revenue": Decimal("0"),
                }
            
            monthly_totals_dict[key]["hours"] += weekly_total.total_hours
            monthly_totals_dict[key]["cost"] += weekly_total.total_cost
            monthly_totals_dict[key]["revenue"] += weekly_total.total_revenue
        
        monthly_totals = [
            MonthlyTotal(
                year=year,
                month=month,
                total_hours=month_data["hours"],
                total_cost=month_data["cost"],
                total_revenue=month_data["revenue"],
            )
            for (year, month), month_data in sorted(monthly_totals_dict.items())
        ]
        
        # Build role totals list
        role_totals = []
        for role_id, role_data in role_totals_dict.items():
            role = await self.role_repo.get(role_id)
            role_name = role.role_name if role else "Unknown"
            
            role_totals.append(
                RoleTotal(
                    role_id=role_id,
                    role_name=role_name,
                    total_hours=role_data["hours"],
                    total_cost=role_data["cost"],
                    total_revenue=role_data["revenue"],
                )
            )
        
        return EstimateTotalsResponse(
            quote_id=estimate_id,  # Schema field name is still quote_id for database compatibility
            weekly_totals=weekly_totals,
            monthly_totals=monthly_totals,
            role_totals=role_totals,
            overall_total_hours=overall_total_hours,
            overall_total_cost=overall_total_cost,
            overall_total_revenue=overall_total_revenue,
        )
    
    def _to_response(self, estimate: Estimate, include_line_items: bool = False) -> EstimateResponse:
        """Convert estimate model to response schema."""
        from sqlalchemy import inspect
        
        inspector = inspect(estimate)
        
        # Safely get release name if loaded
        release_name = None
        engagement_id = None
        engagement_name = None
        try:
            if inspector.attrs.release.loaded_value is not None:
                release = inspector.attrs.release.loaded_value
                if release:
                    release_name = release.name
                    # Check if engagement is loaded on release
                    release_inspector = inspect(release)
                    if release_inspector.attrs.engagement.loaded_value is not None:
                        engagement = release_inspector.attrs.engagement.loaded_value
                        if engagement:
                            engagement_id = engagement.id
                            engagement_name = engagement.name
        except (AttributeError, KeyError):
            pass
        
        # Safely get created_by_employee name if loaded
        created_by_name = None
        try:
            if inspector.attrs.created_by_employee.loaded_value is not None:
                emp = inspector.attrs.created_by_employee.loaded_value
                if emp:
                    created_by_name = f"{emp.first_name} {emp.last_name}"
        except (AttributeError, KeyError):
            pass
        
        # Safely get phases if loaded
        phases_list = []
        try:
            phases_attr = inspector.attrs.get("phases")
            if phases_attr and phases_attr.loaded_value is not None:
                phases_list = [self._phase_to_response(p) for p in phases_attr.loaded_value]
        except (AttributeError, KeyError, TypeError):
            pass
        
        estimate_dict = {
            "id": estimate.id,
            "release_id": estimate.release_id,
            "name": estimate.name,
            "currency": estimate.currency,
            "status": estimate.status,
            "description": estimate.description,
            "phases": phases_list,
            "attributes": estimate.attributes or {},
            "release_name": release_name,
            "engagement_id": engagement_id,
            "engagement_name": engagement_name,
            "created_by": estimate.created_by,
            "created_by_name": created_by_name,
        }
        
        if include_line_items:
            # Safely get line_items if loaded
            estimate_dict["line_items"] = []
            try:
                # Check if line_items relationship is loaded
                line_items_attr = inspector.attrs.get("line_items")
                if line_items_attr and line_items_attr.loaded_value is not None:
                    line_items_list = line_items_attr.loaded_value
                    if line_items_list:
                        # Ensure we're iterating over EstimateLineItem objects, not weekly_hours
                        estimate_dict["line_items"] = [
                            self._line_item_to_response(li) 
                            for li in line_items_list 
                            if isinstance(li, EstimateLineItem)
                        ]
            except (AttributeError, KeyError, TypeError):
                pass
        
        return EstimateResponse.model_validate(estimate_dict)
    
    def _to_detail_response(self, quote: Estimate) -> EstimateDetailResponse:
        """Convert quote model to detailed response schema."""
        response_dict = self._to_response(quote, include_line_items=True).model_dump()
        # Ensure line_items is always a list, not None
        if response_dict.get("line_items") is None:
            response_dict["line_items"] = []
        return EstimateDetailResponse.model_validate(response_dict)
    
    def _line_item_to_response(self, line_item: EstimateLineItem) -> EstimateLineItemResponse:
        """Convert line item model to response schema."""
        from sqlalchemy import inspect
        
        inspector = inspect(line_item)
        
        # Safely get role name if loaded
        role_name = None
        try:
            if inspector.attrs.role.loaded_value is not None:
                role = inspector.attrs.role.loaded_value
                if role:
                    role_name = role.role_name
        except (AttributeError, KeyError):
            pass
        
        # Safely get delivery center name if loaded
        delivery_center_name = None
        try:
            if inspector.attrs.delivery_center.loaded_value is not None:
                dc = inspector.attrs.delivery_center.loaded_value
                if dc:
                    delivery_center_name = dc.name
        except (AttributeError, KeyError):
            pass
        
        # Safely get employee name if loaded
        employee_name = None
        try:
            if inspector.attrs.employee.loaded_value is not None:
                emp = inspector.attrs.employee.loaded_value
                if emp:
                    employee_name = f"{emp.first_name} {emp.last_name}"
        except (AttributeError, KeyError):
            pass
        
        # CRITICAL FIX: Use exact same approach as Release/Engagement services
        # Release service does: assoc.start_date.isoformat() directly on the date object
        # We must do the same - call .isoformat() directly on line_item.start_date
        # This ensures dates match exactly between Release/Engagement and Estimate pages
        
        logger.info(f"  === RETRIEVING FROM DB (FOR RESPONSE) ===")
        logger.info(f"  line_item.start_date = {line_item.start_date} (type: {type(line_item.start_date)})")
        logger.info(f"  line_item.end_date = {line_item.end_date} (type: {type(line_item.end_date)})")
        
        # Extract date part - if datetime, get date() first, then isoformat()
        # If date, call isoformat() directly (same as Release service)
        if isinstance(line_item.start_date, datetime):
            # If datetime, get date part first, then isoformat
            start_date_iso = line_item.start_date.date().isoformat()
            logger.warning(f"  start_date was datetime! date()={line_item.start_date.date()}, isoformat={start_date_iso}")
        elif isinstance(line_item.start_date, date):
            # Pure date object - call isoformat() directly (same as Release service)
            start_date_iso = line_item.start_date.isoformat()
            logger.info(f"  start_date.isoformat() = {start_date_iso}")
        else:
            # String - extract date part
            start_date_iso = str(line_item.start_date).split("T")[0].split(" ")[0]
        
        if isinstance(line_item.end_date, datetime):
            end_date_iso = line_item.end_date.date().isoformat()
            logger.warning(f"  end_date was datetime! date()={line_item.end_date.date()}, isoformat={end_date_iso}")
        elif isinstance(line_item.end_date, date):
            # Pure date object - call isoformat() directly (same as Release service)
            end_date_iso = line_item.end_date.isoformat()
            logger.info(f"  end_date.isoformat() = {end_date_iso}")
        else:
            end_date_iso = str(line_item.end_date).split("T")[0].split(" ")[0]
        
        logger.info(f"  === SERIALIZATION ===")
        logger.info(f"  Final ISO strings: start_date={start_date_iso}, end_date={end_date_iso}")
        
        # Serialize dates directly as ISO strings (EXACTLY like Release/Engagement services)
        # Release service: "start_date": assoc.start_date.isoformat() if assoc.start_date else None
        line_item_dict = {
            "id": line_item.id,
            "quote_id": line_item.quote_id,
            "role_id": line_item.role_id,
            "delivery_center_id": line_item.delivery_center_id,
            "employee_id": line_item.employee_id,
            "rate": line_item.rate,
            "cost": line_item.cost,
            "currency": line_item.currency,
            "start_date": start_date_iso,  # ISO string (same as Release service)
            "end_date": end_date_iso,  # ISO string (same as Release service)
            "row_order": line_item.row_order,
            "role_name": role_name,
            "delivery_center_name": delivery_center_name,
            "employee_name": employee_name,
        }
        
        # Safely get weekly hours if loaded
        try:
            weekly_hours_attr = inspector.attrs.get("weekly_hours")
            if weekly_hours_attr and weekly_hours_attr.loaded_value is not None:
                weekly_hours_list = weekly_hours_attr.loaded_value
                if weekly_hours_list:
                    # Build dicts directly, serializing dates as ISO strings (same as Release service)
                    line_item_dict["weekly_hours"] = [
                        {
                            "id": wh.id,
                            "week_start_date": wh.week_start_date.isoformat() if isinstance(wh.week_start_date, date) else str(wh.week_start_date).split("T")[0],
                            "hours": wh.hours,
                        }
                        for wh in weekly_hours_list
                        if isinstance(wh, EstimateWeeklyHours)
                    ]
        except (AttributeError, KeyError, TypeError):
            pass
        
        logger.info(f"  === BEFORE PYDANTIC ===")
        logger.info(f"  Dict start_date = {line_item_dict.get('start_date')} (type: {type(line_item_dict.get('start_date'))})")
        logger.info(f"  Dict end_date = {line_item_dict.get('end_date')} (type: {type(line_item_dict.get('end_date'))})")
        
        # Validate and serialize the response
        response = EstimateLineItemResponse.model_validate(line_item_dict)
        
        logger.info(f"  === AFTER PYDANTIC ===")
        logger.info(f"  Response start_date = {response.start_date} (type: {type(response.start_date)})")
        logger.info(f"  Response end_date = {response.end_date} (type: {type(response.end_date)})")
        logger.info(f"  Response model_dump() start_date = {response.model_dump().get('start_date')}")
        logger.info(f"  Response model_dump() end_date = {response.model_dump().get('end_date')}")
        
        return response
    
    def _weekly_hours_to_response(self, weekly_hours: EstimateWeeklyHours) -> EstimateWeeklyHoursResponse:
        """Convert weekly hours model to response schema."""
        return EstimateWeeklyHoursResponse.model_validate({
            "id": weekly_hours.id,
            "week_start_date": weekly_hours.week_start_date,
            "hours": weekly_hours.hours,
        })
    
    def _phase_to_response(self, phase) -> EstimatePhaseResponse:
        """Convert EstimatePhase model to EstimatePhaseResponse."""
        from app.models.estimate import EstimatePhase
        return EstimatePhaseResponse.model_validate({
            "id": phase.id,
            "quote_id": phase.quote_id,
            "name": phase.name,
            "start_date": phase.start_date,
            "end_date": phase.end_date,
            "color": phase.color,
            "row_order": phase.row_order,
        })


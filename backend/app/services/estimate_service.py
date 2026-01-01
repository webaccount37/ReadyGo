"""
Estimate service with business logic.
"""

import logging
import re
from typing import List, Optional, Tuple, Dict
from uuid import UUID
from datetime import date, timedelta, datetime
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update

logger = logging.getLogger(__name__)

from app.services.base_service import BaseService
from app.db.repositories.estimate_repository import EstimateRepository
from app.db.repositories.estimate_line_item_repository import EstimateLineItemRepository
from app.db.repositories.estimate_weekly_hours_repository import EstimateWeeklyHoursRepository
from app.db.repositories.role_rate_repository import RoleRateRepository
from app.db.repositories.role_repository import RoleRepository
from app.db.repositories.employee_repository import EmployeeRepository
from app.db.repositories.engagement_repository import EngagementRepository
from app.models.estimate import Estimate, EstimateLineItem, EstimateWeeklyHours
from app.models.role_rate import RoleRate
from app.models.role import Role
from app.models.employee import Employee
from app.utils.currency_converter import convert_to_usd, get_conversion_rate_to_usd, convert_currency
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
        self.engagement_repo = EngagementRepository(session)
    
    async def create_estimate(self, estimate_data: EstimateCreate) -> EstimateResponse:
        """Create a new estimate."""
        # Get engagement to check for existing active estimate
        engagement = await self.engagement_repo.get(estimate_data.engagement_id)
        if not engagement:
            raise ValueError("Engagement not found")
        
        estimate_dict = estimate_data.model_dump(exclude_unset=True)
        
        # Auto-generate version name if name is "NEW", empty, or None
        name = estimate_dict.get("name")
        if not name or name.strip() == "" or name == "NEW":
            # Get all existing estimates for this engagement to find the highest version number
            existing_estimates = await self.estimate_repo.list_by_engagement(
                engagement_id=estimate_data.engagement_id,
                skip=0,
                limit=1000  # Get all estimates
            )
            
            # Extract version numbers from existing estimate names
            version_numbers = []
            for est in existing_estimates:
                # Match "VERSION X" pattern (case insensitive, with optional whitespace)
                match = re.search(r'VERSION\s+(\d+)', est.name, re.IGNORECASE)
                if match:
                    version_numbers.append(int(match.group(1)))
            
            # Find the next available version number
            if version_numbers:
                next_version = max(version_numbers) + 1
            else:
                # No existing VERSION estimates, start at 2 (since INITIAL is typically 1)
                # But check if INITIAL exists - if so, start at 2, otherwise start at 1
                has_initial = any(est.name.upper() == "INITIAL" for est in existing_estimates)
                next_version = 2 if has_initial else 1
            
            estimate_dict["name"] = f"VERSION {next_version}"
        
        # Set active_version based on whether there's already an active estimate
        # If this is the first estimate or explicitly set, use the provided value
        # Otherwise, ensure only one active estimate per engagement
        if estimate_dict.get("active_version", False):
            # If setting this as active, deactivate all other estimates for this engagement
            await self._deactivate_other_estimates(estimate_data.engagement_id)
        else:
            # Check if there's already an active estimate
            existing_active = await self._get_active_estimate(estimate_data.engagement_id)
            if not existing_active:
                # No active estimate exists, make this one active by default
                estimate_dict["active_version"] = True
        
        estimate = await self.estimate_repo.create(**estimate_dict)
        await self.session.flush()  # Flush to get estimate.id
        
        # Create default line items from active estimate if one exists
        active_estimate = await self._get_active_estimate(estimate_data.engagement_id)
        if active_estimate and active_estimate.id != estimate.id:
            # Copy line items from active estimate
            active_line_items = await self.line_item_repo.list_by_estimate(active_estimate.id)
            logger.info(f"Copying {len(active_line_items)} line items from active estimate {active_estimate.id} to new estimate {estimate.id}")
            row_order = 0
            
            for active_li in active_line_items:
                # Copy line item from active estimate
                line_item_dict = {
                    "estimate_id": estimate.id,
                    "role_rates_id": active_li.role_rates_id,
                    "employee_id": active_li.employee_id,
                    "rate": active_li.rate,
                    "cost": active_li.cost,
                    "currency": active_li.currency,
                    "start_date": active_li.start_date,
                    "end_date": active_li.end_date,
                    "row_order": row_order,
                    "billable_expense_percentage": active_li.billable_expense_percentage,
                }
                
                line_item = await self.line_item_repo.create(**line_item_dict)
                await self.session.flush()
                
                # Copy weekly hours if they exist
                if active_li.weekly_hours:
                    from app.db.repositories.estimate_weekly_hours_repository import EstimateWeeklyHoursRepository
                    weekly_hours_repo = EstimateWeeklyHoursRepository(self.session)
                    for wh in active_li.weekly_hours:
                        await weekly_hours_repo.create(
                            estimate_line_item_id=line_item.id,
                            week_start_date=wh.week_start_date,
                            hours=wh.hours,
                        )
                
                row_order += 1
            
            logger.info(f"Copied {row_order} line items from active estimate")
        
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
                logger.info(f"  Line item {li.id}: employee_id={li.employee_id}, role_rates_id={li.role_rates_id}")
        
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
        engagement_id: Optional[UUID] = None,
    ) -> Tuple[List[EstimateResponse], int]:
        """List estimates with optional filters."""
        filters = {}
        if engagement_id:
            filters["engagement_id"] = engagement_id
        
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
        
        # Handle active_version changes - ensure only one active estimate per engagement
        if "active_version" in update_dict and update_dict["active_version"]:
            await self._deactivate_other_estimates(estimate.engagement_id)
        
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
    
    async def set_active_version(self, estimate_id: UUID) -> Optional[EstimateResponse]:
        """Set an estimate as the active version for its engagement."""
        estimate = await self.estimate_repo.get(estimate_id)
        if not estimate:
            return None
        
        # Deactivate all other estimates for this engagement
        await self._deactivate_other_estimates(estimate.engagement_id)
        
        # Set this estimate as active
        updated = await self.estimate_repo.update(estimate_id, active_version=True)
        await self.session.commit()
        
        updated = await self.estimate_repo.get(estimate_id)
        if not updated:
            return None
        return self._to_response(updated, include_line_items=False)
    
    async def clone_estimate(self, estimate_id: UUID, new_name: Optional[str] = None) -> EstimateResponse:
        """Clone an estimate to create a variation."""
        estimate = await self.estimate_repo.get_with_line_items(estimate_id)
        if not estimate:
            raise ValueError("Estimate not found")
        
        # Auto-generate version name if not provided
        if not new_name:
            # Get all existing estimates for this engagement to find the highest version number
            existing_estimates = await self.estimate_repo.list_by_engagement(
                engagement_id=estimate.engagement_id,
                skip=0,
                limit=1000  # Get all estimates
            )
            
            # Extract version numbers from existing estimate names
            version_numbers = []
            for est in existing_estimates:
                # Match "VERSION X" pattern (case insensitive, with optional whitespace)
                match = re.search(r'VERSION\s+(\d+)', est.name, re.IGNORECASE)
                if match:
                    version_numbers.append(int(match.group(1)))
            
            # Find the next available version number
            if version_numbers:
                next_version = max(version_numbers) + 1
            else:
                # No existing VERSION estimates, start at 2 (since INITIAL is typically 1)
                # But check if INITIAL exists - if so, start at 2, otherwise start at 1
                has_initial = any(est.name.upper() == "INITIAL" for est in existing_estimates)
                next_version = 2 if has_initial else 1
            
            new_name = f"VERSION {next_version}"
        
        # Create new estimate
        new_estimate_dict = {
            "engagement_id": estimate.engagement_id,
            "name": new_name,
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
                    estimate_id=new_estimate.id,
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
                    "estimate_id": new_estimate.id,
                    "role_rates_id": line_item.role_rates_id,
                    "employee_id": line_item.employee_id,
                    "rate": line_item.rate,
                    "cost": line_item.cost,
                    "currency": line_item.currency,
                    "start_date": line_item.start_date,
                    "end_date": line_item.end_date,
                    "row_order": line_item.row_order,
                    "billable": line_item.billable,
                    "billable_expense_percentage": line_item.billable_expense_percentage,
                }
                new_line_item = await self.line_item_repo.create(**new_line_item_dict)
                
                # Clone weekly hours
                if line_item.weekly_hours:
                    for weekly_hour in line_item.weekly_hours:
                        await self.weekly_hours_repo.create(
                            estimate_line_item_id=new_line_item.id,
                            week_start_date=weekly_hour.week_start_date,
                            hours=weekly_hour.hours,
                        )
        
        await self.session.commit()
        
        new_estimate = await self.estimate_repo.get_with_line_items(new_estimate.id)
        if not new_estimate:
            raise ValueError("Failed to retrieve cloned estimate")
        return self._to_detail_response(new_estimate)
    
    async def _get_default_rates_from_role_rate(
        self,
        role_rates_id: UUID,
        employee_id: Optional[UUID] = None,
        target_currency: Optional[str] = None,
    ) -> Tuple[Decimal, Decimal]:
        """Get default rate and cost from a role_rate.
        
        Priority:
        1. Employee rates (if employee_id provided) - only cost, NOT rate
        2. RoleRate rates
        
        Args:
            role_rates_id: ID of the role_rate to use for rate lookup
            employee_id: Optional employee ID - if provided, only cost is taken from employee
            target_currency: Target currency for conversion (if different from employee/role_rate currency)
        
        Returns:
            Tuple of (rate, cost)
        """
        # Get RoleRate first to get the rate
        role_rate = await self.role_rate_repo.get(role_rates_id)
        if not role_rate:
            return Decimal("0"), Decimal("0")
        
        # Rate always comes from RoleRate (not employee)
        rate = Decimal(str(role_rate.external_rate))
        cost = Decimal(str(role_rate.internal_cost_rate))
        rate_currency = role_rate.default_currency
        
        # If employee is provided, use employee cost (but NOT rate)
        if employee_id:
            employee = await self.employee_repo.get(employee_id)
            if employee:
                employee_cost = Decimal(str(employee.internal_cost_rate))
                employee_currency = employee.default_currency or "USD"
                
                # Convert employee cost to target currency if needed
                if target_currency and employee_currency.upper() != target_currency.upper():
                    employee_cost_decimal = await convert_currency(
                        float(employee_cost),
                        employee_currency,
                        target_currency,
                        self.session
                    )
                    cost = Decimal(str(employee_cost_decimal))
                else:
                    # If no target currency or same currency, use employee cost as-is
                    cost = employee_cost
                    # But if target_currency is provided and different from employee_currency,
                    # we already converted above
                
                # Rate stays from RoleRate (not updated from employee)
        
        # Convert rate to target currency if needed (only if we didn't already convert cost from employee)
        if target_currency and rate_currency.upper() != target_currency.upper():
            rate = Decimal(str(await convert_currency(float(rate), rate_currency, target_currency, self.session)))
            # Only convert cost if it came from role_rate (not employee)
            if not employee_id:
                cost = Decimal(str(await convert_currency(float(cost), rate_currency, target_currency, self.session)))
        
        return rate, cost
    
    async def _get_active_estimate(self, engagement_id: UUID) -> Optional[Estimate]:
        """Get the active estimate for an engagement."""
        result = await self.session.execute(
            select(Estimate).where(
                and_(
                    Estimate.engagement_id == engagement_id,
                    Estimate.active_version == True
                )
            )
        )
        return result.scalar_one_or_none()
    
    async def _deactivate_other_estimates(self, engagement_id: UUID) -> None:
        """Deactivate all estimates for an engagement except the current one being created."""
        await self.session.execute(
            update(Estimate)
            .where(
                and_(
                    Estimate.engagement_id == engagement_id,
                    Estimate.active_version == True
                )
            )
            .values(active_version=False)
        )
        await self.session.flush()
    
    async def create_line_item(
        self,
        estimate_id: UUID,
        line_item_data: EstimateLineItemCreate,
    ) -> EstimateLineItemResponse:
        """Create a new line item with auto-defaulted rates."""
        estimate = await self.estimate_repo.get(estimate_id)
        if not estimate:
            raise ValueError("Estimate not found")
        
        # Get engagement to get currency
        engagement = await self.engagement_repo.get(estimate.engagement_id)
        if not engagement:
            raise ValueError("Engagement not found")
        
        # Convert role_id + delivery_center_id to role_rates_id if needed
        role_rates_id = line_item_data.role_rates_id
        if not role_rates_id and line_item_data.role_id and line_item_data.delivery_center_id:
            # Get or create role rate - use currency from engagement
            currency = line_item_data.currency or engagement.default_currency
            role_rate = await self._get_or_create_role_rate(
                line_item_data.role_id,
                line_item_data.delivery_center_id,
                currency
            )
            role_rates_id = role_rate.id
        elif not role_rates_id:
            raise ValueError("Either role_rates_id OR (role_id + delivery_center_id) must be provided")
        
        # Get default rates if not provided
        rate = line_item_data.rate
        cost = line_item_data.cost
        
        if rate == 0 or cost == 0:
            default_rate, default_cost = await self._get_default_rates_from_role_rate(
                role_rates_id,
                line_item_data.employee_id,
                target_currency=currency,  # Pass currency for conversion
            )
            if rate == 0:
                rate = default_rate
            if cost == 0:
                cost = default_cost
        
        # Get max row_order
        max_order = await self.line_item_repo.get_max_row_order(estimate_id)
        row_order = max_order + 1
        
        line_item_dict = {
            "estimate_id": estimate_id,
            "role_rates_id": role_rates_id,
            "employee_id": line_item_data.employee_id,
            "rate": rate,
            "cost": cost,
            "currency": line_item_data.currency or engagement.default_currency,
            "start_date": line_item_data.start_date,
            "end_date": line_item_data.end_date,
            "row_order": row_order,
            "billable": getattr(line_item_data, 'billable', True),
            "billable_expense_percentage": getattr(line_item_data, 'billable_expense_percentage', 0),
        }
        
        line_item = await self.line_item_repo.create(**line_item_dict)
        await self.session.flush()  # Flush to get the line item ID
        
        await self.session.commit()
        
        line_item = await self.line_item_repo.get(line_item.id)
        if not line_item:
            raise ValueError("Failed to retrieve created line item")
        return self._line_item_to_response(line_item)
    
    async def _get_or_create_role_rate(self, role_id: UUID, delivery_center_id: UUID, currency: str) -> RoleRate:
        """Get or create a role rate for the given role, delivery center, and currency."""
        result = await self.session.execute(
            select(RoleRate).where(
                and_(
                    RoleRate.role_id == role_id,
                    RoleRate.delivery_center_id == delivery_center_id,
                    RoleRate.default_currency == currency
                )
            )
        )
        role_rate = result.scalar_one_or_none()
        if role_rate:
            return role_rate
        
        # Create a new role rate with default values
        role_rate = RoleRate(
            role_id=role_id,
            delivery_center_id=delivery_center_id,
            default_currency=currency,
            internal_cost_rate=0.0,
            external_rate=0.0
        )
        self.session.add(role_rate)
        await self.session.flush()
        return role_rate
    
    
    async def update_line_item(
        self,
        estimate_id: UUID,
        line_item_id: UUID,
        line_item_data: EstimateLineItemUpdate,
    ) -> Optional[EstimateLineItemResponse]:
        """Update a line item."""
        line_item = await self.line_item_repo.get(line_item_id)
        if not line_item or line_item.estimate_id != estimate_id:
            return None
        
        update_dict = line_item_data.model_dump(exclude_unset=True)
        
        # Handle role_id updates - use Engagement Invoice Center (not Payable Center) for role_rate lookup
        if "role_id" in update_dict:
            # Get currency and engagement delivery center (Invoice Center) for role_rate lookup
            estimate = await self.estimate_repo.get(estimate_id)
            engagement = await self.engagement_repo.get(estimate.engagement_id) if estimate else None
            currency = update_dict.get("currency") or line_item.currency or (engagement.default_currency if engagement else "USD")
            
            # Use Engagement Invoice Center (delivery_center_id) for role_rate lookup, NOT Payable Center
            engagement_delivery_center_id = engagement.delivery_center_id if engagement else None
            if not engagement_delivery_center_id:
                raise ValueError("Engagement Invoice Center (delivery_center_id) is required for role rate lookup")
            
            role_rate = await self._get_or_create_role_rate(
                update_dict["role_id"],
                engagement_delivery_center_id,  # Use Engagement Invoice Center, not Payable Center
                currency
            )
            update_dict["role_rates_id"] = role_rate.id
            # Remove role_id from update_dict as it's not in the model
            update_dict.pop("role_id", None)
        
        # Handle delivery_center_id (Payable Center) updates - this is independent and doesn't affect role_rate
        # Note: delivery_center_id is not stored in EstimateLineItem model, it's derived from role_rate
        # So updating Payable Center means we need to find/create a role_rate with the new delivery center
        # BUT we should use the current role_id and Engagement Invoice Center for the lookup
        if "delivery_center_id" in update_dict and "role_id" not in update_dict:
            # Payable Center update - get current role_id from existing role_rate
            if not line_item.role_rate or not line_item.role_rate.role:
                raise ValueError("Cannot update Payable Center: role information not found")
            
            current_role_id = line_item.role_rate.role.id
            # Get currency and engagement delivery center
            estimate = await self.estimate_repo.get(estimate_id)
            engagement = await self.engagement_repo.get(estimate.engagement_id) if estimate else None
            currency = update_dict.get("currency") or line_item.currency or (engagement.default_currency if engagement else "USD")
            
            # Create/find role_rate with: current role_id + new Payable Center + currency
            # Note: This changes which role_rate is used, but the Role Rate lookup for Cost/Rate
            # should still use Role ID + Engagement Invoice Center (not Payable Center)
            role_rate = await self._get_or_create_role_rate(
                current_role_id,
                update_dict["delivery_center_id"],  # New Payable Center
                currency
            )
            update_dict["role_rates_id"] = role_rate.id
            # Remove delivery_center_id from update_dict as it's not in the model
            update_dict.pop("delivery_center_id", None)
        
        # Recalculate rates if role_rates_id/employee changed
        # BUT: Rate lookup should use Role ID + Engagement Invoice Center (not Payable Center from role_rate)
        if "role_rates_id" in update_dict or "employee_id" in update_dict or "role_id" in update_dict:
            # Get the role_id (either from update or existing)
            if "role_id" in update_dict:
                # role_id was already processed above and removed from update_dict
                # Get it from the role_rate we just set
                new_role_rates_id = update_dict.get("role_rates_id", line_item.role_rates_id)
                role_rate_for_lookup = await self.role_rate_repo.get(new_role_rates_id)
                new_role_id = role_rate_for_lookup.role_id if role_rate_for_lookup else None
            else:
                # Use existing role_id from current role_rate
                if line_item.role_rate and line_item.role_rate.role:
                    new_role_id = line_item.role_rate.role.id
                else:
                    new_role_id = None
            
            new_employee_id = update_dict.get("employee_id", line_item.employee_id)
            
            # For rate lookup, use Role ID + Engagement Invoice Center (not Payable Center)
            if new_role_id:
                estimate = await self.estimate_repo.get(estimate_id)
                engagement = await self.engagement_repo.get(estimate.engagement_id) if estimate else None
                engagement_delivery_center_id = engagement.delivery_center_id if engagement else None
                currency = update_dict.get("currency") or line_item.currency or (engagement.default_currency if engagement else "USD")
                
                if engagement_delivery_center_id:
                    # Get role_rate using Role ID + Engagement Invoice Center for rate lookup
                    role_rate_for_rates = await self._get_or_create_role_rate(
                        new_role_id,
                        engagement_delivery_center_id,  # Use Engagement Invoice Center for rate lookup
                        currency
                    )
                    default_rate, default_cost = await self._get_default_rates_from_role_rate(
                        role_rate_for_rates.id,  # Use role_rate with Engagement Invoice Center
                        new_employee_id,
                        target_currency=currency,  # Pass currency for conversion
                    )
                else:
                    # Fallback to using the role_rates_id directly if no engagement delivery center
                    default_rate, default_cost = await self._get_default_rates_from_role_rate(
                        update_dict.get("role_rates_id", line_item.role_rates_id),
                        new_employee_id,
                        target_currency=currency,  # Pass currency for conversion
                    )
            else:
                # Fallback to using the role_rates_id directly
                default_rate, default_cost = await self._get_default_rates_from_role_rate(
                    update_dict.get("role_rates_id", line_item.role_rates_id),
                    new_employee_id,
                    target_currency=currency,  # Pass currency for conversion
                )
            
            # Only update if rates weren't explicitly provided
            if "rate" not in update_dict:
                update_dict["rate"] = default_rate
            if "cost" not in update_dict:
                update_dict["cost"] = default_cost
        
        updated = await self.line_item_repo.update(line_item_id, **update_dict)
        await self.session.flush()  # Flush to get updated values
        
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
        
        if line_item.estimate_id != estimate_id:
            logger.warning(f"Line item {line_item_id} belongs to estimate {line_item.estimate_id}, not {estimate_id}")
            return False
        
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
        if not line_item or line_item.estimate_id != estimate_id:
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
            interval_hours = auto_fill_data.interval_hours or Decimal("5")
            num_weeks = len(weeks)
            
            # If start and end are the same, no ramp needed
            if start_hours == end_hours:
                for week_start in weeks:
                    hours_by_week[week_start] = start_hours
            else:
                for i, week_start in enumerate(weeks):
                    if num_weeks == 1:
                        hours_by_week[week_start] = start_hours
                    else:
                        if auto_fill_data.pattern == AutoFillPattern.RAMP_UP:
                            # Ramp up: add interval_hours for each week
                            # Calculate how many intervals to apply
                            calculated_hours = start_hours + (interval_hours * Decimal(str(i)))
                            # Cap at end_hours (don't exceed target)
                            hours_by_week[week_start] = min(calculated_hours, end_hours)
                        else:  # RAMP_DOWN
                            # Ramp down: subtract interval_hours for each week
                            # Calculate how many intervals to apply
                            calculated_hours = start_hours - (interval_hours * Decimal(str(i)))
                            # Cap at end_hours (don't go below target)
                            hours_by_week[week_start] = max(calculated_hours, end_hours)
        
        elif auto_fill_data.pattern == AutoFillPattern.RAMP_UP_DOWN:
            start_hours = auto_fill_data.start_hours or Decimal("0")
            end_hours = auto_fill_data.end_hours or Decimal("0")
            interval_hours = auto_fill_data.interval_hours or Decimal("5")
            num_weeks = len(weeks)
            
            # If start and end are the same, no ramp needed
            if start_hours == end_hours:
                for week_start in weeks:
                    hours_by_week[week_start] = start_hours
            else:
                # Ramp Up & Down pattern:
                # 1. Ramp Up: Start Date (first week) → ramps up from Start Hours to End Hours
                # 2. Ramp Down: From peak → End Date (last week), ramps down to Start Hours
                # End Date should have Start Hours (not End Hours)
                
                # Calculate how many intervals needed to go from start_hours to end_hours
                hours_difference = end_hours - start_hours
                if interval_hours > 0:
                    intervals_to_peak = (hours_difference / interval_hours).quantize(Decimal('1'), rounding='ROUND_UP')
                else:
                    intervals_to_peak = Decimal("0")
                
                # Calculate how many intervals needed to go from end_hours back to start_hours (same)
                intervals_to_end = intervals_to_peak
                
                # Find the peak week index (where we reach end_hours)
                peak_index = min(int(intervals_to_peak), num_weeks - 1)
                
                # Calculate ramp down start index
                # We need enough weeks from the end to ramp down from end_hours to start_hours
                # If we don't have enough weeks, start ramping down earlier
                ramp_down_start_index = max(peak_index, num_weeks - int(intervals_to_end) - 1)
                
                for i, week_start in enumerate(weeks):
                    if num_weeks == 1:
                        hours_by_week[week_start] = start_hours
                    elif i <= ramp_down_start_index:
                        # Ramp Up phase: from Start Date (i=0) going forward
                        calculated_hours = start_hours + (interval_hours * Decimal(str(i)))
                        # Cap at end_hours (don't exceed target)
                        hours_by_week[week_start] = min(calculated_hours, end_hours)
                    else:
                        # Ramp Down phase: from peak towards End Date (last week)
                        # Calculate position from the end (0-based from the last week)
                        weeks_from_end = (num_weeks - 1) - i
                        # Calculate how many intervals to subtract from end_hours
                        # At End Date (weeks_from_end = 0), we want start_hours
                        # So: end_hours - (intervals_to_end * interval_hours) = start_hours
                        # For weeks_from_end = 0: calculated_hours = end_hours - (intervals_to_end * interval_hours) = start_hours ✓
                        intervals_to_subtract = intervals_to_end - Decimal(str(weeks_from_end))
                        calculated_hours = end_hours - (interval_hours * intervals_to_subtract)
                        # Cap at start_hours (don't go below start)
                        hours_by_week[week_start] = max(calculated_hours, start_hours)
        
        elif auto_fill_data.pattern == AutoFillPattern.CUSTOM:
            if auto_fill_data.custom_hours:
                for week_str, hours in auto_fill_data.custom_hours.items():
                    week_start = date.fromisoformat(week_str)
                    hours_by_week[week_start] = Decimal(str(hours))
        
        # Create or update weekly hours
        weekly_hours_list = []
        logger.info(f"Creating/updating {len(hours_by_week)} weekly hours records for line_item_id={line_item_id}")
        for week_start, hours in hours_by_week.items():
            logger.info(f"  Processing: week_start={week_start} (type={type(week_start)}, weekday={week_start.weekday()}), hours={hours}")
            
            # If this is a Sunday (weekday 6 in Python, where Monday=0), delete any duplicate Monday record
            # Python's weekday(): Monday=0, Tuesday=1, ..., Sunday=6
            if week_start.weekday() == 6:  # Sunday
                deleted_count = await self.weekly_hours_repo.delete_duplicate_monday_for_sunday(
                    line_item_id, week_start
                )
                if deleted_count > 0:
                    logger.info(f"  Deleted {deleted_count} duplicate Monday record(s) for Sunday {week_start}")
            
            weekly_hour = await self.weekly_hours_repo.create(
                estimate_line_item_id=line_item_id,
                week_start_date=week_start,
                hours=hours,
            )
            weekly_hours_list.append(weekly_hour)
            logger.info(f"  Created/updated weekly hour: week_start={weekly_hour.week_start_date}, hours={weekly_hour.hours}, id={weekly_hour.id}")
        
        await self.session.commit()
        logger.info(f"Committed {len(weekly_hours_list)} weekly hours records to database")
        
        # Verify the data was actually saved
        verify_line_item = await self.line_item_repo.get_with_weekly_hours(line_item_id)
        if verify_line_item and verify_line_item.weekly_hours:
            logger.info(f"Verification: Found {len(verify_line_item.weekly_hours)} weekly hours after commit")
            for wh in verify_line_item.weekly_hours[:5]:  # Log first 5
                logger.info(f"  Verified: week_start={wh.week_start_date}, hours={wh.hours}")
        
        # Reload and return the updated line item
        updated_line_item = await self.line_item_repo.get_with_weekly_hours(line_item_id)
        if updated_line_item:
            logger.info(f"Reloaded line item, weekly_hours count: {len(updated_line_item.weekly_hours) if updated_line_item.weekly_hours else 0}")
            response = self._line_item_to_response(updated_line_item)
            logger.info(f"Response weekly_hours count: {len(response.weekly_hours) if hasattr(response, 'weekly_hours') and response.weekly_hours else 0}")
            return [response]
        logger.warning("No updated line item found after auto-fill")
        return []
    
    def _generate_weeks(self, start_date: date, end_date: date) -> List[date]:
        """Generate list of week start dates (Sundays) between start and end dates."""
        weeks = []
        current = self._get_week_start(start_date)
        end_week_start = self._get_week_start(end_date)
        
        while current <= end_week_start:
            weeks.append(current)
            current += timedelta(days=7)
        
        return weeks
    
    def _get_week_start(self, d: date) -> date:
        """Get the Sunday (week start) for a given date."""
        # weekday() returns 0=Monday, 1=Tuesday, ..., 6=Sunday
        # To get days since Sunday: (weekday() + 1) % 7
        # Sunday (6) -> (6+1)%7 = 0, Monday (0) -> (0+1)%7 = 1, etc.
        days_since_sunday = (d.weekday() + 1) % 7
        return d - timedelta(days=days_since_sunday)
    
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
            # Get role_id from role_rate relationship
            role_id = None
            if line_item.role_rate and line_item.role_rate.role:
                role_id = line_item.role_rate.role.id
            
            if not role_id:
                continue  # Skip if no role found
            
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
            estimate_id=estimate_id,
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
        
        # Safely get engagement name and currency if loaded
        engagement_name = None
        engagement_currency = None
        opportunity_id = None
        opportunity_name = None
        try:
            if inspector.attrs.engagement.loaded_value is not None:
                engagement = inspector.attrs.engagement.loaded_value
                if engagement:
                    engagement_name = engagement.name
                    engagement_currency = engagement.default_currency
                    # Check if opportunity is loaded on engagement
                    engagement_inspector = inspect(engagement)
                    if engagement_inspector.attrs.opportunity.loaded_value is not None:
                        opportunity = engagement_inspector.attrs.opportunity.loaded_value
                        if opportunity:
                            opportunity_id = opportunity.id
                            opportunity_name = opportunity.name
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
            "engagement_id": estimate.engagement_id,
            "name": estimate.name,
            "currency": engagement_currency or "USD",  # Get currency from engagement
            "description": estimate.description,
            "active_version": estimate.active_version,
            "phases": phases_list,
            "attributes": estimate.attributes or {},
            "engagement_name": engagement_name,
            "opportunity_id": opportunity_id,
            "opportunity_name": opportunity_name,
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
        
        # Safely get role name and delivery center name from role_rate if loaded
        role_name = None
        delivery_center_name = None
        try:
            if inspector.attrs.role_rate.loaded_value is not None:
                role_rate = inspector.attrs.role_rate.loaded_value
                if role_rate:
                    # Get role name from role_rate.role
                    if hasattr(role_rate, 'role') and role_rate.role:
                        role_name = role_rate.role.role_name
                    # Get delivery center name from role_rate.delivery_center
                    if hasattr(role_rate, 'delivery_center') and role_rate.delivery_center:
                        delivery_center_name = role_rate.delivery_center.name
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
        
        # CRITICAL FIX: Use exact same approach as Release/Opportunity services
        # Release service does: assoc.start_date.isoformat() directly on the date object
        # We must do the same - call .isoformat() directly on line_item.start_date
        # This ensures dates match exactly between Release/Opportunity and Estimate pages
        
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
            # Pure date object - call isoformat() directly (same as Engagement service)
            start_date_iso = line_item.start_date.isoformat()
            logger.info(f"  start_date.isoformat() = {start_date_iso}")
        else:
            # String - extract date part
            start_date_iso = str(line_item.start_date).split("T")[0].split(" ")[0]
        
        if isinstance(line_item.end_date, datetime):
            end_date_iso = line_item.end_date.date().isoformat()
            logger.warning(f"  end_date was datetime! date()={line_item.end_date.date()}, isoformat={end_date_iso}")
        elif isinstance(line_item.end_date, date):
            # Pure date object - call isoformat() directly (same as Engagement service)
            end_date_iso = line_item.end_date.isoformat()
            logger.info(f"  end_date.isoformat() = {end_date_iso}")
        else:
            end_date_iso = str(line_item.end_date).split("T")[0].split(" ")[0]
        
        logger.info(f"  === SERIALIZATION ===")
        logger.info(f"  Final ISO strings: start_date={start_date_iso}, end_date={end_date_iso}")
        
        # Serialize dates directly as ISO strings (EXACTLY like Engagement/Opportunity services)
        # Engagement service: "start_date": assoc.start_date.isoformat() if assoc.start_date else None
        # Get role_id and delivery_center_id from role_rate for backward compatibility
        role_id = None
        delivery_center_id = None
        if line_item.role_rate:
            if line_item.role_rate.role:
                role_id = line_item.role_rate.role.id
            if line_item.role_rate.delivery_center:
                delivery_center_id = line_item.role_rate.delivery_center.id
        
        line_item_dict = {
            "id": line_item.id,
            "estimate_id": line_item.estimate_id,
            "role_rates_id": line_item.role_rates_id,
            "role_id": role_id,  # Included for backward compatibility
            "delivery_center_id": delivery_center_id,  # Included for backward compatibility
            "employee_id": line_item.employee_id,
            "rate": line_item.rate,
            "cost": line_item.cost,
            "currency": line_item.currency,
            "start_date": start_date_iso,  # ISO string (same as Engagement service)
            "end_date": end_date_iso,  # ISO string (same as Engagement service)
            "row_order": line_item.row_order,
            "billable": line_item.billable,
            "billable_expense_percentage": line_item.billable_expense_percentage,
            "role_name": role_name,
            "delivery_center_name": delivery_center_name,
            "employee_name": employee_name,
        }
        
        # Safely get weekly hours if loaded
        try:
            weekly_hours_attr = inspector.attrs.get("weekly_hours")
            if weekly_hours_attr and weekly_hours_attr.loaded_value is not None:
                weekly_hours_list = weekly_hours_attr.loaded_value
                logger.info(f"Found {len(weekly_hours_list) if weekly_hours_list else 0} weekly hours in loaded_value")
                # Build dicts directly, serializing dates as ISO strings (same as Engagement service)
                line_item_dict["weekly_hours"] = [
                    {
                        "id": str(wh.id),
                        "week_start_date": wh.week_start_date.isoformat() if isinstance(wh.week_start_date, date) else str(wh.week_start_date).split("T")[0],
                        "hours": str(wh.hours),
                    }
                    for wh in weekly_hours_list
                    if isinstance(wh, EstimateWeeklyHours)
                ]
                logger.info(f"Serialized {len(line_item_dict['weekly_hours'])} weekly hours")
            else:
                # If weekly_hours is not loaded or is None, set empty list
                logger.warning("weekly_hours not loaded or is None")
                line_item_dict["weekly_hours"] = []
        except (AttributeError, KeyError, TypeError) as e:
            logger.warning(f"Error serializing weekly_hours: {e}", exc_info=True)
            # Set empty list as fallback
            line_item_dict["weekly_hours"] = []
        
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
            "estimate_id": phase.estimate_id,
            "name": phase.name,
            "start_date": phase.start_date,
            "end_date": phase.end_date,
            "color": phase.color,
            "row_order": phase.row_order,
        })
    
    async def get_roles_for_delivery_center(self, delivery_center_id: UUID) -> List[Role]:
        """Get roles that have role_rates for a given delivery center."""
        result = await self.session.execute(
            select(Role)
            .join(RoleRate, Role.id == RoleRate.role_id)
            .where(RoleRate.delivery_center_id == delivery_center_id)
            .distinct()
        )
        return list(result.scalars().all())


"""
Employee service with business logic.
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.db.repositories.employee_repository import EmployeeRepository
from app.db.repositories.opportunity_repository import OpportunityRepository
from app.db.repositories.estimate_repository import EstimateRepository
from app.db.repositories.estimate_line_item_repository import EstimateLineItemRepository
from app.db.repositories.role_rate_repository import RoleRateRepository
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeResponse, OpportunityReference
from app.schemas.relationships import LinkEmployeesToOpportunityRequest
from app.models.employee import Employee
from app.models.estimate import Estimate, EstimateLineItem
from app.models.role_rate import RoleRate
from sqlalchemy import select, and_, func, update
from uuid import UUID
from decimal import Decimal
from app.utils.currency_converter import convert_currency


class EmployeeService(BaseService):
    """Service for employee operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.employee_repo = EmployeeRepository(session)
        self.opportunity_repo = OpportunityRepository(session)
        self.estimate_repo = EstimateRepository(session)
        self.line_item_repo = EstimateLineItemRepository(session)
        self.role_rate_repo = RoleRateRepository(session)
    
    async def create_employee(self, employee_data: EmployeeCreate) -> EmployeeResponse:
        """Create a new employee."""
        employee_dict = employee_data.model_dump(exclude_unset=True)
        delivery_center_code = employee_dict.pop("delivery_center", None)
        if delivery_center_code:
            dc = await self._get_or_create_delivery_center(delivery_center_code)
            employee_dict["delivery_center_id"] = dc.id
        employee = await self.employee_repo.create(**employee_dict)
        await self.session.commit()
        await self.session.refresh(employee)
        return await self._employee_to_response(employee, include_relationships=False)
    
    async def get_employee(self, employee_id: UUID) -> Optional[EmployeeResponse]:
        """Get employee by ID."""
        employee = await self.employee_repo.get(employee_id)
        if not employee:
            return None
        return await self._employee_to_response(employee, include_relationships=False)
    
    async def get_employee_with_relationships(self, employee_id: UUID) -> Optional[EmployeeResponse]:
        """Get employee with related opportunities."""
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            employee = await self.employee_repo.get_with_relationships(employee_id)
            if not employee:
                return None
            return await self._employee_to_response(employee, include_relationships=True)
        except Exception as e:
            logger.error(f"Error in get_employee_with_relationships: {e}", exc_info=True)
            # Fallback to basic employee retrieval without relationships
            employee = await self.employee_repo.get(employee_id)
            if not employee:
                return None
            return await self._employee_to_response(employee, include_relationships=False)
    
    async def list_employees(
        self,
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None,
        employee_type: Optional[str] = None,
        billable: Optional[bool] = None,
    ) -> tuple[List[EmployeeResponse], int]:
        """List employees with optional filters."""
        from app.models.employee import EmployeeStatus, EmployeeType
        
        if status:
            try:
                status_enum = EmployeeStatus(status)
                employees = await self.employee_repo.list_by_status(status_enum, skip, limit)
            except ValueError:
                employees = []
        elif employee_type:
            try:
                type_enum = EmployeeType(employee_type)
                employees = await self.employee_repo.list_by_type(type_enum, skip, limit)
            except ValueError:
                employees = []
        elif billable is True:
            employees = await self.employee_repo.list_billable(skip, limit)
        else:
            employees = await self.employee_repo.list(skip=skip, limit=limit)
        
        total = len(employees)
        # Build responses without relationships (set to empty lists to avoid lazy loading issues)
        responses = []
        for emp in employees:
            responses.append(await self._employee_to_response(emp, include_relationships=False))
        return responses, total
    
    async def update_employee(
        self,
        employee_id: UUID,
        employee_data: EmployeeUpdate,
    ) -> Optional[EmployeeResponse]:
        """Update an employee."""
        employee = await self.employee_repo.get(employee_id)
        if not employee:
            return None
        
        # Validate end_date against start_date
        # The schema validates when both are provided in the update
        # Here we validate when only end_date is provided (compare against existing start_date)
        # or when only start_date is provided (compare against existing end_date)
        new_start_date = employee_data.start_date if employee_data.start_date is not None else employee.start_date
        new_end_date = employee_data.end_date
        
        # If end_date is being set (not cleared), validate it
        if new_end_date is not None and new_start_date is not None:
            if new_end_date <= new_start_date:
                raise ValueError("End date must be after start date")
        
        # Use exclude_none=False to ensure None values are included (for clearing fields)
        update_dict = employee_data.model_dump(exclude_unset=True, exclude_none=False)
        if "delivery_center" in update_dict:
            dc_code = update_dict.pop("delivery_center")
            if dc_code is not None:
                dc = await self._get_or_create_delivery_center(dc_code)
                update_dict["delivery_center_id"] = dc.id
        updated = await self.employee_repo.update(employee_id, **update_dict)
        await self.session.commit()
        await self.session.refresh(updated)
        
        # Convert to dict first to avoid lazy loading issues, then add empty relationships
        employee_dict = {
            k: v for k, v in updated.__dict__.items() 
            if not k.startswith('_') and k not in ['opportunities', 'releases']
        }
        employee_dict['delivery_center'] = getattr(updated.delivery_center, "code", None) if hasattr(updated, "delivery_center") else None
        employee_dict['opportunities'] = []
        employee_dict['releases'] = []
        return EmployeeResponse.model_validate(employee_dict)
    
    async def delete_employee(self, employee_id: UUID) -> bool:
        """Delete an employee."""
        deleted = await self.employee_repo.delete(employee_id)
        await self.session.commit()
        return deleted

    async def _get_opportunities_from_active_estimates(self, employee_id: UUID) -> List[dict]:
        """Get opportunities from active estimate line items for an employee."""
        # Get all active estimates with line items for this employee
        from sqlalchemy.orm import selectinload
        from app.models.role_rate import RoleRate
        
        result = await self.session.execute(
            select(EstimateLineItem)
            .options(
                selectinload(EstimateLineItem.estimate).selectinload(Estimate.opportunity),
                selectinload(EstimateLineItem.role_rate).selectinload(RoleRate.role),
                selectinload(EstimateLineItem.role_rate).selectinload(RoleRate.delivery_center),
                selectinload(EstimateLineItem.payable_center)  # Load Payable Center relationship
            )
            .join(Estimate, Estimate.id == EstimateLineItem.estimate_id)
            .where(
                and_(
                    EstimateLineItem.employee_id == employee_id,
                    Estimate.active_version == True
                )
            )
        )
        line_items = result.scalars().all()
        
        opportunities_dict = {}  # opportunity_id -> opportunity data
        
        for li in line_items:
            # Get opportunity from loaded relationship
            if not li.estimate or not li.estimate.opportunity:
                continue
            
            opportunity = li.estimate.opportunity
            opportunity_id = str(opportunity.id)
            
            if opportunity_id not in opportunities_dict:
                # Get role from role_rate
                role_id = None
                role_name = None
                
                if li.role_rate:
                    if li.role_rate.role:
                        role_id = str(li.role_rate.role.id)
                        role_name = li.role_rate.role.role_name
                
                # Get Payable Center from line item (not Invoice Center from role_rate)
                # Payable Center is the reference-only field stored on the line item
                delivery_center_code = None
                if li.payable_center:
                    delivery_center_code = li.payable_center.code
                
                opportunities_dict[opportunity_id] = {
                    "id": opportunity_id,
                    "name": opportunity.name,
                    "role_id": role_id,
                    "role_name": role_name,
                    "start_date": li.start_date.isoformat() if li.start_date else None,
                    "end_date": li.end_date.isoformat() if li.end_date else None,
                    "project_rate": float(li.rate) if li.rate else None,
                    "delivery_center": delivery_center_code,  # Payable Center code
                }
        
        return list(opportunities_dict.values())
    
    async def _employee_to_response(self, employee, include_relationships: bool) -> EmployeeResponse:
        """Build EmployeeResponse from model with eager-loaded relationships."""
        # Base dict without lazy attributes
        base = {
            "id": employee.id,
            "first_name": employee.first_name,
            "last_name": employee.last_name,
            "email": employee.email,
            "employee_type": employee.employee_type,
            "status": employee.status,
            "role_title": employee.role_title,
            "role_id": None,  # Removed - no longer stored on employee
            "skills": employee.skills,
            "internal_cost_rate": employee.internal_cost_rate,
            "internal_bill_rate": employee.internal_bill_rate,
            "external_bill_rate": employee.external_bill_rate,
            "start_date": employee.start_date,
            "end_date": employee.end_date,
            "availability_calendar_id": employee.availability_calendar_id,
            "billable": employee.billable,
            "default_currency": employee.default_currency,
            "timezone": employee.timezone,
            "delivery_center": getattr(employee.delivery_center, "code", None) if hasattr(employee, "delivery_center") else None,
        }

        if include_relationships:
            # Build opportunities from active estimate line items
            opportunities = await self._get_opportunities_from_active_estimates(employee.id)
            base["opportunities"] = opportunities
        else:
            base["opportunities"] = []

        # Validate and return response
        try:
            response = EmployeeResponse.model_validate(base)
            return response
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error validating employee response: {e}")
            logger.error(f"Base dict: {base}")
            logger.error(f"Opportunities: {base.get('opportunities', [])}")
            logger.error(f"Opportunities: {base.get('opportunities', [])}")
            raise
    
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
        # Get employee rates as defaults if available, otherwise use 0
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
    
    async def _get_or_create_active_estimate(self, opportunity_id: UUID, currency: str = "USD") -> Estimate:
        """Get or create an active estimate for an opportunity."""
        # First check if an "INITIAL" estimate exists (created when opportunity was created)
        result = await self.session.execute(
            select(Estimate).where(
                and_(
                    Estimate.opportunity_id == opportunity_id,
                    Estimate.name == "INITIAL"
                )
            )
        )
        initial_estimate = result.scalar_one_or_none()
        
        if initial_estimate:
            # If INITIAL exists but is not active, activate it and deactivate others
            if not initial_estimate.active_version:
                # Deactivate any other active estimates
                await self.session.execute(
                    update(Estimate)
                    .where(
                        and_(
                            Estimate.opportunity_id == opportunity_id,
                            Estimate.active_version == True
                        )
                    )
                    .values(active_version=False)
                )
                # Activate the INITIAL estimate
                initial_estimate.active_version = True
                await self.session.flush()
            return initial_estimate
        
        # Check if any active estimate exists
        result = await self.session.execute(
            select(Estimate).where(
                and_(
                    Estimate.opportunity_id == opportunity_id,
                    Estimate.active_version == True
                )
            )
        )
        active_estimate = result.scalar_one_or_none()
        
        if active_estimate:
            return active_estimate
        
        # Create a new INITIAL estimate (shouldn't happen if opportunity was created properly, but handle it)
        opportunity = await self.opportunity_repo.get(opportunity_id)
        if not opportunity:
            raise ValueError(f"Opportunity {opportunity_id} not found")
        
        # Deactivate any other estimates for this opportunity (shouldn't be any, but safety check)
        await self.session.execute(
            update(Estimate)
            .where(
                and_(
                    Estimate.opportunity_id == opportunity_id,
                    Estimate.active_version == True
                )
            )
            .values(active_version=False)
        )
        
        estimate = Estimate(
            opportunity_id=opportunity_id,
            name="INITIAL",
            active_version=True
        )
        self.session.add(estimate)
        await self.session.flush()
        return estimate
    
    async def link_employees_to_opportunity(
        self,
        opportunity_id: UUID,
        request: LinkEmployeesToOpportunityRequest,
    ) -> bool:
        """Link employees to an opportunity by creating estimate line items."""
        import logging
        from sqlalchemy import select, func
        from app.db.repositories.role_repository import RoleRepository
        from app.db.repositories.quote_repository import QuoteRepository
        from app.models.delivery_center import DeliveryCenter as DeliveryCenterModel
        from app.models.estimate import EstimateLineItem
        from decimal import Decimal
        
        logger = logging.getLogger(__name__)
        
        try:
            opportunity = await self.opportunity_repo.get(opportunity_id)
            if not opportunity:
                logger.warning(f"Opportunity {opportunity_id} not found")
                return False
            
            # Check if opportunity has active quote (lock check)
            quote_repo = QuoteRepository(self.session)
            active_quote = await quote_repo.get_active_quote_by_opportunity(opportunity_id)
            if active_quote:
                raise ValueError(f"Opportunity is locked by active quote {active_quote.quote_number}. Deactivate the quote to unlock.")
            
            # Validate that opportunity has delivery_center_id (Invoice Center) - required for role rate lookup
            if not opportunity.delivery_center_id:
                raise ValueError(f"Opportunity {opportunity_id} must have delivery_center_id (Invoice Center) set before linking employees")
            
            role_repo = RoleRepository(self.session)
            line_items_created = 0
            
            # Verify role exists
            role = await role_repo.get(request.role_id)
            if not role:
                raise ValueError(f"Role {request.role_id} does not exist")
            
            # Look up Payable Center by code (reference-only field)
            payable_center_result = await self.session.execute(
                select(DeliveryCenterModel).where(DeliveryCenterModel.code == request.delivery_center)
            )
            payable_center = payable_center_result.scalar_one_or_none()
            if not payable_center:
                raise ValueError(f"Payable Center with code '{request.delivery_center}' not found")
            
            # Get or create active estimate for this opportunity
            currency = opportunity.default_currency or "USD"
            estimate = await self._get_or_create_active_estimate(opportunity_id, currency)
            
            # Get or create role rate using Opportunity Invoice Center (delivery_center_id), not Payable Center
            role_rate = await self._get_or_create_role_rate(
                request.role_id,
                opportunity.delivery_center_id,  # Use Opportunity Invoice Center for rate lookup
                currency
            )
            
            # Get existing line items for this employee/opportunity combination
            existing_line_items_result = await self.session.execute(
                select(EstimateLineItem).where(
                    and_(
                        EstimateLineItem.estimate_id == estimate.id,
                        EstimateLineItem.employee_id.in_(request.employee_ids)
                    )
                )
            )
            existing_employee_ids = {li.employee_id for li in existing_line_items_result.scalars()}
            
            # Create line items for employees not already linked
            for emp_id in request.employee_ids:
                if emp_id in existing_employee_ids:
                    logger.info(f"Employee {emp_id} already has line item in estimate {estimate.id}, skipping")
                    continue
                
                employee = await self.employee_repo.get(emp_id)
                if not employee:
                    logger.warning(f"Employee {emp_id} not found")
                    continue
                
                # Get rates - use project_rate and project_cost from request, or employee rates, or role_rate rates
                rate = Decimal(str(request.project_rate)) if request.project_rate else Decimal(str(employee.external_bill_rate))
                
                # Determine cost based on delivery center matching
                if request.project_cost is not None:
                    # Use project_cost from request if provided
                    cost = Decimal(str(request.project_cost))
                else:
                    # Compare Opportunity Invoice Center with Employee Delivery Center
                    centers_match = opportunity.delivery_center_id == employee.delivery_center_id if (opportunity.delivery_center_id and employee.delivery_center_id) else False
                    
                    if centers_match:
                        # Centers match: use internal_cost_rate with NO currency conversion
                        cost = Decimal(str(employee.internal_cost_rate))
                    else:
                        # Centers don't match: use internal_bill_rate with currency conversion
                        employee_cost = Decimal(str(employee.internal_bill_rate))
                        employee_currency = employee.default_currency or "USD"
                        
                        # Convert to Opportunity Invoice Center Currency if different
                        if employee_currency.upper() != currency.upper():
                            cost_decimal = await convert_currency(
                                float(employee_cost),
                                employee_currency,
                                currency,
                                self.session
                            )
                            cost = Decimal(str(cost_decimal))
                        else:
                            cost = employee_cost
                
                # Get max row_order
                max_order_result = await self.session.execute(
                    select(func.max(EstimateLineItem.row_order))
                    .where(EstimateLineItem.estimate_id == estimate.id)
                )
                max_order = max_order_result.scalar_one_or_none() or -1
                
                # Create line item
                line_item = EstimateLineItem(
                    estimate_id=estimate.id,
                    role_rates_id=role_rate.id,
                    payable_center_id=payable_center.id,  # Payable Center (reference only)
                    employee_id=emp_id,
                    rate=rate,
                    cost=cost,
                    currency=currency,
                    start_date=request.start_date,
                    end_date=request.end_date,
                    row_order=max_order + 1,
                )
                self.session.add(line_item)
                line_items_created += 1
                logger.info(f"Creating estimate line item: employee_id={emp_id}, opportunity_id={opportunity_id}, role_rates_id={role_rate.id}")
            
            if line_items_created == 0:
                logger.warning(f"No new line items created - all employees already linked")
                return True
            
            await self.session.flush()
            await self.session.commit()
            logger.info(f"Successfully committed {line_items_created} estimate line items")
            
            return True
        except ValueError as e:
            logger.error(f"Validation error linking employees to opportunity: {e}", exc_info=True)
            await self.session.rollback()
            raise
        except Exception as e:
            logger.error(f"Unexpected error linking employees to opportunity: {e}", exc_info=True)
            logger.error(f"Error type: {type(e).__name__}")
            logger.error(f"Error args: {e.args}")
            await self.session.rollback()
            raise
    
    async def unlink_employees_from_opportunity(
        self,
        opportunity_id: UUID,
        employee_ids: List[UUID],
    ) -> bool:
        """Unlink employees from an opportunity by clearing employee_id from estimate line items."""
        from sqlalchemy import select
        from app.models.estimate import Estimate, EstimateLineItem
        
        # Get active estimate for this opportunity
        estimate_result = await self.session.execute(
            select(Estimate).where(
                and_(
                    Estimate.opportunity_id == opportunity_id,
                    Estimate.active_version == True
                )
            )
        )
        active_estimate = estimate_result.scalar_one_or_none()
        
        if active_estimate:
            # Clear employee_id from line items (don't delete the row)
            line_items_result = await self.session.execute(
                select(EstimateLineItem).where(
                    and_(
                        EstimateLineItem.estimate_id == active_estimate.id,
                        EstimateLineItem.employee_id.in_(employee_ids)
                    )
                )
            )
            line_items = line_items_result.scalars().all()
            for li in line_items:
                li.employee_id = None
                # Recalculate cost based on role rate since employee is removed
                # This will be handled by the frontend/API when the line item is updated
        
        await self.session.commit()
        return True

    async def _get_or_create_delivery_center(self, code: str):
        """Ensure a delivery center exists for the provided code."""
        from sqlalchemy import select
        from app.models.delivery_center import DeliveryCenter

        normalized = code.strip().lower()
        name_map = {
            "north-america": "North America",
            "thailand": "Thailand",
            "philippines": "Philippines",
            "australia": "Australia",
        }
        result = await self.session.execute(
            select(DeliveryCenter).where(DeliveryCenter.code == normalized)
        )
        existing = result.scalar_one_or_none()
        if existing:
            return existing

        dc = DeliveryCenter(name=name_map.get(normalized, normalized.title()), code=normalized)
        self.session.add(dc)
        await self.session.flush()
        return dc
    

"""
Opportunity service with business logic.
"""

from typing import List, Optional
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.db.repositories.opportunity_repository import OpportunityRepository
from app.db.repositories.employee_repository import EmployeeRepository
from app.db.repositories.role_repository import RoleRepository
from app.db.repositories.estimate_repository import EstimateRepository
from app.db.repositories.estimate_line_item_repository import EstimateLineItemRepository
from app.db.repositories.engagement_repository import EngagementRepository
from app.schemas.opportunity import OpportunityCreate, OpportunityUpdate, OpportunityResponse
from app.models.opportunity import OpportunityStatus
from app.utils.currency_converter import convert_to_usd
from sqlalchemy import select, and_
from app.models.estimate import Estimate, EstimateLineItem
from app.models.engagement import Engagement


class OpportunityService(BaseService):
    """Service for opportunity operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.opportunity_repo = OpportunityRepository(session)
        self.employee_repo = EmployeeRepository(session)
        self.role_repo = RoleRepository(session)
        self.estimate_repo = EstimateRepository(session)
        self.line_item_repo = EstimateLineItemRepository(session)
        self.engagement_repo = EngagementRepository(session)
    
    @staticmethod
    def calculate_probability_from_status(status: OpportunityStatus) -> float:
        """Calculate probability percentage based on status."""
        probability_map = {
            OpportunityStatus.DISCOVERY: 10.0,
            OpportunityStatus.QUALIFIED: 25.0,
            OpportunityStatus.PROPOSAL: 50.0,
            OpportunityStatus.NEGOTIATION: 80.0,
            OpportunityStatus.WON: 100.0,
        }
        return probability_map.get(status, 0.0)
    
    @staticmethod
    def is_closing_status(status: OpportunityStatus) -> bool:
        """Check if status is a closing status (Won, Lost, Cancelled)."""
        return status in (OpportunityStatus.WON, OpportunityStatus.LOST, OpportunityStatus.CANCELLED)
    
    async def calculate_deal_value_usd(self, deal_value: Optional[Decimal], currency: str) -> Optional[Decimal]:
        """Calculate deal value in USD."""
        if deal_value is None:
            return None
        if currency.upper() == "USD":
            return deal_value
        usd_value = await convert_to_usd(float(deal_value), currency, self.session)
        return Decimal(str(usd_value))
    
    def calculate_forecast_value(self, probability: Optional[float], deal_value: Optional[Decimal]) -> Optional[Decimal]:
        """Calculate forecast value: probability * deal_value."""
        if probability is None or deal_value is None:
            return None
        return Decimal(str(float(deal_value) * (probability / 100.0)))
    
    def calculate_deal_length(self, creation_date: Optional[date], close_date: Optional[date]) -> Optional[int]:
        """Calculate deal length in days from creation date to today or close date, whichever is earlier."""
        if creation_date is None:
            return None
        end_date = close_date if close_date else date.today()
        if end_date < creation_date:
            return 0
        return (end_date - creation_date).days
    
    async def create_opportunity(self, opportunity_data: OpportunityCreate) -> OpportunityResponse:
        """Create a new opportunity."""
        # Server-side validation: end_date must be after start_date when both are provided
        if opportunity_data.end_date is not None and opportunity_data.end_date < opportunity_data.start_date:
            raise ValueError("End date must be after start date")
        
        opportunity_dict = opportunity_data.model_dump(exclude_unset=True)
        # end_date can now be None (nullable in database)
        
        # Normalize enum values to ensure they're lowercase strings
        # This handles cases where the frontend sends uppercase values
        if 'win_probability' in opportunity_dict and isinstance(opportunity_dict['win_probability'], str):
            opportunity_dict['win_probability'] = opportunity_dict['win_probability'].lower()
        if 'accountability' in opportunity_dict and isinstance(opportunity_dict['accountability'], str):
            opportunity_dict['accountability'] = opportunity_dict['accountability'].lower()
        if 'strategic_importance' in opportunity_dict and isinstance(opportunity_dict['strategic_importance'], str):
            opportunity_dict['strategic_importance'] = opportunity_dict['strategic_importance'].lower()
        
        # Set deal_creation_date to today
        opportunity_dict['deal_creation_date'] = date.today()
        
        # Calculate probability from status
        status = opportunity_dict.get('status', OpportunityStatus.DISCOVERY)
        opportunity_dict['probability'] = self.calculate_probability_from_status(status)
        
        # Calculate deal_value_usd if deal_value is provided
        deal_value = opportunity_dict.get('deal_value')
        currency = opportunity_dict.get('default_currency', 'USD')
        if deal_value is not None:
            opportunity_dict['deal_value_usd'] = await self.calculate_deal_value_usd(deal_value, currency)
        
        # Calculate forecast values
        probability = opportunity_dict.get('probability')
        if probability is not None and deal_value is not None:
            opportunity_dict['forecast_value'] = self.calculate_forecast_value(probability, deal_value)
            if opportunity_dict.get('deal_value_usd') is not None:
                opportunity_dict['forecast_value_usd'] = self.calculate_forecast_value(
                    probability, opportunity_dict['deal_value_usd']
                )
        
        # Set close_date if status is closing status
        if self.is_closing_status(status):
            opportunity_dict['close_date'] = date.today()
        
        # Calculate deal_length
        creation_date = opportunity_dict.get('deal_creation_date')
        close_date = opportunity_dict.get('close_date')
        if creation_date:
            opportunity_dict['deal_length'] = self.calculate_deal_length(creation_date, close_date)
        
        opportunity = await self.opportunity_repo.create(**opportunity_dict)
        await self.session.commit()
        # Reload with account relationship
        opportunity = await self.opportunity_repo.get(opportunity.id)
        if not opportunity:
            raise ValueError("Failed to retrieve created opportunity")
        return await self._to_response(opportunity)
    
    async def get_opportunity(self, opportunity_id: UUID, include_relationships: bool = False) -> Optional[OpportunityResponse]:
        """Get opportunity by ID."""
        if include_relationships:
            opportunity = await self.opportunity_repo.get_with_relationships(opportunity_id)
        else:
            opportunity = await self.opportunity_repo.get(opportunity_id)
        if not opportunity:
            return None
        return await self._to_response(opportunity, include_relationships=include_relationships)
    
    async def get_opportunity_with_relationships(self, opportunity_id: UUID) -> Optional[OpportunityResponse]:
        """Get opportunity with related entities (alias for get_opportunity with include_relationships=True)."""
        return await self.get_opportunity(opportunity_id, include_relationships=True)
    
    async def list_opportunities(
        self,
        skip: int = 0,
        limit: int = 100,
        account_id: Optional[UUID] = None,
        status: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> tuple[List[OpportunityResponse], int]:
        """List opportunities with optional filters."""
        from app.models.opportunity import OpportunityStatus
        
        if account_id:
            opportunities = await self.opportunity_repo.list_by_account(account_id, skip, limit)
        elif status:
            try:
                status_enum = OpportunityStatus(status)
                opportunities = await self.opportunity_repo.list_by_status(status_enum, skip, limit)
            except ValueError:
                opportunities = []
        elif start_date or end_date:
            opportunities = await self.opportunity_repo.list_by_date_range(start_date, end_date, skip, limit)
        else:
            opportunities = await self.opportunity_repo.list(skip=skip, limit=limit)
        
        total = len(opportunities)
        responses = []
        for opp in opportunities:
            responses.append(await self._to_response(opp))
        return responses, total
    
    async def list_child_opportunities(
        self,
        parent_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[List[OpportunityResponse], int]:
        """List child opportunities of a parent."""
        opportunities = await self.opportunity_repo.list_child_opportunities(parent_id, skip, limit)
        total = len(opportunities)
        responses = []
        for opp in opportunities:
            responses.append(await self._to_response(opp))
        return responses, total
    
    async def update_opportunity(
        self,
        opportunity_id: UUID,
        opportunity_data: OpportunityUpdate,
    ) -> Optional[OpportunityResponse]:
        """Update an opportunity."""
        opportunity = await self.opportunity_repo.get(opportunity_id)
        if not opportunity:
            return None
        
        # Server-side validation: end_date must be after start_date when both are provided
        # Check which fields were explicitly set in the request
        # Pydantic v2 provides model_fields_set to see which fields were explicitly provided
        fields_set = getattr(opportunity_data, 'model_fields_set', None)
        update_dict = opportunity_data.model_dump(exclude_unset=True, exclude_none=False)
        
        # If end_date was explicitly provided in the request (even if None), include it in the update
        # This allows clearing the field by setting it to None
        if fields_set and 'end_date' in fields_set:
            # Get the actual value (which might be None to clear the field)
            update_dict['end_date'] = opportunity_data.end_date
        elif fields_set is None:
            # Fallback for Pydantic v1 or if model_fields_set is not available
            # Check if end_date is in the model dump without exclude_unset
            all_fields = opportunity_data.model_dump(exclude_unset=False, exclude_none=False)
            if 'end_date' in all_fields:
                update_dict['end_date'] = all_fields['end_date']
        
        start_date = update_dict.get('start_date', opportunity.start_date)
        end_date = update_dict.get('end_date', opportunity.end_date)
        
        # Only validate date order if both dates are provided
        if end_date is not None and start_date is not None and end_date < start_date:
            raise ValueError("End date must be after start date")
        
        # Normalize enum values to ensure they're lowercase strings
        # This handles cases where the frontend sends uppercase values
        if 'win_probability' in update_dict and isinstance(update_dict['win_probability'], str):
            update_dict['win_probability'] = update_dict['win_probability'].lower()
        if 'accountability' in update_dict and isinstance(update_dict['accountability'], str):
            update_dict['accountability'] = update_dict['accountability'].lower()
        if 'strategic_importance' in update_dict and isinstance(update_dict['strategic_importance'], str):
            update_dict['strategic_importance'] = update_dict['strategic_importance'].lower()
        
        # Get current values for calculations
        current_status = update_dict.get('status', opportunity.status)
        current_deal_value = update_dict.get('deal_value', opportunity.deal_value)
        current_currency = update_dict.get('default_currency', opportunity.default_currency)
        current_deal_creation_date = opportunity.deal_creation_date  # Never changes after creation
        
        # Recalculate probability if status changed
        if 'status' in update_dict:
            update_dict['probability'] = self.calculate_probability_from_status(current_status)
        
        # Recalculate deal_value_usd if deal_value or currency changed
        if 'deal_value' in update_dict or 'default_currency' in update_dict:
            if current_deal_value is not None:
                update_dict['deal_value_usd'] = await self.calculate_deal_value_usd(current_deal_value, current_currency)
            else:
                update_dict['deal_value_usd'] = None
        
        # Recalculate forecast values if probability, deal_value, or currency changed
        probability = update_dict.get('probability', opportunity.probability)
        deal_value = update_dict.get('deal_value', opportunity.deal_value)
        deal_value_usd = update_dict.get('deal_value_usd', opportunity.deal_value_usd)
        
        if probability is not None and deal_value is not None:
            update_dict['forecast_value'] = self.calculate_forecast_value(probability, deal_value)
        elif 'probability' in update_dict or 'deal_value' in update_dict:
            # Recalculate even if one is None (to clear if needed)
            if probability is not None and deal_value is not None:
                update_dict['forecast_value'] = self.calculate_forecast_value(probability, deal_value)
            else:
                update_dict['forecast_value'] = None
        
        if probability is not None and deal_value_usd is not None:
            update_dict['forecast_value_usd'] = self.calculate_forecast_value(probability, deal_value_usd)
        elif 'probability' in update_dict or 'deal_value_usd' in update_dict:
            if probability is not None and deal_value_usd is not None:
                update_dict['forecast_value_usd'] = self.calculate_forecast_value(probability, deal_value_usd)
            else:
                update_dict['forecast_value_usd'] = None
        
        # Set close_date if status changed to closing status
        if 'status' in update_dict:
            if self.is_closing_status(current_status):
                # Set close_date if not already set
                if opportunity.close_date is None:
                    update_dict['close_date'] = date.today()
            else:
                # Clear close_date if status is no longer closing
                update_dict['close_date'] = None
        
        # Recalculate deal_length if close_date or deal_creation_date changed
        if 'close_date' in update_dict or current_deal_creation_date:
            close_date = update_dict.get('close_date', opportunity.close_date)
            update_dict['deal_length'] = self.calculate_deal_length(current_deal_creation_date, close_date)
        
        updated = await self.opportunity_repo.update(opportunity_id, **update_dict)
        await self.session.commit()
        # Reload with account relationship
        updated = await self.opportunity_repo.get(opportunity_id)
        if not updated:
            return None
        return await self._to_response(updated)
    
    async def delete_opportunity(self, opportunity_id: UUID) -> bool:
        """Delete an opportunity."""
        deleted = await self.opportunity_repo.delete(opportunity_id)
        await self.session.commit()
        return deleted
    
    async def link_roles_to_opportunity(
        self,
        opportunity_id: UUID,
        role_ids: List[UUID],
    ) -> bool:
        """Link roles to an opportunity.
        
        Note: Roles are now linked through estimate line items, not directly.
        This method is kept for API compatibility but does nothing.
        To link roles, create estimate line items with the desired role_rates.
        """
        # Roles are now linked through estimate line items, not directly to opportunities
        # This method is kept for backward compatibility but does nothing
        return True
    
    async def unlink_roles_from_opportunity(
        self,
        opportunity_id: UUID,
        role_ids: List[UUID],
    ) -> bool:
        """Unlink roles from an opportunity.
        
        Note: Roles are now linked through estimate line items, not directly.
        This method is kept for API compatibility but does nothing.
        To unlink roles, remove estimate line items with the desired role_rates.
        """
        # Roles are now linked through estimate line items, not directly to opportunities
        # This method is kept for backward compatibility but does nothing
        return True
    
    async def _get_employees_from_active_estimates_for_opportunity(self, opportunity_id: UUID) -> List[dict]:
        """Get employees from active estimate line items for all engagements in an opportunity."""
        # Get all engagements for this opportunity
        engagements_result = await self.session.execute(
            select(Engagement).where(Engagement.opportunity_id == opportunity_id)
        )
        engagements = engagements_result.scalars().all()
        
        employees_dict = {}  # employee_id -> employee data
        
        for engagement in engagements:
            # Get active estimate for this engagement
            estimate_result = await self.session.execute(
                select(Estimate).where(
                    and_(
                        Estimate.engagement_id == engagement.id,
                        Estimate.active_version == True
                    )
                )
            )
            active_estimate = estimate_result.scalar_one_or_none()
            
            if not active_estimate:
                continue
            
            # Get line items from active estimate
            line_items = await self.line_item_repo.list_by_estimate(active_estimate.id)
            
            for li in line_items:
                if not li.employee_id:
                    continue
                
                employee_id = str(li.employee_id)
                
                # Get employee if not already in dict
                if employee_id not in employees_dict:
                    employee = await self.employee_repo.get(li.employee_id)
                    if not employee:
                        continue
                    
                    # Get role and delivery center from role_rate
                    role_id = None
                    role_name = None
                    delivery_center_code = None
                    
                    if li.role_rate:
                        if li.role_rate.role:
                            role_id = str(li.role_rate.role.id)
                            role_name = li.role_rate.role.role_name
                        if li.role_rate.delivery_center:
                            delivery_center_code = li.role_rate.delivery_center.code
                    
                    employees_dict[employee_id] = {
                        "id": employee_id,
                        "first_name": employee.first_name,
                        "last_name": employee.last_name,
                        "email": employee.email,
                        "role_id": role_id,
                        "role_name": role_name,
                        "start_date": li.start_date.isoformat() if li.start_date else None,
                        "end_date": li.end_date.isoformat() if li.end_date else None,
                        "project_rate": float(li.rate) if li.rate else None,
                        "delivery_center": delivery_center_code,
                    }
        
        return list(employees_dict.values())
    
    async def _get_employees_from_active_estimates_for_engagement(self, engagement_id: UUID) -> List[dict]:
        """Get employees from active estimate line items for an engagement."""
        # Get active estimate for this engagement
        result = await self.session.execute(
            select(Estimate).where(
                and_(
                    Estimate.engagement_id == engagement_id,
                    Estimate.active_version == True
                )
            )
        )
        active_estimate = result.scalar_one_or_none()
        
        if not active_estimate:
            return []
        
        # Get line items from active estimate
        line_items = await self.line_item_repo.list_by_estimate(active_estimate.id)
        
        employees_dict = {}  # employee_id -> employee data
        
        for li in line_items:
            if not li.employee_id:
                continue
            
            employee_id = str(li.employee_id)
            
            # Get employee if not already in dict
            if employee_id not in employees_dict:
                employee = await self.employee_repo.get(li.employee_id)
                if not employee:
                    continue
                
                # Get role and delivery center from role_rate
                role_id = None
                role_name = None
                delivery_center_code = None
                
                if li.role_rate:
                    if li.role_rate.role:
                        role_id = str(li.role_rate.role.id)
                        role_name = li.role_rate.role.role_name
                    if li.role_rate.delivery_center:
                        delivery_center_code = li.role_rate.delivery_center.code
                
                employees_dict[employee_id] = {
                    "id": employee_id,
                    "first_name": employee.first_name,
                    "last_name": employee.last_name,
                    "email": employee.email,
                    "role_id": role_id,
                    "role_name": role_name,
                    "start_date": li.start_date.isoformat() if li.start_date else None,
                    "end_date": li.end_date.isoformat() if li.end_date else None,
                    "project_rate": float(li.rate) if li.rate else None,
                    "delivery_center": delivery_center_code,
                }
        
        return list(employees_dict.values())
    
    async def _to_response(self, opportunity, include_relationships: bool = False) -> OpportunityResponse:
        """Convert opportunity model to response schema."""
        account_name = None
        if hasattr(opportunity, 'account') and opportunity.account:
            account_name = opportunity.account.company_name
        
        opportunity_dict = {
            "id": str(opportunity.id),
            "name": opportunity.name,
            "parent_opportunity_id": str(opportunity.parent_opportunity_id) if opportunity.parent_opportunity_id else None,
            "account_id": str(opportunity.account_id),
            "start_date": opportunity.start_date.isoformat() if opportunity.start_date else None,
            "end_date": opportunity.end_date.isoformat() if opportunity.end_date else None,
            "status": opportunity.status.value if hasattr(opportunity.status, 'value') else str(opportunity.status),
            "billing_term_id": str(opportunity.billing_term_id),
            "opportunity_type": opportunity.opportunity_type.value if hasattr(opportunity.opportunity_type, 'value') else str(opportunity.opportunity_type),
            "description": opportunity.description,
            "utilization": float(opportunity.utilization) if opportunity.utilization else None,
            "margin": float(opportunity.margin) if opportunity.margin else None,
            "default_currency": opportunity.default_currency,
            "delivery_center_id": str(opportunity.delivery_center_id),
            "opportunity_owner_id": str(opportunity.opportunity_owner_id) if opportunity.opportunity_owner_id else None,
            "invoice_customer": opportunity.invoice_customer,
            "billable_expenses": opportunity.billable_expenses,
            "attributes": opportunity.attributes,
            "account_name": account_name,
            # New deal/forecast fields
            "probability": float(opportunity.probability) if opportunity.probability is not None else None,
            "win_probability": opportunity.win_probability.value if opportunity.win_probability and hasattr(opportunity.win_probability, 'value') else (str(opportunity.win_probability).lower() if opportunity.win_probability else None),
            "accountability": opportunity.accountability.value if opportunity.accountability and hasattr(opportunity.accountability, 'value') else (str(opportunity.accountability).lower() if opportunity.accountability else None),
            "strategic_importance": opportunity.strategic_importance.value if opportunity.strategic_importance and hasattr(opportunity.strategic_importance, 'value') else (str(opportunity.strategic_importance).lower() if opportunity.strategic_importance else None),
            "deal_creation_date": opportunity.deal_creation_date.isoformat() if opportunity.deal_creation_date else None,
            "deal_value": str(opportunity.deal_value) if opportunity.deal_value is not None else None,
            "deal_value_usd": str(opportunity.deal_value_usd) if opportunity.deal_value_usd is not None else None,
            "close_date": opportunity.close_date.isoformat() if opportunity.close_date else None,
            "deal_length": opportunity.deal_length,
            "forecast_value": str(opportunity.forecast_value) if opportunity.forecast_value is not None else None,
            "forecast_value_usd": str(opportunity.forecast_value_usd) if opportunity.forecast_value_usd is not None else None,
            "project_start_month": opportunity.project_start_month,
            "project_start_year": opportunity.project_start_year,
            "project_duration_months": opportunity.project_duration_months,
        }
        
        if include_relationships:
            # Include engagements with their employee associations from active estimates
            engagements = []
            if hasattr(opportunity, 'engagements') and opportunity.engagements:
                for engagement in opportunity.engagements:
                    # Safety check: ensure engagement belongs to this opportunity
                    if engagement.opportunity_id != opportunity.id:
                        continue
                    
                    engagement_dict = {
                        "id": str(engagement.id),
                        "name": engagement.name,
                        "opportunity_id": str(engagement.opportunity_id),
                        "start_date": engagement.start_date.isoformat() if engagement.start_date else None,
                        "end_date": engagement.end_date.isoformat() if engagement.end_date else None,
                        "status": engagement.status.value if hasattr(engagement.status, 'value') else str(engagement.status),
                        "budget": float(engagement.budget) if engagement.budget else None,
                        "billing_term_id": str(engagement.billing_term_id) if engagement.billing_term_id else None,
                        "description": engagement.description,
                        "default_currency": engagement.default_currency,
                        "delivery_center_id": str(engagement.delivery_center_id) if engagement.delivery_center_id else None,
                        "attributes": engagement.attributes,
                        "employees": await self._get_employees_from_active_estimates_for_engagement(engagement.id)
                    }
                    engagements.append(engagement_dict)
            opportunity_dict["engagements"] = engagements
            
            # Include releases with their employee associations from active estimates
            releases = []
            if hasattr(opportunity, 'releases') and opportunity.releases:
                for release in opportunity.releases:
                    # Safety check: ensure release belongs to this opportunity
                    if release.opportunity_id != opportunity.id:
                        continue
                    
                    release_dict = {
                        "id": str(release.id),
                        "name": release.name,
                        "opportunity_id": str(release.opportunity_id),
                        "start_date": release.start_date.isoformat() if release.start_date else None,
                        "end_date": release.end_date.isoformat() if release.end_date else None,
                        "status": release.status.value if hasattr(release.status, 'value') else str(release.status),
                        "employees": await self._get_employees_from_active_estimates_for_release(release.id)
                    }
                    releases.append(release_dict)
            opportunity_dict["releases"] = releases
            
            # Include employees directly linked to opportunity (from all releases' active estimates)
            employees = await self._get_employees_from_active_estimates_for_opportunity(opportunity.id)
            opportunity_dict["employees"] = employees
        else:
            opportunity_dict["engagements"] = []
            opportunity_dict["employees"] = []
        
        return OpportunityResponse.model_validate(opportunity_dict)


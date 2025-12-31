"""
Engagement service with business logic.
"""

from typing import List, Optional
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.db.repositories.engagement_repository import EngagementRepository
from app.db.repositories.employee_repository import EmployeeRepository
from app.db.repositories.role_repository import RoleRepository
from app.db.repositories.estimate_repository import EstimateRepository
from app.db.repositories.estimate_line_item_repository import EstimateLineItemRepository
from app.db.repositories.release_repository import ReleaseRepository
from app.schemas.engagement import EngagementCreate, EngagementUpdate, EngagementResponse
from app.models.engagement import EngagementStatus
from app.utils.currency_converter import convert_to_usd
from sqlalchemy import select, and_
from app.models.estimate import Estimate, EstimateLineItem
from app.models.release import Release


class EngagementService(BaseService):
    """Service for engagement operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.engagement_repo = EngagementRepository(session)
        self.employee_repo = EmployeeRepository(session)
        self.role_repo = RoleRepository(session)
        self.estimate_repo = EstimateRepository(session)
        self.line_item_repo = EstimateLineItemRepository(session)
        self.release_repo = ReleaseRepository(session)
    
    @staticmethod
    def calculate_probability_from_status(status: EngagementStatus) -> float:
        """Calculate probability percentage based on status."""
        probability_map = {
            EngagementStatus.DISCOVERY: 10.0,
            EngagementStatus.QUALIFIED: 25.0,
            EngagementStatus.PROPOSAL: 50.0,
            EngagementStatus.NEGOTIATION: 80.0,
            EngagementStatus.WON: 100.0,
        }
        return probability_map.get(status, 0.0)
    
    @staticmethod
    def is_closing_status(status: EngagementStatus) -> bool:
        """Check if status is a closing status (Won, Lost, Cancelled)."""
        return status in (EngagementStatus.WON, EngagementStatus.LOST, EngagementStatus.CANCELLED)
    
    def calculate_deal_value_usd(self, deal_value: Optional[Decimal], currency: str) -> Optional[Decimal]:
        """Calculate deal value in USD."""
        if deal_value is None:
            return None
        if currency.upper() == "USD":
            return deal_value
        usd_value = convert_to_usd(float(deal_value), currency)
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
    
    async def create_engagement(self, engagement_data: EngagementCreate) -> EngagementResponse:
        """Create a new engagement."""
        # Server-side validation: end_date must be after start_date when both are provided
        if engagement_data.end_date is not None and engagement_data.end_date < engagement_data.start_date:
            raise ValueError("End date must be after start date")
        
        engagement_dict = engagement_data.model_dump(exclude_unset=True)
        # end_date can now be None (nullable in database)
        
        # Normalize enum values to ensure they're lowercase strings
        # This handles cases where the frontend sends uppercase values
        if 'win_probability' in engagement_dict and isinstance(engagement_dict['win_probability'], str):
            engagement_dict['win_probability'] = engagement_dict['win_probability'].lower()
        if 'accountability' in engagement_dict and isinstance(engagement_dict['accountability'], str):
            engagement_dict['accountability'] = engagement_dict['accountability'].lower()
        if 'strategic_importance' in engagement_dict and isinstance(engagement_dict['strategic_importance'], str):
            engagement_dict['strategic_importance'] = engagement_dict['strategic_importance'].lower()
        
        # Set deal_creation_date to today
        engagement_dict['deal_creation_date'] = date.today()
        
        # Calculate probability from status
        status = engagement_dict.get('status', EngagementStatus.DISCOVERY)
        engagement_dict['probability'] = self.calculate_probability_from_status(status)
        
        # Calculate deal_value_usd if deal_value is provided
        deal_value = engagement_dict.get('deal_value')
        currency = engagement_dict.get('default_currency', 'USD')
        if deal_value is not None:
            engagement_dict['deal_value_usd'] = self.calculate_deal_value_usd(deal_value, currency)
        
        # Calculate forecast values
        probability = engagement_dict.get('probability')
        if probability is not None and deal_value is not None:
            engagement_dict['forecast_value'] = self.calculate_forecast_value(probability, deal_value)
            if engagement_dict.get('deal_value_usd') is not None:
                engagement_dict['forecast_value_usd'] = self.calculate_forecast_value(
                    probability, engagement_dict['deal_value_usd']
                )
        
        # Set close_date if status is closing status
        if self.is_closing_status(status):
            engagement_dict['close_date'] = date.today()
        
        # Calculate deal_length
        creation_date = engagement_dict.get('deal_creation_date')
        close_date = engagement_dict.get('close_date')
        if creation_date:
            engagement_dict['deal_length'] = self.calculate_deal_length(creation_date, close_date)
        
        engagement = await self.engagement_repo.create(**engagement_dict)
        await self.session.commit()
        # Reload with account relationship
        engagement = await self.engagement_repo.get(engagement.id)
        if not engagement:
            raise ValueError("Failed to retrieve created engagement")
        return await self._to_response(engagement)
    
    async def get_engagement(self, engagement_id: UUID, include_relationships: bool = False) -> Optional[EngagementResponse]:
        """Get engagement by ID."""
        if include_relationships:
            engagement = await self.engagement_repo.get_with_relationships(engagement_id)
        else:
            engagement = await self.engagement_repo.get(engagement_id)
        if not engagement:
            return None
        return await self._to_response(engagement, include_relationships=include_relationships)
    
    async def get_engagement_with_relationships(self, engagement_id: UUID) -> Optional[EngagementResponse]:
        """Get engagement with related entities (alias for get_engagement with include_relationships=True)."""
        return await self.get_engagement(engagement_id, include_relationships=True)
    
    async def list_engagements(
        self,
        skip: int = 0,
        limit: int = 100,
        account_id: Optional[UUID] = None,
        status: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> tuple[List[EngagementResponse], int]:
        """List engagements with optional filters."""
        from app.models.engagement import EngagementStatus
        
        if account_id:
            engagements = await self.engagement_repo.list_by_account(account_id, skip, limit)
        elif status:
            try:
                status_enum = EngagementStatus(status)
                engagements = await self.engagement_repo.list_by_status(status_enum, skip, limit)
            except ValueError:
                engagements = []
        elif start_date or end_date:
            engagements = await self.engagement_repo.list_by_date_range(start_date, end_date, skip, limit)
        else:
            engagements = await self.engagement_repo.list(skip=skip, limit=limit)
        
        total = len(engagements)
        responses = []
        for eng in engagements:
            responses.append(await self._to_response(eng))
        return responses, total
    
    async def list_child_engagements(
        self,
        parent_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[List[EngagementResponse], int]:
        """List child engagements of a parent."""
        engagements = await self.engagement_repo.list_child_engagements(parent_id, skip, limit)
        total = len(engagements)
        responses = []
        for eng in engagements:
            responses.append(await self._to_response(eng))
        return responses, total
    
    async def update_engagement(
        self,
        engagement_id: UUID,
        engagement_data: EngagementUpdate,
    ) -> Optional[EngagementResponse]:
        """Update an engagement."""
        engagement = await self.engagement_repo.get(engagement_id)
        if not engagement:
            return None
        
        # Server-side validation: end_date must be after start_date when both are provided
        # Check which fields were explicitly set in the request
        # Pydantic v2 provides model_fields_set to see which fields were explicitly provided
        fields_set = getattr(engagement_data, 'model_fields_set', None)
        update_dict = engagement_data.model_dump(exclude_unset=True, exclude_none=False)
        
        # If end_date was explicitly provided in the request (even if None), include it in the update
        # This allows clearing the field by setting it to None
        if fields_set and 'end_date' in fields_set:
            # Get the actual value (which might be None to clear the field)
            update_dict['end_date'] = engagement_data.end_date
        elif fields_set is None:
            # Fallback for Pydantic v1 or if model_fields_set is not available
            # Check if end_date is in the model dump without exclude_unset
            all_fields = engagement_data.model_dump(exclude_unset=False, exclude_none=False)
            if 'end_date' in all_fields:
                update_dict['end_date'] = all_fields['end_date']
        
        start_date = update_dict.get('start_date', engagement.start_date)
        end_date = update_dict.get('end_date', engagement.end_date)
        
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
        current_status = update_dict.get('status', engagement.status)
        current_deal_value = update_dict.get('deal_value', engagement.deal_value)
        current_currency = update_dict.get('default_currency', engagement.default_currency)
        current_deal_creation_date = engagement.deal_creation_date  # Never changes after creation
        
        # Recalculate probability if status changed
        if 'status' in update_dict:
            update_dict['probability'] = self.calculate_probability_from_status(current_status)
        
        # Recalculate deal_value_usd if deal_value or currency changed
        if 'deal_value' in update_dict or 'default_currency' in update_dict:
            if current_deal_value is not None:
                update_dict['deal_value_usd'] = self.calculate_deal_value_usd(current_deal_value, current_currency)
            else:
                update_dict['deal_value_usd'] = None
        
        # Recalculate forecast values if probability, deal_value, or currency changed
        probability = update_dict.get('probability', engagement.probability)
        deal_value = update_dict.get('deal_value', engagement.deal_value)
        deal_value_usd = update_dict.get('deal_value_usd', engagement.deal_value_usd)
        
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
                if engagement.close_date is None:
                    update_dict['close_date'] = date.today()
            else:
                # Clear close_date if status is no longer closing
                update_dict['close_date'] = None
        
        # Recalculate deal_length if close_date or deal_creation_date changed
        if 'close_date' in update_dict or current_deal_creation_date:
            close_date = update_dict.get('close_date', engagement.close_date)
            update_dict['deal_length'] = self.calculate_deal_length(current_deal_creation_date, close_date)
        
        updated = await self.engagement_repo.update(engagement_id, **update_dict)
        await self.session.commit()
        # Reload with account relationship
        updated = await self.engagement_repo.get(engagement_id)
        if not updated:
            return None
        return await self._to_response(updated)
    
    async def delete_engagement(self, engagement_id: UUID) -> bool:
        """Delete an engagement."""
        deleted = await self.engagement_repo.delete(engagement_id)
        await self.session.commit()
        return deleted
    
    async def link_roles_to_engagement(
        self,
        engagement_id: UUID,
        role_ids: List[UUID],
    ) -> bool:
        """Link roles to an engagement.
        
        Note: Roles are now linked through estimate line items, not directly.
        This method is kept for API compatibility but does nothing.
        To link roles, create estimate line items with the desired role_rates.
        """
        # Roles are now linked through estimate line items, not directly to engagements
        # This method is kept for backward compatibility but does nothing
        return True
    
    async def unlink_roles_from_engagement(
        self,
        engagement_id: UUID,
        role_ids: List[UUID],
    ) -> bool:
        """Unlink roles from an engagement.
        
        Note: Roles are now linked through estimate line items, not directly.
        This method is kept for API compatibility but does nothing.
        To unlink roles, remove estimate line items with the desired role_rates.
        """
        # Roles are now linked through estimate line items, not directly to engagements
        # This method is kept for backward compatibility but does nothing
        return True
    
    async def _get_employees_from_active_estimates_for_engagement(self, engagement_id: UUID) -> List[dict]:
        """Get employees from active estimate line items for all releases in an engagement."""
        # Get all releases for this engagement
        releases_result = await self.session.execute(
            select(Release).where(Release.engagement_id == engagement_id)
        )
        releases = releases_result.scalars().all()
        
        employees_dict = {}  # employee_id -> employee data
        
        for release in releases:
            # Get active estimate for this release
            estimate_result = await self.session.execute(
                select(Estimate).where(
                    and_(
                        Estimate.release_id == release.id,
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
    
    async def _get_employees_from_active_estimates_for_release(self, release_id: UUID) -> List[dict]:
        """Get employees from active estimate line items for a release."""
        # Get active estimate for this release
        result = await self.session.execute(
            select(Estimate).where(
                and_(
                    Estimate.release_id == release_id,
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
    
    async def _to_response(self, engagement, include_relationships: bool = False) -> EngagementResponse:
        """Convert engagement model to response schema."""
        account_name = None
        if hasattr(engagement, 'account') and engagement.account:
            account_name = engagement.account.company_name
        
        engagement_dict = {
            "id": str(engagement.id),
            "name": engagement.name,
            "parent_engagement_id": str(engagement.parent_engagement_id) if engagement.parent_engagement_id else None,
            "account_id": str(engagement.account_id),
            "start_date": engagement.start_date.isoformat() if engagement.start_date else None,
            "end_date": engagement.end_date.isoformat() if engagement.end_date else None,
            "status": engagement.status.value if hasattr(engagement.status, 'value') else str(engagement.status),
            "billing_term_id": str(engagement.billing_term_id),
            "engagement_type": engagement.engagement_type.value if hasattr(engagement.engagement_type, 'value') else str(engagement.engagement_type),
            "description": engagement.description,
            "utilization": float(engagement.utilization) if engagement.utilization else None,
            "margin": float(engagement.margin) if engagement.margin else None,
            "default_currency": engagement.default_currency,
            "delivery_center_id": str(engagement.delivery_center_id),
            "engagement_owner_id": str(engagement.engagement_owner_id) if engagement.engagement_owner_id else None,
            "invoice_customer": engagement.invoice_customer,
            "billable_expenses": engagement.billable_expenses,
            "attributes": engagement.attributes,
            "account_name": account_name,
            # New deal/forecast fields
            "probability": float(engagement.probability) if engagement.probability is not None else None,
            "win_probability": engagement.win_probability.value if engagement.win_probability and hasattr(engagement.win_probability, 'value') else (str(engagement.win_probability).lower() if engagement.win_probability else None),
            "accountability": engagement.accountability.value if engagement.accountability and hasattr(engagement.accountability, 'value') else (str(engagement.accountability).lower() if engagement.accountability else None),
            "strategic_importance": engagement.strategic_importance.value if engagement.strategic_importance and hasattr(engagement.strategic_importance, 'value') else (str(engagement.strategic_importance).lower() if engagement.strategic_importance else None),
            "deal_creation_date": engagement.deal_creation_date.isoformat() if engagement.deal_creation_date else None,
            "deal_value": str(engagement.deal_value) if engagement.deal_value is not None else None,
            "deal_value_usd": str(engagement.deal_value_usd) if engagement.deal_value_usd is not None else None,
            "close_date": engagement.close_date.isoformat() if engagement.close_date else None,
            "deal_length": engagement.deal_length,
            "forecast_value": str(engagement.forecast_value) if engagement.forecast_value is not None else None,
            "forecast_value_usd": str(engagement.forecast_value_usd) if engagement.forecast_value_usd is not None else None,
            "project_start_month": engagement.project_start_month,
            "project_start_year": engagement.project_start_year,
            "project_duration_months": engagement.project_duration_months,
        }
        
        if include_relationships:
            # Include releases with their employee associations from active estimates
            releases = []
            if hasattr(engagement, 'releases') and engagement.releases:
                for release in engagement.releases:
                    # Safety check: ensure release belongs to this engagement
                    if release.engagement_id != engagement.id:
                        continue
                    
                    release_dict = {
                        "id": str(release.id),
                        "name": release.name,
                        "engagement_id": str(release.engagement_id),
                        "start_date": release.start_date.isoformat() if release.start_date else None,
                        "end_date": release.end_date.isoformat() if release.end_date else None,
                        "status": release.status.value if hasattr(release.status, 'value') else str(release.status),
                        "employees": await self._get_employees_from_active_estimates_for_release(release.id)
                    }
                    releases.append(release_dict)
            engagement_dict["releases"] = releases
            
            # Include employees directly linked to engagement (from all releases' active estimates)
            employees = await self._get_employees_from_active_estimates_for_engagement(engagement.id)
            engagement_dict["employees"] = employees
        else:
            engagement_dict["releases"] = []
            engagement_dict["employees"] = []
        
        return EngagementResponse.model_validate(engagement_dict)


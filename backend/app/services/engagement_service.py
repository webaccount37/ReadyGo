"""
Engagement service with business logic.
"""

import logging
from typing import List, Optional, Tuple
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

logger = logging.getLogger(__name__)

from app.services.base_service import BaseService
from app.db.repositories.engagement_repository import EngagementRepository
from app.db.repositories.engagement_line_item_repository import EngagementLineItemRepository
from app.db.repositories.engagement_weekly_hours_repository import EngagementWeeklyHoursRepository
from app.db.repositories.engagement_phase_repository import EngagementPhaseRepository
from app.db.repositories.estimate_repository import EstimateRepository
from app.db.repositories.estimate_line_item_repository import EstimateLineItemRepository
from app.db.repositories.estimate_phase_repository import EstimatePhaseRepository
from app.db.repositories.estimate_weekly_hours_repository import EstimateWeeklyHoursRepository
from app.db.repositories.quote_repository import QuoteRepository
from app.db.repositories.role_rate_repository import RoleRateRepository
from app.db.repositories.role_repository import RoleRepository
from app.db.repositories.employee_repository import EmployeeRepository
from app.db.repositories.opportunity_repository import OpportunityRepository
from app.models.engagement import Engagement, EngagementLineItem, EngagementWeeklyHours, EngagementPhase
from app.models.quote import Quote, QuoteStatus, QuoteType
from app.models.estimate import Estimate
from app.models.role_rate import RoleRate
from app.utils.currency_converter import convert_currency
from app.schemas.engagement import (
    EngagementCreate, EngagementUpdate, EngagementResponse, EngagementDetailResponse, EngagementListResponse,
    EngagementLineItemCreate, EngagementLineItemUpdate, EngagementLineItemResponse,
    EngagementWeeklyHoursCreate, EngagementWeeklyHoursResponse,
    EngagementPhaseCreate, EngagementPhaseUpdate, EngagementPhaseResponse,
    ComparativeSummary,
)


class EngagementService(BaseService):
    """Service for engagement operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.engagement_repo = EngagementRepository(session)
        self.line_item_repo = EngagementLineItemRepository(session)
        self.weekly_hours_repo = EngagementWeeklyHoursRepository(session)
        self.phase_repo = EngagementPhaseRepository(session)
        self.estimate_repo = EstimateRepository(session)
        self.estimate_line_item_repo = EstimateLineItemRepository(session)
        self.estimate_phase_repo = EstimatePhaseRepository(session)
        self.estimate_weekly_hours_repo = EstimateWeeklyHoursRepository(session)
        self.quote_repo = QuoteRepository(session)
        self.role_rate_repo = RoleRateRepository(session)
        self.role_repo = RoleRepository(session)
        self.employee_repo = EmployeeRepository(session)
        self.opportunity_repo = OpportunityRepository(session)
    
    async def create_engagement_from_quote(
        self,
        quote_id: UUID,
        created_by: Optional[UUID] = None,
    ) -> EngagementResponse:
        """Create an engagement when a quote is approved.
        
        Copies all phases, line items, and weekly hours from the associated Estimate.
        """
        # Get quote
        quote = await self.quote_repo.get(quote_id)
        if not quote:
            raise ValueError("Quote not found")
        
        # Check if engagement already exists for this quote
        existing_engagements = await self.engagement_repo.list_by_quote(quote_id)
        if existing_engagements:
            logger.warning(f"Engagement already exists for quote {quote_id}")
            return await self._to_response(existing_engagements[0], include_line_items=False)
        
        # Get estimate
        estimate = await self.estimate_repo.get_with_line_items(quote.estimate_id)
        if not estimate:
            raise ValueError("Estimate not found")
        
        # Get opportunity
        opportunity = await self.opportunity_repo.get(quote.opportunity_id)
        if not opportunity:
            raise ValueError("Opportunity not found")
        
        # Generate engagement name from quote number
        engagement_name = f"Engagement - {quote.quote_number}"
        
        # Create engagement
        engagement_dict = {
            "quote_id": quote_id,
            "opportunity_id": quote.opportunity_id,
            "name": engagement_name,
            "description": f"Engagement created from approved quote {quote.quote_number}",
            "created_by": created_by,
            "attributes": {},
        }
        engagement = await self.engagement_repo.create(**engagement_dict)
        
        # Copy phases from estimate
        if estimate.phases:
            for phase in estimate.phases:
                await self.phase_repo.create(
                    engagement_id=engagement.id,
                    name=phase.name,
                    start_date=phase.start_date,
                    end_date=phase.end_date,
                    color=phase.color,
                    row_order=phase.row_order,
                )
        
        # Copy line items and weekly hours from estimate
        # Ensure line items are sorted by row_order
        line_items_to_copy = list(estimate.line_items) if estimate.line_items else []
        line_items_to_copy.sort(key=lambda li: li.row_order if li.row_order is not None else 0)
        
        if line_items_to_copy:
            for line_item in line_items_to_copy:
                # Copy line item (keep original dates - not tied to Opportunity dates)
                new_line_item_dict = {
                    "engagement_id": engagement.id,
                    "role_rates_id": line_item.role_rates_id,
                    "payable_center_id": line_item.payable_center_id,
                    "employee_id": line_item.employee_id,
                    "rate": line_item.rate,
                    "cost": line_item.cost,
                    "currency": line_item.currency,
                    "start_date": line_item.start_date,  # Keep original dates
                    "end_date": line_item.end_date,  # Keep original dates
                    "row_order": line_item.row_order,
                    "billable": line_item.billable,
                    "billable_expense_percentage": line_item.billable_expense_percentage,
                }
                new_line_item = await self.line_item_repo.create(**new_line_item_dict)
                
                # Copy weekly hours - CRITICAL: Query directly from database to ensure we get all records
                # Don't trust the relationship-loaded collection - it may be incomplete
                from app.models.estimate import EstimateWeeklyHours
                weekly_hours_query = select(EstimateWeeklyHours).where(
                    EstimateWeeklyHours.estimate_line_item_id == line_item.id
                )
                weekly_hours_result = await self.session.execute(weekly_hours_query)
                weekly_hours_list = weekly_hours_result.scalars().all()
                
                logger.info(f"Copying {len(weekly_hours_list)} weekly hours from estimate line item {line_item.id} to engagement line item {new_line_item.id}")
                
                if weekly_hours_list:
                    for weekly_hour in weekly_hours_list:
                        await self.weekly_hours_repo.create(
                            engagement_line_item_id=new_line_item.id,
                            week_start_date=weekly_hour.week_start_date,
                            hours=weekly_hour.hours,
                        )
                    logger.info(f"Successfully copied {len(weekly_hours_list)} weekly hours")
                else:
                    logger.warning(f"No weekly hours found for estimate line item {line_item.id}")
        
        await self.session.commit()
        
        # CRITICAL: Expire all objects to force fresh load from database
        # This ensures weekly_hours are properly loaded after creation
        await self.session.expire_all()
        
        # Reload engagement with all relationships
        engagement = await self.engagement_repo.get_with_line_items(engagement.id)
        if not engagement:
            raise ValueError("Failed to retrieve created engagement")
        
        # Log weekly hours count for debugging
        total_weekly_hours = 0
        for line_item in engagement.line_items:
            weekly_hours_count = len(line_item.weekly_hours) if line_item.weekly_hours else 0
            total_weekly_hours += weekly_hours_count
            if weekly_hours_count > 0:
                logger.info(f"Line item {line_item.id} has {weekly_hours_count} weekly hours")
        
        logger.info(f"Engagement {engagement.id} has {total_weekly_hours} total weekly hours across {len(engagement.line_items)} line items")
        
        return await self._to_detail_response(engagement)
    
    async def delete_engagements_by_quote(self, quote_id: UUID) -> int:
        """Delete all engagements associated with a quote.
        
        Returns:
            Number of engagements deleted.
        """
        engagements = await self.engagement_repo.list_by_quote(quote_id)
        deleted_count = 0
        
        for engagement in engagements:
            result = await self.engagement_repo.delete(engagement.id)
            if result:
                deleted_count += 1
                logger.info(f"Deleted engagement {engagement.id} for quote {quote_id}")
        
        if deleted_count > 0:
            await self.session.commit()
            logger.info(f"Deleted {deleted_count} engagement(s) for quote {quote_id}")
        
        return deleted_count
    
    async def get_engagement_detail(self, engagement_id: UUID) -> EngagementDetailResponse:
        """Get engagement detail with comparative summary."""
        engagement = await self.engagement_repo.get_with_line_items(engagement_id)
        if not engagement:
            raise ValueError("Engagement not found")
        
        # Calculate comparative summary
        comparative_summary = await self.calculate_comparative_summary(engagement)
        
        response = await self._to_detail_response(engagement)
        response.comparative_summary = comparative_summary
        
        return response
    
    async def calculate_resource_plan_summary(
        self,
        engagement: Engagement,
    ) -> dict:
        """Calculate Resource Plan totals (Revenue, Cost, Margin Amount, Margin %).
        
        Returns:
            dict with keys: total_revenue, total_cost, margin_amount, margin_percentage, currency
        """
        if not engagement.line_items:
            return {
                "total_revenue": Decimal("0"),
                "total_cost": Decimal("0"),
                "margin_amount": Decimal("0"),
                "margin_percentage": Decimal("0"),
                "currency": "USD",
            }
        
        total_revenue = Decimal("0")
        total_cost = Decimal("0")
        currency = engagement.line_items[0].currency if engagement.line_items else "USD"
        
        for line_item in engagement.line_items:
            # Calculate hours for this line item
            item_hours = Decimal("0")
            if line_item.weekly_hours:
                for weekly_hour in line_item.weekly_hours:
                    item_hours += Decimal(str(weekly_hour.hours))
            
            # Calculate cost and revenue
            item_cost = item_hours * Decimal(str(line_item.cost))
            # If billable is false, revenue should be 0
            item_revenue = item_hours * Decimal(str(line_item.rate)) if line_item.billable else Decimal("0")
            
            total_cost += item_cost
            total_revenue += item_revenue
        
        margin_amount = total_revenue - total_cost
        margin_percentage = (margin_amount / total_revenue * 100) if total_revenue > 0 else Decimal("0")
        
        return {
            "total_revenue": total_revenue,
            "total_cost": total_cost,
            "margin_amount": margin_amount,
            "margin_percentage": margin_percentage,
            "currency": currency,
        }
    
    async def calculate_comparative_summary(
        self,
        engagement: Engagement,
    ) -> ComparativeSummary:
        """Calculate comparative summary between Quote/Estimate and Resource Plan."""
        # Get quote
        quote = await self.quote_repo.get(engagement.quote_id)
        if not quote:
            raise ValueError("Quote not found")
        
        # Get estimate
        estimate = await self.estimate_repo.get_with_line_items(quote.estimate_id)
        if not estimate:
            raise ValueError("Estimate not found")
        
        # Get opportunity for currency
        opportunity = await self.opportunity_repo.get(engagement.opportunity_id)
        if not opportunity:
            raise ValueError("Opportunity not found")
        
        currency = opportunity.default_currency or "USD"
        
        # Calculate Resource Plan summary
        resource_plan_summary = await self.calculate_resource_plan_summary(engagement)
        
        # Calculate Estimate summary (from Estimate line items)
        estimate_summary = await self._calculate_estimate_summary(estimate)
        
        # Calculate Quote amount
        quote_amount = await self._calculate_quote_amount(quote, estimate_summary)
        
        # Calculate deviations
        revenue_deviation = None
        revenue_deviation_percentage = None
        if quote_amount is not None and resource_plan_summary["total_revenue"] is not None:
            revenue_deviation = resource_plan_summary["total_revenue"] - quote_amount
            if quote_amount > 0:
                revenue_deviation_percentage = (revenue_deviation / quote_amount) * 100
        
        margin_deviation = None
        if estimate_summary.get("margin_percentage") is not None and resource_plan_summary["margin_percentage"] is not None:
            margin_deviation = resource_plan_summary["margin_percentage"] - estimate_summary["margin_percentage"]
        
        return ComparativeSummary(
            quote_amount=quote_amount,
            estimate_cost=estimate_summary.get("total_cost"),
            estimate_revenue=estimate_summary.get("total_revenue"),
            estimate_margin_amount=estimate_summary.get("margin_amount"),
            estimate_margin_percentage=estimate_summary.get("margin_percentage"),
            resource_plan_revenue=resource_plan_summary["total_revenue"],
            resource_plan_cost=resource_plan_summary["total_cost"],
            resource_plan_margin_amount=resource_plan_summary["margin_amount"],
            resource_plan_margin_percentage=resource_plan_summary["margin_percentage"],
            revenue_deviation=revenue_deviation,
            revenue_deviation_percentage=revenue_deviation_percentage,
            margin_deviation=margin_deviation,
            currency=currency,
        )
    
    async def _calculate_estimate_summary(self, estimate: Estimate) -> dict:
        """Calculate Estimate totals."""
        if not estimate.line_items:
            return {
                "total_revenue": Decimal("0"),
                "total_cost": Decimal("0"),
                "margin_amount": Decimal("0"),
                "margin_percentage": Decimal("0"),
            }
        
        total_revenue = Decimal("0")
        total_cost = Decimal("0")
        
        for line_item in estimate.line_items:
            item_hours = Decimal("0")
            if line_item.weekly_hours:
                for weekly_hour in line_item.weekly_hours:
                    item_hours += Decimal(str(weekly_hour.hours))
            
            item_cost = item_hours * Decimal(str(line_item.cost))
            item_revenue = item_hours * Decimal(str(line_item.rate)) if line_item.billable else Decimal("0")
            
            total_cost += item_cost
            total_revenue += item_revenue
        
        margin_amount = total_revenue - total_cost
        margin_percentage = (margin_amount / total_revenue * 100) if total_revenue > 0 else Decimal("0")
        
        return {
            "total_revenue": total_revenue,
            "total_cost": total_cost,
            "margin_amount": margin_amount,
            "margin_percentage": margin_percentage,
        }
    
    async def _calculate_quote_amount(self, quote: Quote, estimate_summary: dict) -> Optional[Decimal]:
        """Calculate Quote amount based on quote type."""
        if not quote.quote_type:
            return None
        
        if quote.quote_type == QuoteType.FIXED_BID:
            return Decimal(str(quote.target_amount)) if quote.target_amount else None
        elif quote.quote_type == QuoteType.TIME_MATERIALS:
            # If blended rate, calculate: total hours * blended rate
            from app.models.quote import RateBillingUnit
            if quote.rate_billing_unit in [RateBillingUnit.HOURLY_BLENDED, RateBillingUnit.DAILY_BLENDED]:
                if quote.blended_rate_amount:
                    # Calculate total hours from estimate
                    total_hours = Decimal("0")
                    estimate = await self.estimate_repo.get_with_line_items(quote.estimate_id)
                    if estimate and estimate.line_items:
                        for line_item in estimate.line_items:
                            if line_item.billable and line_item.weekly_hours:
                                for weekly_hour in line_item.weekly_hours:
                                    total_hours += Decimal(str(weekly_hour.hours))
                    return total_hours * Decimal(str(quote.blended_rate_amount))
            # Otherwise use estimate total revenue
            return estimate_summary.get("total_revenue")
        
        return None
    
    async def _get_default_rates_from_role_rate(
        self,
        role_rates_id: UUID,
        employee_id: Optional[UUID] = None,
        target_currency: Optional[str] = None,
        opportunity_delivery_center_id: Optional[UUID] = None,
    ) -> Tuple[Decimal, Decimal]:
        """Get default rate and cost from a role_rate (same logic as EstimateService)."""
        role_rate = await self.role_rate_repo.get(role_rates_id)
        if not role_rate:
            return Decimal("0"), Decimal("0")
        
        rate = Decimal(str(role_rate.external_rate))
        cost = Decimal(str(role_rate.internal_cost_rate))
        rate_currency = role_rate.default_currency
        
        # If employee is provided, use employee cost (but NOT rate)
        if employee_id:
            employee = await self.employee_repo.get(employee_id)
            if employee:
                centers_match = opportunity_delivery_center_id == employee.delivery_center_id if (opportunity_delivery_center_id and employee.delivery_center_id) else False
                
                if centers_match:
                    employee_cost = Decimal(str(employee.internal_cost_rate))
                    cost = employee_cost
                else:
                    employee_cost = Decimal(str(employee.internal_bill_rate))
                    employee_currency = employee.default_currency or "USD"
                    
                    if target_currency and employee_currency.upper() != target_currency.upper():
                        employee_cost_decimal = await convert_currency(
                            float(employee_cost),
                            employee_currency,
                            target_currency,
                            self.session
                        )
                        cost = Decimal(str(employee_cost_decimal))
                    else:
                        cost = employee_cost
        
        # Convert rate to target currency if needed
        if target_currency and rate_currency.upper() != target_currency.upper():
            rate = Decimal(str(await convert_currency(float(rate), rate_currency, target_currency, self.session)))
            if not employee_id:
                cost = Decimal(str(await convert_currency(float(cost), rate_currency, target_currency, self.session)))
        
        return rate, cost
    
    async def _get_role_rate(self, role_id: UUID, delivery_center_id: UUID, currency: str) -> Optional[RoleRate]:
        """Get a role rate for the given role, delivery center, and currency.
        
        Engagements should NEVER create RoleRate records. If a RoleRate doesn't exist,
        it should be created through the Roles management interface first.
        
        Returns:
            RoleRate if found, None otherwise
        """
        result = await self.session.execute(
            select(RoleRate).where(
                and_(
                    RoleRate.role_id == role_id,
                    RoleRate.delivery_center_id == delivery_center_id,
                    RoleRate.default_currency == currency
                )
            )
        )
        return result.scalar_one_or_none()
    
    async def list_engagements(
        self,
        skip: int = 0,
        limit: int = 100,
        opportunity_id: Optional[UUID] = None,
        quote_id: Optional[UUID] = None,
    ) -> Tuple[List[EngagementResponse], int]:
        """List engagements with pagination."""
        filters = {}
        if opportunity_id:
            filters["opportunity_id"] = opportunity_id
        if quote_id:
            filters["quote_id"] = quote_id
        
        engagements = await self.engagement_repo.list(skip=skip, limit=limit, **filters)
        total = await self.engagement_repo.count(**filters)
        
        responses = [await self._to_response(e, include_line_items=False) for e in engagements]
        return responses, total
    
    async def update_engagement(
        self,
        engagement_id: UUID,
        engagement_data: EngagementUpdate,
    ) -> Optional[EngagementResponse]:
        """Update engagement (limited fields)."""
        update_dict = engagement_data.model_dump(exclude_unset=True)
        updated = await self.engagement_repo.update(engagement_id, **update_dict)
        await self.session.commit()
        
        if not updated:
            return None
        return await self._to_response(updated, include_line_items=False)
    
    # Phase CRUD operations
    async def create_phase(
        self,
        engagement_id: UUID,
        phase_data: EngagementPhaseCreate,
    ) -> EngagementPhaseResponse:
        """Create a new phase."""
        max_order = await self.phase_repo.get_max_row_order(engagement_id)
        phase_dict = phase_data.model_dump()
        phase_dict["engagement_id"] = engagement_id
        phase_dict["row_order"] = max_order + 1
        
        phase = await self.phase_repo.create(**phase_dict)
        await self.session.commit()
        
        return EngagementPhaseResponse.model_validate(phase)
    
    async def update_phase(
        self,
        engagement_id: UUID,
        phase_id: UUID,
        phase_data: EngagementPhaseUpdate,
    ) -> Optional[EngagementPhaseResponse]:
        """Update a phase."""
        update_dict = phase_data.model_dump(exclude_unset=True)
        phase = await self.phase_repo.get(phase_id)
        if not phase or phase.engagement_id != engagement_id:
            return None
        
        # Use base repository update
        from sqlalchemy import update
        await self.session.execute(
            update(EngagementPhase)
            .where(EngagementPhase.id == phase_id)
            .values(**update_dict)
        )
        await self.session.commit()
        
        updated = await self.phase_repo.get(phase_id)
        if not updated:
            return None
        return EngagementPhaseResponse.model_validate(updated)
    
    async def delete_phase(
        self,
        engagement_id: UUID,
        phase_id: UUID,
    ) -> bool:
        """Delete a phase."""
        phase = await self.phase_repo.get(phase_id)
        if not phase or phase.engagement_id != engagement_id:
            return False
        
        result = await self.phase_repo.delete(phase_id)
        await self.session.commit()
        return result
    
    # Line item CRUD operations
    async def create_line_item(
        self,
        engagement_id: UUID,
        line_item_data: EngagementLineItemCreate,
    ) -> EngagementLineItemResponse:
        """Create a new line item."""
        # Get engagement to get opportunity for rate lookups
        engagement = await self.engagement_repo.get(engagement_id)
        if not engagement:
            raise ValueError("Engagement not found")
        
        opportunity = await self.opportunity_repo.get(engagement.opportunity_id)
        if not opportunity:
            raise ValueError("Opportunity not found")
        
        line_item_dict = line_item_data.model_dump(exclude_unset=True)
        
        # Handle role_rates_id lookup if role_id + delivery_center_id provided
        if not line_item_dict.get("role_rates_id") and line_item_dict.get("role_id") and line_item_dict.get("delivery_center_id"):
            # Find matching role_rate
            role_rates = await self.role_rate_repo.list(
                role_id=line_item_dict["role_id"],
                delivery_center_id=line_item_dict["delivery_center_id"],
            )
            if not role_rates:
                raise ValueError(f"RoleRate not found for role {line_item_dict['role_id']} and delivery center {line_item_dict['delivery_center_id']}")
            line_item_dict["role_rates_id"] = role_rates[0].id
            # Remove role_id and delivery_center_id from dict as they're not in the model
            # delivery_center_id is used for role_rate lookup, but payable_center_id is what gets stored
            line_item_dict.pop("role_id", None)
            # Handle delivery_center_id - if payable_center_id is not set, use delivery_center_id as payable_center_id
            if "payable_center_id" not in line_item_dict or not line_item_dict.get("payable_center_id"):
                line_item_dict["payable_center_id"] = line_item_dict.get("delivery_center_id")
            line_item_dict.pop("delivery_center_id", None)
        
        # Get default rates if not provided
        if not line_item_dict.get("rate") or not line_item_dict.get("cost"):
            rate, cost = await self._get_default_rates_from_role_rate(
                line_item_dict["role_rates_id"],
                line_item_dict.get("employee_id"),
                opportunity.default_currency,
                opportunity.delivery_center_id,
            )
            if not line_item_dict.get("rate"):
                line_item_dict["rate"] = rate
            if not line_item_dict.get("cost"):
                line_item_dict["cost"] = cost
        
        # Set currency from opportunity if not provided
        if not line_item_dict.get("currency"):
            line_item_dict["currency"] = opportunity.default_currency or "USD"
        
        # Get max row_order
        max_order = await self.line_item_repo.get_max_row_order(engagement_id)
        line_item_dict["engagement_id"] = engagement_id
        line_item_dict["row_order"] = max_order + 1
        
        line_item = await self.line_item_repo.create(**line_item_dict)
        await self.session.commit()
        
        # Reload with relationships
        line_item = await self.line_item_repo.get(line_item.id)
        if not line_item:
            raise ValueError("Failed to retrieve created line item")
        
        return await self._to_line_item_response(line_item)
    
    async def update_line_item(
        self,
        engagement_id: UUID,
        line_item_id: UUID,
        line_item_data: EngagementLineItemUpdate,
    ) -> Optional[EngagementLineItemResponse]:
        """Update a line item."""
        line_item = await self.line_item_repo.get(line_item_id)
        if not line_item or line_item.engagement_id != engagement_id:
            return None
        
        update_dict = line_item_data.model_dump(exclude_unset=True)
        
        # CRITICAL: If employee_id was explicitly set to None (clearing), include it in update_dict
        # Pydantic's exclude_unset=True excludes None values, but we need to preserve None when explicitly set
        if hasattr(line_item_data, 'model_fields_set') and 'employee_id' in line_item_data.model_fields_set:
            if line_item_data.employee_id is None:
                update_dict["employee_id"] = None
        
        # Handle role_id updates - use Opportunity Invoice Center (not Payable Center) for role_rate lookup
        if "role_id" in update_dict:
            # Get currency and opportunity delivery center (Invoice Center) for role_rate lookup
            engagement = await self.engagement_repo.get(engagement_id)
            opportunity = await self.opportunity_repo.get(engagement.opportunity_id) if engagement else None
            currency = update_dict.get("currency") or line_item.currency or (opportunity.default_currency if opportunity else "USD")
            
            # Use Opportunity Invoice Center (delivery_center_id) for role_rate lookup, NOT Payable Center
            opportunity_delivery_center_id = opportunity.delivery_center_id if opportunity else None
            if not opportunity_delivery_center_id:
                raise ValueError("Opportunity Invoice Center (delivery_center_id) is required for role rate lookup")
            
            role_rate = await self._get_role_rate(
                update_dict["role_id"],
                opportunity_delivery_center_id,  # Use Opportunity Invoice Center, not Payable Center
                currency
            )
            if not role_rate:
                raise ValueError(
                    f"RoleRate not found for Role '{update_dict['role_id']}', "
                    f"Delivery Center '{opportunity_delivery_center_id}', Currency '{currency}'. "
                    f"Please create the RoleRate association first before using it in Engagements."
                )
            update_dict["role_rates_id"] = role_rate.id
            # Remove role_id from update_dict as it's not in the model
            update_dict.pop("role_id", None)
        
        # Handle payable_center_id (Payable Center) updates - this is reference-only and doesn't affect rate calculations
        # Payable Center can be any delivery center, it's just stored for reference/export purposes
        if "payable_center_id" in update_dict:
            # Payable Center is stored directly - no need to look up RoleRate
            # It's just a reference field for downstream use
            pass  # payable_center_id will be saved directly to the model
        
        # Handle delivery_center_id (backward compatibility - treat as payable_center_id)
        if "delivery_center_id" in update_dict and "role_id" not in update_dict:
            # For backward compatibility, treat delivery_center_id as payable_center_id
            update_dict["payable_center_id"] = update_dict["delivery_center_id"]
            update_dict.pop("delivery_center_id", None)
        
        # Recalculate rates if role_rates_id/employee changed
        # BUT: Rate lookup should use Role ID + Opportunity Invoice Center (not Payable Center from role_rate)
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
            
            # For rate lookup, use Role ID + Opportunity Invoice Center (not Payable Center)
            if new_role_id:
                engagement = await self.engagement_repo.get(engagement_id)
                opportunity = await self.opportunity_repo.get(engagement.opportunity_id) if engagement else None
                opportunity_delivery_center_id = opportunity.delivery_center_id if opportunity else None
                currency = update_dict.get("currency") or line_item.currency or (opportunity.default_currency if opportunity else "USD")
                
                if opportunity_delivery_center_id:
                    # Get role_rate using Role ID + Opportunity Invoice Center for rate lookup
                    role_rate_for_rates = await self._get_role_rate(
                        new_role_id,
                        opportunity_delivery_center_id,  # Use Opportunity Invoice Center for rate lookup
                        currency
                    )
                    if not role_rate_for_rates:
                        # If RoleRate doesn't exist, use role defaults or 0
                        role = await self.role_repo.get(new_role_id)
                        default_rate = Decimal(str(role.role_external_rate)) if role and role.role_external_rate else Decimal("0")
                        default_cost = Decimal(str(role.role_internal_cost_rate)) if role and role.role_internal_cost_rate else Decimal("0")
                    else:
                        default_rate, default_cost = await self._get_default_rates_from_role_rate(
                            role_rate_for_rates.id,  # Use role_rate with Opportunity Invoice Center
                            new_employee_id,
                            target_currency=currency,  # Pass currency for conversion
                            opportunity_delivery_center_id=opportunity_delivery_center_id,  # Pass opportunity delivery center for comparison
                        )
                else:
                    # Fallback to using the role_rates_id directly if no opportunity delivery center
                    default_rate, default_cost = await self._get_default_rates_from_role_rate(
                        update_dict.get("role_rates_id", line_item.role_rates_id),
                        new_employee_id,
                        target_currency=currency,  # Pass currency for conversion
                        opportunity_delivery_center_id=opportunity_delivery_center_id,  # Pass opportunity delivery center for comparison (may be None)
                    )
            else:
                # Fallback to using the role_rates_id directly
                # Get opportunity delivery center from line item's engagement
                engagement = await self.engagement_repo.get(engagement_id)
                fallback_opportunity_delivery_center_id = None
                if engagement:
                    opportunity = await self.opportunity_repo.get(engagement.opportunity_id) if engagement else None
                    fallback_opportunity_delivery_center_id = opportunity.delivery_center_id if opportunity else None
                
                default_rate, default_cost = await self._get_default_rates_from_role_rate(
                    update_dict.get("role_rates_id", line_item.role_rates_id),
                    new_employee_id,
                    target_currency=currency,  # Pass currency for conversion
                    opportunity_delivery_center_id=fallback_opportunity_delivery_center_id,  # Pass opportunity delivery center for comparison (may be None)
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
        return await self._to_line_item_response(updated)
    
    async def delete_line_item(
        self,
        engagement_id: UUID,
        line_item_id: UUID,
    ) -> bool:
        """Delete a line item."""
        line_item = await self.line_item_repo.get(line_item_id)
        if not line_item or line_item.engagement_id != engagement_id:
            return False
        
        result = await self.line_item_repo.delete(line_item_id)
        await self.session.commit()
        return result
    
    async def update_weekly_hours(
        self,
        engagement_id: UUID,
        line_item_id: UUID,
        weekly_hours: List[EngagementWeeklyHoursCreate],
    ) -> List[EngagementWeeklyHoursResponse]:
        """Update weekly hours for a line item."""
        line_item = await self.line_item_repo.get(line_item_id)
        if not line_item or line_item.engagement_id != engagement_id:
            raise ValueError("Line item not found")
        
        # Delete existing weekly hours
        await self.weekly_hours_repo.delete_by_line_item(line_item_id)
        
        # Create new weekly hours
        results = []
        for wh_data in weekly_hours:
            wh_dict = wh_data.model_dump()
            wh_dict["engagement_line_item_id"] = line_item_id
            wh = await self.weekly_hours_repo.create(**wh_dict)
            results.append(EngagementWeeklyHoursResponse.model_validate(wh))
        
        await self.session.commit()
        return results
    
    async def auto_fill_hours(
        self,
        engagement_id: UUID,
        line_item_id: UUID,
        auto_fill_data: "AutoFillRequest",
    ) -> List["EngagementLineItemResponse"]:
        """Auto-fill weekly hours for a line item based on pattern."""
        from app.schemas.engagement import AutoFillRequest, AutoFillPattern
        from datetime import timedelta
        
        line_item = await self.line_item_repo.get(line_item_id)
        if not line_item or line_item.engagement_id != engagement_id:
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
            
            if start_hours == end_hours:
                for week_start in weeks:
                    hours_by_week[week_start] = start_hours
            else:
                for i, week_start in enumerate(weeks):
                    if num_weeks == 1:
                        hours_by_week[week_start] = start_hours
                    else:
                        if auto_fill_data.pattern == AutoFillPattern.RAMP_UP:
                            calculated_hours = start_hours + (interval_hours * Decimal(str(i)))
                            hours_by_week[week_start] = min(calculated_hours, end_hours)
                        else:  # RAMP_DOWN
                            calculated_hours = start_hours - (interval_hours * Decimal(str(i)))
                            hours_by_week[week_start] = max(calculated_hours, end_hours)
        
        elif auto_fill_data.pattern == AutoFillPattern.RAMP_UP_DOWN:
            start_hours = auto_fill_data.start_hours or Decimal("0")
            end_hours = auto_fill_data.end_hours or Decimal("0")
            interval_hours = auto_fill_data.interval_hours or Decimal("5")
            num_weeks = len(weeks)
            
            if start_hours == end_hours:
                for week_start in weeks:
                    hours_by_week[week_start] = start_hours
            else:
                hours_difference = end_hours - start_hours
                if interval_hours > 0:
                    intervals_to_peak = (hours_difference / interval_hours).quantize(Decimal('1'), rounding='ROUND_UP')
                else:
                    intervals_to_peak = Decimal("0")
                
                intervals_to_end = intervals_to_peak
                peak_index = min(int(intervals_to_peak), num_weeks - 1)
                ramp_down_start_index = max(peak_index, num_weeks - int(intervals_to_end) - 1)
                
                for i, week_start in enumerate(weeks):
                    if num_weeks == 1:
                        hours_by_week[week_start] = start_hours
                    elif i <= ramp_down_start_index:
                        calculated_hours = start_hours + (interval_hours * Decimal(str(i)))
                        hours_by_week[week_start] = min(calculated_hours, end_hours)
                    else:
                        weeks_from_end = (num_weeks - 1) - i
                        intervals_to_subtract = intervals_to_end - Decimal(str(weeks_from_end))
                        calculated_hours = end_hours - (intervals_to_subtract * interval_hours)
                        hours_by_week[week_start] = max(calculated_hours, start_hours)
        
        elif auto_fill_data.pattern == AutoFillPattern.CUSTOM:
            if auto_fill_data.custom_hours:
                hours_by_week = {date.fromisoformat(k): v for k, v in auto_fill_data.custom_hours.items()}
            else:
                hours_by_week = {}
        
        # Delete existing weekly hours for this line item
        await self.weekly_hours_repo.delete_by_line_item(line_item_id)
        
        # Create new weekly hours
        for week_start, hours in hours_by_week.items():
            await self.weekly_hours_repo.create(
                engagement_line_item_id=line_item_id,
                week_start_date=week_start,
                hours=hours,
            )
        
        await self.session.commit()
        
        # Return updated line item
        updated_line_item = await self.line_item_repo.get(line_item_id)
        if not updated_line_item:
            raise ValueError("Line item not found after update")
        
        return [await self._to_line_item_response(updated_line_item)]
    
    def _generate_weeks(self, start_date: date, end_date: date) -> List[date]:
        """Generate list of week start dates (Sundays) between start and end dates."""
        from datetime import timedelta
        
        weeks = []
        current = self._get_week_start(start_date)
        end_week_start = self._get_week_start(end_date)
        
        while current <= end_week_start:
            weeks.append(current)
            current += timedelta(days=7)
        
        return weeks
    
    def _get_week_start(self, d: date) -> date:
        """Get the Sunday (week start) for a given date."""
        from datetime import timedelta
        
        # weekday() returns 0=Monday, 1=Tuesday, ..., 6=Sunday
        # To get days since Sunday: (weekday() + 1) % 7
        days_since_sunday = (d.weekday() + 1) % 7
        return d - timedelta(days=days_since_sunday)
    
    # Response conversion methods
    async def _to_response(
        self,
        engagement: Engagement,
        include_line_items: bool = False,
    ) -> EngagementResponse:
        """Convert Engagement model to response schema."""
        opportunity = await self.opportunity_repo.get(engagement.opportunity_id)
        quote = await self.quote_repo.get(engagement.quote_id)
        
        response_dict = {
            "id": engagement.id,
            "quote_id": engagement.quote_id,
            "opportunity_id": engagement.opportunity_id,
            "name": engagement.name,
            "description": engagement.description,
            "created_by": engagement.created_by,
            "created_at": engagement.created_at.isoformat() if engagement.created_at else None,
            "attributes": engagement.attributes or {},
            "opportunity_name": opportunity.name if opportunity else None,
            "quote_number": quote.quote_number if quote else None,
            "created_by_name": None,
            "phases": [],
            "line_items": [],
        }
        
        # Get created_by name
        if engagement.created_by:
            employee = await self.employee_repo.get(engagement.created_by)
            if employee:
                response_dict["created_by_name"] = f"{employee.first_name} {employee.last_name}".strip()
        
        # Get phases
        if engagement.phases:
            response_dict["phases"] = [
                EngagementPhaseResponse.model_validate(p) for p in engagement.phases
            ]
        
        # Get line items if requested
        if include_line_items and engagement.line_items:
            response_dict["line_items"] = [
                await self._to_line_item_response(li) for li in engagement.line_items
            ]
        
        return EngagementResponse(**response_dict)
    
    async def _to_detail_response(self, engagement: Engagement) -> EngagementDetailResponse:
        """Convert Engagement model to detail response schema."""
        base_response = await self._to_response(engagement, include_line_items=True)
        return EngagementDetailResponse(**base_response.model_dump())
    
    async def _to_line_item_response(self, line_item: EngagementLineItem) -> EngagementLineItemResponse:
        """Convert EngagementLineItem model to response schema."""
        response_dict = {
            "id": line_item.id,
            "engagement_id": line_item.engagement_id,
            "role_rates_id": line_item.role_rates_id,
            "payable_center_id": line_item.payable_center_id,
            "employee_id": line_item.employee_id,
            "rate": line_item.rate,
            "cost": line_item.cost,
            "currency": line_item.currency,
            "start_date": line_item.start_date.isoformat() if line_item.start_date else None,
            "end_date": line_item.end_date.isoformat() if line_item.end_date else None,
            "row_order": line_item.row_order,
            "billable": line_item.billable,
            "billable_expense_percentage": line_item.billable_expense_percentage,
            "role_name": None,
            "delivery_center_name": None,
            "payable_center_name": None,
            "employee_name": None,
            "weekly_hours": [],
        }
        
        # Get role name
        if line_item.role_rate and line_item.role_rate.role:
            response_dict["role_id"] = line_item.role_rate.role.id
            response_dict["role_name"] = line_item.role_rate.role.role_name
        
        # Get delivery center name
        if line_item.role_rate and line_item.role_rate.delivery_center:
            response_dict["delivery_center_name"] = line_item.role_rate.delivery_center.name
        
        # Get payable center name
        if line_item.payable_center:
            response_dict["payable_center_name"] = line_item.payable_center.name
        
        # Get employee name
        if line_item.employee:
            response_dict["employee_name"] = f"{line_item.employee.first_name} {line_item.employee.last_name}".strip()
        
        # Get weekly hours
        if line_item.weekly_hours:
            response_dict["weekly_hours"] = [
                EngagementWeeklyHoursResponse.model_validate({
                    "id": wh.id,
                    "week_start_date": wh.week_start_date.isoformat() if isinstance(wh.week_start_date, date) else str(wh.week_start_date),
                    "hours": wh.hours,
                }) for wh in line_item.weekly_hours
            ]
        
        return EngagementLineItemResponse(**response_dict)

"""
Engagement service with business logic.
"""

import logging
from typing import List, Optional, Tuple
from uuid import UUID
from datetime import date, datetime, timedelta
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

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
from app.db.repositories.timesheet_entry_repository import TimesheetEntryRepository
from app.db.repositories.role_rate_repository import RoleRateRepository
from app.db.repositories.role_repository import RoleRepository
from app.db.repositories.employee_repository import EmployeeRepository
from app.db.repositories.opportunity_repository import OpportunityRepository
from app.models.delivery_center import DeliveryCenter
from app.models.engagement import Engagement, EngagementLineItem, EngagementWeeklyHours, EngagementPhase
from app.models.quote import Quote, QuoteStatus, QuoteType
from app.models.estimate import Estimate
from app.models.role_rate import RoleRate
from app.utils.currency_converter import convert_currency
from app.utils.quote_display import compute_quote_display_name
from app.utils.planning_week_hours import (
    resolve_opportunity_scope_for_estimate,
    sum_billable_counted_hours_for_estimate,
    sum_counted_weekly_hours_for_line,
)
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
        self.timesheet_entry_repo = TimesheetEntryRepository(session)
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
        
        engagement_name = f"Engagement - {opportunity.name}"

        # Compute quote display name for description
        snapshot = quote.snapshot_data or {}
        if not snapshot.get("account_name") and not snapshot.get("name"):
            from app.utils.quote_display import _format_date_mmddyyyy
            unique_suffix = str(quote.id).replace("-", "")[:4]
            date_part = _format_date_mmddyyyy(quote.created_at)
            quote_display_name = f"QT-Quote-{date_part}-{unique_suffix}-v{quote.version}"
        else:
            quote_display_name = compute_quote_display_name(
                account_name=snapshot.get("account_name"),
                opportunity_name=snapshot.get("name") or opportunity.name,
                version=quote.version,
                quote_id=quote.id,
                quote_created_at=quote.created_at,
            )

        # Create engagement
        engagement_dict = {
            "quote_id": quote_id,
            "opportunity_id": quote.opportunity_id,
            "name": engagement_name,
            "description": f"Engagement created from approved quote {quote_display_name}",
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
        
        # CRITICAL: Capture engagement_id BEFORE expire_all - accessing engagement.id after
        # expire_all() triggers a sync refresh in async context, causing MissingGreenlet.
        engagement_id = engagement.id
        
        # Expire all objects to force fresh load from database
        # This ensures weekly_hours are properly loaded after creation
        self.session.expire_all()
        
        # Reload engagement with all relationships
        engagement = await self.engagement_repo.get_with_line_items(engagement_id)
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
        
        # Sync engagement to timesheets so employees see it on their timesheets
        from app.services.timesheet_service import TimesheetService
        timesheet_svc = TimesheetService(self.session)
        await timesheet_svc.sync_engagement_to_timesheets(engagement.id)
        
        return await self._to_detail_response(engagement)
    
    async def delete_engagements_by_quote(self, quote_id: UUID) -> int:
        """Delete all engagements associated with a quote.
        
        Deletes timesheet entries for those engagements first (to satisfy FK constraints),
        then deletes the engagements.
        
        Returns:
            Number of engagements deleted.
        """
        engagements = await self.engagement_repo.list_by_quote(quote_id)
        if not engagements:
            return 0

        engagement_ids = [e.id for e in engagements]
        # Delete timesheet entries before engagements (FK from timesheet_entries.engagement_id)
        entries_deleted = await self.timesheet_entry_repo.delete_by_engagement_ids(engagement_ids)
        if entries_deleted > 0:
            logger.info(f"Deleted {entries_deleted} timesheet entry(ies) for quote {quote_id} engagements")

        deleted_count = 0
        for engagement in engagements:
            result = await self.engagement_repo.delete(engagement.id)
            if result:
                deleted_count += 1
                logger.info(f"Deleted engagement {engagement.id} for quote {quote_id}")

        return deleted_count
    
    async def get_engagement_detail(self, engagement_id: UUID) -> EngagementDetailResponse:
        """Get engagement detail with comparative summary."""
        engagement = await self.engagement_repo.get_with_line_items(engagement_id)
        if not engagement:
            raise ValueError("Engagement not found")
        
        # Calculate comparative summary (full if quote exists, partial with Actuals otherwise)
        try:
            comparative_summary = await self.calculate_comparative_summary(engagement)
        except ValueError:
            # Quote/estimate missing - return partial summary with Resource Plan + Actuals
            comparative_summary = await self._calculate_partial_comparative_summary(engagement)
        
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
            # Hours in weeks overlapping the line item window (matches staffing grid totals)
            item_hours = sum_counted_weekly_hours_for_line(
                line_item.start_date,
                line_item.end_date,
                line_item.weekly_hours or (),
                opportunity_scope=None,
            )
            
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
    
    async def calculate_actuals_from_approved_timesheets(
        self, engagement: Engagement
    ) -> Decimal:
        """Sum hours * invoice_rate from TimesheetApprovedSnapshot for this engagement (billable only)."""
        summary = await self.calculate_actuals_summary(engagement)
        return summary["total_revenue"]

    async def calculate_actuals_summary(
        self, engagement: Engagement
    ) -> dict:
        """Calculate Actuals (Revenue, Cost, Margin) from approved timesheet snapshots."""
        from app.models.timesheet import TimesheetApprovedSnapshot, TimesheetEntry, Timesheet, TimesheetStatus
        from sqlalchemy import select

        snapshots_query = (
            select(
                TimesheetApprovedSnapshot.hours,
                TimesheetApprovedSnapshot.invoice_rate,
                TimesheetApprovedSnapshot.invoice_cost,
                TimesheetApprovedSnapshot.billable,
            )
            .join(TimesheetEntry, TimesheetApprovedSnapshot.timesheet_entry_id == TimesheetEntry.id)
            .join(Timesheet, TimesheetEntry.timesheet_id == Timesheet.id)
            .where(
                TimesheetEntry.engagement_id == engagement.id,
                Timesheet.status.in_([TimesheetStatus.APPROVED, TimesheetStatus.INVOICED]),
            )
        )
        result = await self.session.execute(snapshots_query)
        rows = result.all()
        total_revenue = Decimal("0")
        total_cost = Decimal("0")
        for row in rows:
            hours = Decimal(str(row.hours or 0))
            rate = Decimal(str(row.invoice_rate or 0))
            cost = Decimal(str(row.invoice_cost or 0))
            total_cost += hours * cost
            if row.billable:
                total_revenue += hours * rate
        margin_amount = total_revenue - total_cost
        margin_percentage = (margin_amount / total_revenue * 100) if total_revenue > 0 else Decimal("0")
        return {
            "total_revenue": total_revenue,
            "total_cost": total_cost,
            "margin_amount": margin_amount,
            "margin_percentage": margin_percentage,
        }

    async def get_approved_hours_by_week(
        self, engagement_id: UUID
    ) -> dict:
        """Get approved timesheet hours/revenue/cost per week per line item and totals.
        Uses TimesheetApprovedSnapshot for invoiced amounts.
        """
        from app.models.timesheet import TimesheetApprovedSnapshot, TimesheetEntry, Timesheet, TimesheetStatus
        from sqlalchemy import select, func, case

        # Verify engagement exists
        engagement = await self.engagement_repo.get(engagement_id)
        if not engagement:
            raise ValueError("Engagement not found")

        # Query: group by week_start_date and engagement_line_item_id
        # Sum hours, revenue (hours * invoice_rate for billable), cost (hours * invoice_cost)
        subq = (
            select(
                Timesheet.week_start_date,
                TimesheetEntry.engagement_line_item_id,
                func.sum(TimesheetApprovedSnapshot.hours).label("hours"),
                func.sum(
                    case(
                        (TimesheetApprovedSnapshot.billable == True,
                         TimesheetApprovedSnapshot.hours * TimesheetApprovedSnapshot.invoice_rate),
                        else_=0,
                    )
                ).label("revenue"),
                func.sum(TimesheetApprovedSnapshot.hours * TimesheetApprovedSnapshot.invoice_cost).label("cost"),
            )
            .select_from(TimesheetApprovedSnapshot)
            .join(TimesheetEntry, TimesheetApprovedSnapshot.timesheet_entry_id == TimesheetEntry.id)
            .join(Timesheet, TimesheetEntry.timesheet_id == Timesheet.id)
            .where(
                TimesheetEntry.engagement_id == engagement_id,
                TimesheetEntry.engagement_line_item_id.isnot(None),
                Timesheet.status.in_([TimesheetStatus.APPROVED, TimesheetStatus.INVOICED]),
            )
            .group_by(Timesheet.week_start_date, TimesheetEntry.engagement_line_item_id)
        )
        result = await self.session.execute(subq)
        rows = result.all()

        by_line_item: dict = {}
        by_week: dict = {}

        for row in rows:
            week_start = row.week_start_date
            line_item_id = row.engagement_line_item_id
            if not week_start or not line_item_id:
                continue
            week_key = week_start.isoformat() if hasattr(week_start, "isoformat") else str(week_start)
            hours_val = str(row.hours or 0)
            revenue_val = str(row.revenue or 0)
            cost_val = str(row.cost or 0)
            data = {"hours": hours_val, "revenue": revenue_val, "cost": cost_val}

            # by_line_item
            li_key = str(line_item_id)
            if li_key not in by_line_item:
                by_line_item[li_key] = {}
            by_line_item[li_key][week_key] = data

            # by_week aggregates
            if week_key not in by_week:
                by_week[week_key] = {"hours": "0", "revenue": "0", "cost": "0"}
            prev = by_week[week_key]
            by_week[week_key] = {
                "hours": str(Decimal(prev["hours"]) + Decimal(hours_val)),
                "revenue": str(Decimal(prev["revenue"]) + Decimal(revenue_val)),
                "cost": str(Decimal(prev["cost"]) + Decimal(cost_val)),
            }

        return {"by_line_item": by_line_item, "by_week": by_week}

    async def _calculate_partial_comparative_summary(
        self,
        engagement: Engagement,
    ) -> ComparativeSummary:
        """Build comparative summary when quote/estimate is missing. Includes Resource Plan + Actuals only."""
        resource_plan_summary = await self.calculate_resource_plan_summary(engagement)
        actuals_summary = await self.calculate_actuals_summary(engagement)
        opportunity = await self.opportunity_repo.get(engagement.opportunity_id)
        currency = (opportunity and opportunity.default_currency) or "USD"
        plan_vs_actuals_revenue_deviation = None
        plan_vs_actuals_revenue_deviation_percentage = None
        plan_vs_actuals_margin_deviation = None
        if resource_plan_summary["total_revenue"] is not None and actuals_summary["total_revenue"] is not None:
            plan_vs_actuals_revenue_deviation = resource_plan_summary["total_revenue"] - actuals_summary["total_revenue"]
            if resource_plan_summary["total_revenue"] > 0:
                plan_vs_actuals_revenue_deviation_percentage = (
                    plan_vs_actuals_revenue_deviation / resource_plan_summary["total_revenue"]
                ) * 100
        if resource_plan_summary["margin_percentage"] is not None and actuals_summary["margin_percentage"] is not None:
            plan_vs_actuals_margin_deviation = (
                resource_plan_summary["margin_percentage"] - actuals_summary["margin_percentage"]
            )
        return ComparativeSummary(
            quote_amount=None,
            estimate_cost=None,
            estimate_revenue=None,
            estimate_margin_amount=None,
            estimate_margin_percentage=None,
            resource_plan_revenue=resource_plan_summary["total_revenue"],
            resource_plan_cost=resource_plan_summary["total_cost"],
            resource_plan_margin_amount=resource_plan_summary["margin_amount"],
            resource_plan_margin_percentage=resource_plan_summary["margin_percentage"],
            actuals_revenue=actuals_summary["total_revenue"],
            actuals_cost=actuals_summary["total_cost"],
            actuals_margin_amount=actuals_summary["margin_amount"],
            actuals_margin_percentage=actuals_summary["margin_percentage"],
            revenue_deviation=None,
            revenue_deviation_percentage=None,
            margin_deviation=None,
            plan_vs_actuals_revenue_deviation=plan_vs_actuals_revenue_deviation,
            plan_vs_actuals_revenue_deviation_percentage=plan_vs_actuals_revenue_deviation_percentage,
            plan_vs_actuals_margin_deviation=plan_vs_actuals_margin_deviation,
            currency=currency,
        )
    
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
        
        # Calculate Actuals from approved timesheets
        actuals_summary = await self.calculate_actuals_summary(engagement)
        
        # Plan vs Actuals deviations
        plan_vs_actuals_revenue_deviation = None
        plan_vs_actuals_revenue_deviation_percentage = None
        plan_vs_actuals_margin_deviation = None
        if resource_plan_summary["total_revenue"] is not None and actuals_summary["total_revenue"] is not None:
            plan_vs_actuals_revenue_deviation = resource_plan_summary["total_revenue"] - actuals_summary["total_revenue"]
            if resource_plan_summary["total_revenue"] > 0:
                plan_vs_actuals_revenue_deviation_percentage = (
                    plan_vs_actuals_revenue_deviation / resource_plan_summary["total_revenue"]
                ) * 100
        if resource_plan_summary["margin_percentage"] is not None and actuals_summary["margin_percentage"] is not None:
            plan_vs_actuals_margin_deviation = (
                resource_plan_summary["margin_percentage"] - actuals_summary["margin_percentage"]
            )
        
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
            actuals_revenue=actuals_summary["total_revenue"],
            actuals_cost=actuals_summary["total_cost"],
            actuals_margin_amount=actuals_summary["margin_amount"],
            actuals_margin_percentage=actuals_summary["margin_percentage"],
            revenue_deviation=revenue_deviation,
            revenue_deviation_percentage=revenue_deviation_percentage,
            margin_deviation=margin_deviation,
            plan_vs_actuals_revenue_deviation=plan_vs_actuals_revenue_deviation,
            plan_vs_actuals_revenue_deviation_percentage=plan_vs_actuals_revenue_deviation_percentage,
            plan_vs_actuals_margin_deviation=plan_vs_actuals_margin_deviation,
            currency=currency,
        )
    
    async def _calculate_estimate_summary(self, estimate: Estimate) -> dict:
        """Calculate Estimate totals (aligned with estimate spreadsheet: opportunity scope + line dates)."""
        if not estimate.line_items:
            return {
                "total_revenue": Decimal("0"),
                "total_cost": Decimal("0"),
                "margin_amount": Decimal("0"),
                "margin_percentage": Decimal("0"),
            }

        opportunity = getattr(estimate, "opportunity", None)
        if opportunity is None and estimate.opportunity_id:
            opportunity = await self.opportunity_repo.get(estimate.opportunity_id)
        opportunity_scope = None
        if opportunity is not None:
            opportunity_scope = resolve_opportunity_scope_for_estimate(
                opportunity.start_date,
                opportunity.end_date,
            )

        total_revenue = Decimal("0")
        total_cost = Decimal("0")

        for line_item in estimate.line_items:
            item_hours = sum_counted_weekly_hours_for_line(
                line_item.start_date,
                line_item.end_date,
                line_item.weekly_hours or (),
                opportunity_scope=opportunity_scope,
            )

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
    
    async def get_quote_total_revenue(self, quote_id: UUID) -> Optional[Decimal]:
        """Calculate Quote total revenue (for opportunity deal_value on approval)."""
        quote = await self.quote_repo.get(quote_id)
        if not quote:
            return None
        estimate = await self.estimate_repo.get_with_line_items(quote.estimate_id)
        if not estimate:
            return None
        estimate_summary = await self._calculate_estimate_summary(estimate)
        return await self._calculate_quote_amount(quote, estimate_summary)

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
                    estimate = await self.estimate_repo.get_with_line_items(quote.estimate_id)
                    opportunity = (
                        getattr(estimate, "opportunity", None) if estimate else None
                    )
                    if opportunity is None and estimate and estimate.opportunity_id:
                        opportunity = await self.opportunity_repo.get(estimate.opportunity_id)
                    opportunity_scope = None
                    if opportunity is not None:
                        opportunity_scope = resolve_opportunity_scope_for_estimate(
                            opportunity.start_date,
                            opportunity.end_date,
                        )
                    total_hours = (
                        sum_billable_counted_hours_for_estimate(
                            estimate.line_items if estimate else (),
                            opportunity_scope,
                        )
                        if estimate
                        else Decimal("0")
                    )
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
        """Resolve RoleRate for role + Opportunity Invoice Center (delivery_center_id).

        Same rules as EstimateService._get_role_rate: DC-only row selection, then convert
        in _get_default_rates_from_role_rate to line/invoice currency.
        """
        _ = currency

        all_for_dc = list(
            (
                await self.session.execute(
                    select(RoleRate)
                    .where(
                        and_(
                            RoleRate.role_id == role_id,
                            RoleRate.delivery_center_id == delivery_center_id,
                        )
                    )
                    .order_by(RoleRate.default_currency.asc())
                )
            ).scalars().all()
        )
        if not all_for_dc:
            return None
        if len(all_for_dc) == 1:
            return all_for_dc[0]

        dc = (
            await self.session.execute(select(DeliveryCenter).where(DeliveryCenter.id == delivery_center_id))
        ).scalar_one_or_none()
        dc_currency = (dc.default_currency or "").upper() if dc else ""
        for rr in all_for_dc:
            if (rr.default_currency or "").upper() == dc_currency:
                return rr
        return all_for_dc[0]
    
    async def list_engagements(
        self,
        skip: int = 0,
        limit: int = 100,
        opportunity_id: Optional[UUID] = None,
        quote_id: Optional[UUID] = None,
        employee_id: Optional[UUID] = None,
        week_start_date: Optional["date"] = None,
        search: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_order: Optional[str] = None,
    ) -> Tuple[List[EngagementResponse], int]:
        """List engagements with pagination.
        When employee_id and week_start_date are both set, only return engagements where
        a line item for that employee overlaps the given week (for timesheet project dropdown).
        """
        if employee_id:
            engagements = await self.engagement_repo.list_by_employee_on_resource_plan(
                employee_id=employee_id,
                skip=skip,
                limit=limit,
                week_start_date=week_start_date,
            )
            if week_start_date is not None:
                total = await self.engagement_repo.count_by_employee_on_resource_plan_for_week(
                    employee_id, week_start_date
                )
            else:
                total = await self.engagement_repo.count_by_employee_on_resource_plan(employee_id)
        else:
            filters = {}
            if opportunity_id:
                filters["opportunity_id"] = opportunity_id
            if quote_id:
                filters["quote_id"] = quote_id
            engagements = await self.engagement_repo.list(
                skip=skip,
                limit=limit,
                include_line_items=True,
                search=search,
                sort_by=sort_by,
                sort_order=sort_order,
                **filters,
            )
            total = await self.engagement_repo.count(search=search, **filters)

        responses = []
        for e in engagements:
            base = await self._to_response(e, include_line_items=False)
            plan_summary = await self.calculate_resource_plan_summary(e)
            actuals_summary = await self.calculate_actuals_summary(e)
            try:
                comparative = await self.calculate_comparative_summary(e)
            except ValueError:
                comparative = await self._calculate_partial_comparative_summary(e)
            base_dict = base.model_dump()
            base_dict["plan_amount"] = plan_summary.get("total_revenue")
            base_dict["actuals_amount"] = actuals_summary.get("total_revenue")
            base_dict["revenue_deviation_percentage"] = comparative.revenue_deviation_percentage
            base_dict["plan_vs_actuals_revenue_deviation_percentage"] = comparative.plan_vs_actuals_revenue_deviation_percentage
            responses.append(EngagementResponse(**base_dict))
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

    async def update_timesheet_approvers(
        self, engagement_id: UUID, employee_ids: List[UUID]
    ) -> List[dict]:
        """Update timesheet approvers for an engagement."""
        engagement = await self.engagement_repo.get(engagement_id)
        if not engagement:
            raise ValueError("Engagement not found")
        from app.db.repositories.engagement_timesheet_approver_repository import EngagementTimesheetApproverRepository
        approver_repo = EngagementTimesheetApproverRepository(self.session)
        await approver_repo.set_approvers(engagement_id, employee_ids)
        await self.session.commit()
        approvers = await approver_repo.list_by_engagement(engagement_id)
        return [
            {
                "employee_id": a.employee_id,
                "employee_name": f"{a.employee.first_name} {a.employee.last_name}".strip() if a.employee else None,
            }
            for a in approvers
        ]

    async def update_expense_approvers(
        self, engagement_id: UUID, employee_ids: List[UUID]
    ) -> List[dict]:
        """Update expense approvers for an engagement."""
        engagement = await self.engagement_repo.get(engagement_id)
        if not engagement:
            raise ValueError("Engagement not found")
        from app.db.repositories.engagement_expense_approver_repository import EngagementExpenseApproverRepository

        repo = EngagementExpenseApproverRepository(self.session)
        await repo.set_approvers(engagement_id, employee_ids)
        await self.session.commit()
        approvers = await repo.list_by_engagement(engagement_id)
        return [
            {
                "employee_id": a.employee_id,
                "employee_name": f"{a.employee.first_name} {a.employee.last_name}".strip() if a.employee else None,
            }
            for a in approvers
        ]

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
        
        # Always store row currency as the Opportunity invoice currency
        line_item_dict["currency"] = opportunity.default_currency or "USD"
        
        # Get max row_order
        max_order = await self.line_item_repo.get_max_row_order(engagement_id)
        line_item_dict["engagement_id"] = engagement_id
        line_item_dict["row_order"] = max_order + 1
        
        line_item = await self.line_item_repo.create(**line_item_dict)
        await self.session.commit()
        
        # Sync engagement to timesheets so the new line item appears
        from app.services.timesheet_service import TimesheetService
        timesheet_svc = TimesheetService(self.session)
        await timesheet_svc.sync_engagement_to_timesheets(engagement_id)
        
        # Reload with relationships
        line_item = await self.line_item_repo.get(line_item.id)
        if not line_item:
            raise ValueError("Failed to retrieve created line item")
        
        return await self._to_line_item_response(line_item)
    
    async def _line_item_has_approved_timesheets(self, line_item_id: UUID) -> bool:
        """Check if a line item has any approved timesheet entries (APPROVED or INVOICED with hours > 0)."""
        from app.models.timesheet import TimesheetEntry, Timesheet, TimesheetStatus
        from sqlalchemy import select, func

        hours_expr = (
            func.coalesce(TimesheetEntry.sun_hours, 0) + func.coalesce(TimesheetEntry.mon_hours, 0)
            + func.coalesce(TimesheetEntry.tue_hours, 0) + func.coalesce(TimesheetEntry.wed_hours, 0)
            + func.coalesce(TimesheetEntry.thu_hours, 0) + func.coalesce(TimesheetEntry.fri_hours, 0)
            + func.coalesce(TimesheetEntry.sat_hours, 0)
        )
        result = await self.session.execute(
            select(func.count())
            .select_from(TimesheetEntry)
            .join(Timesheet, TimesheetEntry.timesheet_id == Timesheet.id)
            .where(
                TimesheetEntry.engagement_line_item_id == line_item_id,
                Timesheet.status.in_([TimesheetStatus.APPROVED, TimesheetStatus.INVOICED]),
                hours_expr > 0,
            )
        )
        return (result.scalar_one() or 0) > 0

    async def _get_approved_weeks_for_line_item(self, line_item_id: UUID) -> List[date]:
        """Get week_start_date for all approved timesheet entries with hours for this line item."""
        from app.models.timesheet import TimesheetEntry, Timesheet, TimesheetStatus
        from sqlalchemy import select, func

        hours_expr = (
            func.coalesce(TimesheetEntry.sun_hours, 0) + func.coalesce(TimesheetEntry.mon_hours, 0)
            + func.coalesce(TimesheetEntry.tue_hours, 0) + func.coalesce(TimesheetEntry.wed_hours, 0)
            + func.coalesce(TimesheetEntry.thu_hours, 0) + func.coalesce(TimesheetEntry.fri_hours, 0)
            + func.coalesce(TimesheetEntry.sat_hours, 0)
        )
        result = await self.session.execute(
            select(Timesheet.week_start_date)
            .join(TimesheetEntry, TimesheetEntry.timesheet_id == Timesheet.id)
            .where(
                TimesheetEntry.engagement_line_item_id == line_item_id,
                Timesheet.status.in_([TimesheetStatus.APPROVED, TimesheetStatus.INVOICED]),
                hours_expr > 0,
            )
            .distinct()
        )
        return [row[0] for row in result.all() if row[0]]

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

        engagement = await self.engagement_repo.get(engagement_id)
        opportunity = await self.opportunity_repo.get(engagement.opportunity_id) if engagement else None
        # Single invoice currency: Opportunity default_currency (row.currency is denormalized copy only).
        invoice_currency = ((opportunity.default_currency or "").strip() or "USD") if opportunity else "USD"

        # When timesheet is approved: block Payable Center, Role, Billable, Employee; allow Cost, Rate
        # Start/end dates: allow only if new range still covers all approved weeks
        has_approved = await self._line_item_has_approved_timesheets(line_item_id)
        if has_approved:
            blocked = []
            old_pc = str(line_item.payable_center_id) if line_item.payable_center_id else None
            new_pc = str(update_dict["payable_center_id"]) if update_dict.get("payable_center_id") else None
            if "payable_center_id" in update_dict and new_pc != old_pc:
                blocked.append("Payable Center")
            old_role = str(line_item.role_rates_id) if line_item.role_rates_id else None
            new_role = str(update_dict["role_rates_id"]) if update_dict.get("role_rates_id") else None
            if "role_rates_id" in update_dict and new_role != old_role:
                blocked.append("Role")
            if "billable" in update_dict and update_dict.get("billable") != line_item.billable:
                blocked.append("Billable")
            if "employee_id" in update_dict:
                new_emp = update_dict.get("employee_id")
                old_emp = str(line_item.employee_id) if line_item.employee_id else None
                if (new_emp or None) != (old_emp or None):
                    blocked.append("Employee")
            if blocked:
                raise ValueError(
                    f"Cannot change {', '.join(blocked)}: this line item has approved timesheet entries. "
                    "Cost and Rate may still be changed."
                )
            # Validate start/end dates: new range must cover all approved weeks
            if "start_date" in update_dict or "end_date" in update_dict:
                approved_weeks = await self._get_approved_weeks_for_line_item(line_item_id)
                new_start = update_dict.get("start_date")
                new_end = update_dict.get("end_date")
                if new_start is None:
                    new_start = line_item.start_date
                elif isinstance(new_start, str):
                    new_start = datetime.strptime(new_start, "%Y-%m-%d").date() if new_start else line_item.start_date
                if new_end is None:
                    new_end = line_item.end_date
                elif isinstance(new_end, str):
                    new_end = datetime.strptime(new_end, "%Y-%m-%d").date() if new_end else line_item.end_date
                for week_start in approved_weeks:
                    week_end = week_start + timedelta(days=6)
                    if new_start > week_start or new_end < week_end:
                        raise ValueError(
                            f"Cannot change dates: approved timesheet exists for week of {week_start}. "
                            "New date range must include all weeks with approved timesheets."
                        )
        
        # CRITICAL: If employee_id was explicitly set to None (clearing), include it in update_dict
        # Pydantic's exclude_unset=True excludes None values, but we need to preserve None when explicitly set
        if hasattr(line_item_data, 'model_fields_set') and 'employee_id' in line_item_data.model_fields_set:
            if line_item_data.employee_id is None:
                # Cannot remove employee if they have timesheet entries for this engagement
                if line_item.employee_id:
                    from sqlalchemy import select, func
                    from app.models.timesheet import TimesheetEntry
                    result = await self.session.execute(
                        select(func.count(TimesheetEntry.id)).where(
                            TimesheetEntry.engagement_line_item_id == line_item_id,
                        )
                    )
                    has_entries = (result.scalar_one() or 0) > 0
                    if has_entries:
                        raise ValueError(
                            "Cannot remove employee from engagement. "
                            "Employee has timesheet entries. You may reduce the End Date instead."
                        )
                update_dict["employee_id"] = None

        # Handle role_id updates - use Opportunity Invoice Center (not Payable Center) for role_rate lookup
        if "role_id" in update_dict:
            # Use Opportunity Invoice Center (delivery_center_id) for role_rate lookup, NOT Payable Center
            opportunity_delivery_center_id = opportunity.delivery_center_id if opportunity else None
            if not opportunity_delivery_center_id:
                raise ValueError("Opportunity Invoice Center (delivery_center_id) is required for role rate lookup")
            
            role_rate = await self._get_role_rate(
                update_dict["role_id"],
                opportunity_delivery_center_id,  # Use Opportunity Invoice Center, not Payable Center
                invoice_currency,
            )
            if not role_rate:
                raise ValueError(
                    f"RoleRate not found for Role '{update_dict['role_id']}', "
                    f"Delivery Center '{opportunity_delivery_center_id}', Currency '{invoice_currency}'. "
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
                opportunity_delivery_center_id = opportunity.delivery_center_id if opportunity else None
                
                if opportunity_delivery_center_id:
                    # Get role_rate using Role ID + Opportunity Invoice Center for rate lookup
                    role_rate_for_rates = await self._get_role_rate(
                        new_role_id,
                        opportunity_delivery_center_id,  # Use Opportunity Invoice Center for rate lookup
                        invoice_currency,
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
                            target_currency=invoice_currency,
                            opportunity_delivery_center_id=opportunity_delivery_center_id,  # Pass opportunity delivery center for comparison
                        )
                else:
                    # Fallback to using the role_rates_id directly if no opportunity delivery center
                    default_rate, default_cost = await self._get_default_rates_from_role_rate(
                        update_dict.get("role_rates_id", line_item.role_rates_id),
                        new_employee_id,
                        target_currency=invoice_currency,
                        opportunity_delivery_center_id=opportunity_delivery_center_id,  # Pass opportunity delivery center for comparison (may be None)
                    )
            else:
                # Fallback to using the role_rates_id directly
                fallback_opportunity_delivery_center_id = opportunity.delivery_center_id if opportunity else None
                
                default_rate, default_cost = await self._get_default_rates_from_role_rate(
                    update_dict.get("role_rates_id", line_item.role_rates_id),
                    new_employee_id,
                    target_currency=invoice_currency,
                    opportunity_delivery_center_id=fallback_opportunity_delivery_center_id,  # Pass opportunity delivery center for comparison (may be None)
                )
            
            # Only update if rates weren't explicitly provided
            if "rate" not in update_dict:
                update_dict["rate"] = default_rate
            if "cost" not in update_dict:
                update_dict["cost"] = default_cost

        if opportunity and opportunity.default_currency:
            update_dict["currency"] = (opportunity.default_currency or "").strip() or "USD"
        
        updated = await self.line_item_repo.update(line_item_id, **update_dict)
        await self.session.flush()  # Flush to get updated values
        
        await self.session.commit()
        
        # Sync engagement to timesheets (employee/dates may have changed)
        from app.services.timesheet_service import TimesheetService
        timesheet_svc = TimesheetService(self.session)
        await timesheet_svc.sync_engagement_to_timesheets(engagement_id)
        
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

        # Block delete if line item has approved timesheets
        if await self._line_item_has_approved_timesheets(line_item_id):
            raise ValueError(
                "Cannot delete this line item: it has approved timesheet entries. "
                "Payable Center, Role, Billable, and Employee cannot be changed or removed once timesheets are approved."
            )
        
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

        # Sync engagement to timesheets (weekly hours changed - add/update entries)
        from app.services.timesheet_service import TimesheetService
        timesheet_svc = TimesheetService(self.session)
        await timesheet_svc.sync_engagement_to_timesheets(engagement_id)

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
        
        quote_display_name = None
        if quote:
            snapshot = quote.snapshot_data or {}
            if not snapshot.get("account_name") and not snapshot.get("name"):
                from app.utils.quote_display import _format_date_mmddyyyy
                unique_suffix = str(quote.id).replace("-", "")[:4]
                date_part = _format_date_mmddyyyy(quote.created_at)
                quote_display_name = f"QT-Quote-{date_part}-{unique_suffix}-v{quote.version}"
            else:
                quote_display_name = compute_quote_display_name(
                    account_name=snapshot.get("account_name"),
                    opportunity_name=snapshot.get("name") or (quote.opportunity.name if quote.opportunity else None),
                    version=quote.version,
                    quote_id=quote.id,
                    quote_created_at=quote.created_at,
                )

        account_name = None
        account_id = None
        if opportunity and opportunity.account:
            account_name = opportunity.account.company_name
            account_id = opportunity.account_id

        response_dict = {
            "id": engagement.id,
            "quote_id": engagement.quote_id,
            "opportunity_id": engagement.opportunity_id,
            "account_id": account_id,
            "name": engagement.name,
            "description": engagement.description,
            "created_by": engagement.created_by,
            "created_at": engagement.created_at.isoformat() if engagement.created_at else None,
            "attributes": engagement.attributes or {},
            "opportunity_name": opportunity.name if opportunity else None,
            "account_name": account_name,
            "quote_number": quote.quote_number if quote else None,
            "quote_display_name": quote_display_name,
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
        from app.schemas.engagement import (
            EngagementTimesheetApproverResponse,
            EngagementExpenseApproverResponse,
        )
        from app.db.repositories.engagement_timesheet_approver_repository import EngagementTimesheetApproverRepository
        from app.db.repositories.engagement_expense_approver_repository import EngagementExpenseApproverRepository

        base_response = await self._to_response(engagement, include_line_items=True)
        detail_dict = base_response.model_dump()
        approver_repo = EngagementTimesheetApproverRepository(self.session)
        approvers = await approver_repo.list_by_engagement(engagement.id)
        detail_dict["timesheet_approvers"] = [
            EngagementTimesheetApproverResponse(
                employee_id=a.employee_id,
                employee_name=f"{a.employee.first_name} {a.employee.last_name}".strip() if a.employee else None,
            )
            for a in approvers
        ]
        exp_repo = EngagementExpenseApproverRepository(self.session)
        exp_approvers = await exp_repo.list_by_engagement(engagement.id)
        detail_dict["expense_approvers"] = [
            EngagementExpenseApproverResponse(
                employee_id=a.employee_id,
                employee_name=f"{a.employee.first_name} {a.employee.last_name}".strip() if a.employee else None,
            )
            for a in exp_approvers
        ]
        return EngagementDetailResponse(**detail_dict)
    
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

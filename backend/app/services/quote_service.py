"""
Quote service with business logic for quote creation, snapshotting, and locking.
"""

import logging
from typing import List, Optional, Tuple
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

logger = logging.getLogger(__name__)

from app.services.base_service import BaseService
from app.db.repositories.quote_repository import QuoteRepository
from app.db.repositories.quote_line_item_repository import QuoteLineItemRepository
from app.db.repositories.quote_phase_repository import QuotePhaseRepository
from app.db.repositories.quote_weekly_hours_repository import QuoteWeeklyHoursRepository
from app.db.repositories.quote_payment_trigger_repository import QuotePaymentTriggerRepository
from app.db.repositories.quote_variable_compensation_repository import QuoteVariableCompensationRepository
from app.db.repositories.estimate_repository import EstimateRepository
from app.db.repositories.estimate_line_item_repository import EstimateLineItemRepository
from app.db.repositories.estimate_phase_repository import EstimatePhaseRepository
from app.db.repositories.estimate_weekly_hours_repository import EstimateWeeklyHoursRepository
from app.db.repositories.opportunity_repository import OpportunityRepository
from app.db.repositories.delivery_center_approver_repository import DeliveryCenterApproverRepository
from app.models.quote import (
    Quote, QuoteLineItem, QuotePhase, QuoteWeeklyHours, QuoteStatus,
    QuotePaymentTrigger, QuoteVariableCompensation, QuoteType, PaymentTriggerType,
    TimeType, RevenueType, RateBillingUnit, InvoiceDetail, CapType
)
from app.models.estimate import Estimate
from app.models.opportunity import Opportunity
from app.utils.quote_display import compute_quote_display_name
from app.schemas.quote import (
    QuoteCreate, QuoteUpdate, QuoteResponse, QuoteDetailResponse, QuoteListResponse,
    QuoteStatusUpdate, QuoteLineItemResponse, QuotePhaseResponse, QuoteWeeklyHoursResponse,
    PaymentTriggerResponse, VariableCompensationResponse,
)


class QuoteService(BaseService):
    """Service for quote operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.quote_repo = QuoteRepository(session)
        self.quote_line_item_repo = QuoteLineItemRepository(session)
        self.quote_phase_repo = QuotePhaseRepository(session)
        self.quote_weekly_hours_repo = QuoteWeeklyHoursRepository(session)
        self.quote_payment_trigger_repo = QuotePaymentTriggerRepository(session)
        self.quote_variable_compensation_repo = QuoteVariableCompensationRepository(session)
        self.estimate_repo = EstimateRepository(session)
        self.estimate_line_item_repo = EstimateLineItemRepository(session)
        self.estimate_phase_repo = EstimatePhaseRepository(session)
        self.estimate_weekly_hours_repo = EstimateWeeklyHoursRepository(session)
        self.opportunity_repo = OpportunityRepository(session)
        self.approver_repo = DeliveryCenterApproverRepository(session)
    
    async def create_quote(self, quote_data: QuoteCreate, created_by: Optional[UUID] = None) -> QuoteResponse:
        """Create quote from estimate snapshot."""
        # Validate estimate exists and is active
        estimate = await self.estimate_repo.get_with_line_items(quote_data.estimate_id)
        if not estimate:
            raise ValueError("Estimate not found")
        
        if not estimate.active_version:
            raise ValueError("Can only create quotes from active estimates")
        
        # Validate opportunity exists
        opportunity = await self.opportunity_repo.get(quote_data.opportunity_id)
        if not opportunity:
            raise ValueError("Opportunity not found")
        
        if estimate.opportunity_id != quote_data.opportunity_id:
            raise ValueError("Estimate does not belong to the specified opportunity")
        
        # Validate quote type specific requirements
        if quote_data.quote_type == QuoteType.FIXED_BID:
            if not quote_data.payment_triggers or len(quote_data.payment_triggers) == 0:
                raise ValueError("Fixed Bid quotes require at least one payment trigger")
            if quote_data.target_amount is None:
                raise ValueError("Fixed Bid quotes require a target amount")
            
            # Validate payment trigger totals match target amount
            total_amount = Decimal(0)
            for trigger in quote_data.payment_triggers:
                if trigger.trigger_type == PaymentTriggerType.TIME and trigger.time_type == TimeType.MONTHLY:
                    if trigger.num_installments is None or trigger.num_installments < 1:
                        raise ValueError("MONTHLY payment triggers require num_installments >= 1")
                    total_amount += trigger.amount * Decimal(trigger.num_installments)
                else:
                    total_amount += trigger.amount
            
            if abs(total_amount - quote_data.target_amount) > Decimal("0.01"):  # Allow small rounding differences
                raise ValueError(f"Payment trigger total ({total_amount}) must equal target amount ({quote_data.target_amount})")
        
        elif quote_data.quote_type == QuoteType.TIME_MATERIALS:
            # Validate blended rate amount if blended rate billing unit is selected
            if quote_data.rate_billing_unit in [RateBillingUnit.HOURLY_BLENDED, RateBillingUnit.DAILY_BLENDED]:
                if quote_data.blended_rate_amount is None:
                    raise ValueError("Blended rate billing unit requires blended_rate_amount")
            if quote_data.cap_type in [CapType.CAPPED, CapType.FLOOR]:
                if quote_data.cap_amount is None:
                    raise ValueError(f"{quote_data.cap_type.value} cap type requires cap_amount")
        
        # Check if opportunity already has active quote (deactivate if exists)
        existing_active = await self.quote_repo.get_active_quote_by_opportunity(quote_data.opportunity_id)
        if existing_active:
            await self.quote_repo.deactivate_all_by_opportunity(quote_data.opportunity_id)
            # Unlock opportunity and estimates
            await self._unlock_opportunity(quote_data.opportunity_id)
            await self._unlock_estimates(quote_data.opportunity_id)
        
        # Generate quote number and version
        max_version = await self.quote_repo.get_max_version_by_opportunity(quote_data.opportunity_id)
        next_version = max_version + 1
        quote_number = f"QT-{quote_data.opportunity_id}-{next_version}"
        
        # Snapshot opportunity metadata
        snapshot_data = await self._snapshot_opportunity(quote_data.opportunity_id)
        
        # Create quote
        quote_dict = {
            "opportunity_id": quote_data.opportunity_id,
            "estimate_id": quote_data.estimate_id,
            "quote_number": quote_number,
            "version": next_version,
            "status": QuoteStatus.DRAFT,
            "is_active": True,
            "created_by": created_by,
            "notes": quote_data.notes,
            "snapshot_data": snapshot_data,
            "quote_type": quote_data.quote_type,
            "target_amount": quote_data.target_amount,
            "rate_billing_unit": quote_data.rate_billing_unit,
            "blended_rate_amount": quote_data.blended_rate_amount,
            "invoice_detail": quote_data.invoice_detail,
            "cap_type": quote_data.cap_type,
            "cap_amount": quote_data.cap_amount,
        }
        quote = await self.quote_repo.create(**quote_dict)
        
        # Set all previous versions to INVALID (excluding the newly created quote)
        # Get list of quotes that will be invalidated before invalidating them
        invalidate_query = select(Quote.id).where(
            Quote.opportunity_id == quote_data.opportunity_id,
            Quote.status != QuoteStatus.INVALID,
            Quote.status != QuoteStatus.REJECTED,
            Quote.id != quote.id
        )
        invalidate_result = await self.session.execute(invalidate_query)
        quotes_to_invalidate = [row[0] for row in invalidate_result.all()]
        
        # Invalidate previous versions
        await self.quote_repo.invalidate_previous_versions(quote_data.opportunity_id, exclude_quote_id=quote.id)
        
        # Delete engagements for invalidated quotes
        if quotes_to_invalidate:
            from app.services.engagement_service import EngagementService
            engagement_service = EngagementService(self.session)
            for quote_id_to_invalidate in quotes_to_invalidate:
                try:
                    deleted_count = await engagement_service.delete_engagements_by_quote(quote_id_to_invalidate)
                    if deleted_count > 0:
                        logger.info(f"Deleted {deleted_count} engagement(s) for invalidated quote {quote_id_to_invalidate}")
                except Exception as e:
                    logger.error(f"Failed to delete engagement(s) for invalidated quote {quote_id_to_invalidate}: {e}")
        
        # Create payment triggers for Fixed Bid quotes
        if quote_data.quote_type == QuoteType.FIXED_BID and quote_data.payment_triggers:
            for idx, trigger_data in enumerate(quote_data.payment_triggers):
                await self.quote_payment_trigger_repo.create(
                    quote_id=quote.id,
                    name=trigger_data.name,
                    trigger_type=trigger_data.trigger_type,
                    time_type=trigger_data.time_type,
                    amount=trigger_data.amount,
                    num_installments=trigger_data.num_installments,
                    milestone_date=trigger_data.milestone_date,
                    row_order=idx,
                )
        
        # Create variable compensations
        if quote_data.variable_compensations:
            for comp_data in quote_data.variable_compensations:
                await self.quote_variable_compensation_repo.create(
                    quote_id=quote.id,
                    employee_id=comp_data.employee_id,
                    revenue_type=comp_data.revenue_type,
                    percentage_amount=comp_data.percentage_amount,
                )
        
        # Snapshot estimate data
        await self._snapshot_estimate(quote.id, quote_data.estimate_id)
        
        # Lock opportunity and estimates
        await self._lock_opportunity(quote_data.opportunity_id)
        await self._lock_estimates(quote_data.opportunity_id)
        
        await self.session.commit()
        
        # Reload quote with relationships
        quote = await self.quote_repo.get(quote.id)
        if not quote:
            raise ValueError("Failed to retrieve created quote")
        return await self._to_response(quote)
    
    async def get_quote(self, quote_id: UUID) -> Optional[QuoteResponse]:
        """Get quote by ID."""
        quote = await self.quote_repo.get(quote_id)
        if not quote:
            return None
        return await self._to_response(quote)
    
    async def get_quote_detail(self, quote_id: UUID) -> Optional[QuoteDetailResponse]:
        """Get quote with all relationships."""
        quote = await self.quote_repo.get(quote_id)
        if not quote:
            return None
        
        # Load line items and phases with all nested relationships
        from sqlalchemy.orm import selectinload
        from app.models.role_rate import RoleRate
        from app.models.role import Role
        from app.models.delivery_center import DeliveryCenter
        from app.models.employee import Employee
        
        result = await self.session.execute(
            select(Quote)
            .options(
                selectinload(Quote.line_items).selectinload(QuoteLineItem.role_rate).selectinload(RoleRate.role),
                selectinload(Quote.line_items).selectinload(QuoteLineItem.role_rate).selectinload(RoleRate.delivery_center),
                selectinload(Quote.line_items).selectinload(QuoteLineItem.payable_center),
                selectinload(Quote.line_items).selectinload(QuoteLineItem.employee),
                selectinload(Quote.line_items).selectinload(QuoteLineItem.weekly_hours),
                selectinload(Quote.phases),
                selectinload(Quote.payment_triggers),
                selectinload(Quote.variable_compensations).selectinload(QuoteVariableCompensation.employee),
            )
            .where(Quote.id == quote_id)
        )
        quote = result.scalar_one_or_none()
        if not quote:
            return None
        
        return await self._to_detail_response(quote)
    
    async def list_quotes(
        self,
        skip: int = 0,
        limit: int = 100,
        opportunity_id: Optional[UUID] = None,
    ) -> Tuple[List[QuoteResponse], int]:
        """List quotes with filters."""
        filters = {}
        if opportunity_id:
            filters["opportunity_id"] = opportunity_id
        
        quotes = await self.quote_repo.list(skip=skip, limit=limit, **filters)
        total = await self.quote_repo.count(**filters)
        
        quote_responses = [await self._to_response(quote) for quote in quotes]
        return quote_responses, total
    
    async def list_quotes_for_approval(
        self,
        employee_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[List[QuoteResponse], int]:
        """List Draft quotes that the employee can approve based on their delivery center approver status."""
        # Get all delivery centers where this employee is an approver
        approver_associations = await self.approver_repo.get_by_employee(employee_id)
        delivery_center_ids = [assoc.delivery_center_id for assoc in approver_associations]
        
        if not delivery_center_ids:
            # User is not an approver for any delivery center
            return [], 0
        
        # Get all Draft quotes where the opportunity's delivery_center_id matches
        # one of the delivery centers the user is an approver for
        from sqlalchemy import select, and_
        from sqlalchemy.orm import selectinload
        
        query = (
            select(Quote)
            .join(Opportunity, Quote.opportunity_id == Opportunity.id)
            .where(
                and_(
                    Quote.status == QuoteStatus.DRAFT,
                    Opportunity.delivery_center_id.in_(delivery_center_ids)
                )
            )
            .options(
                selectinload(Quote.opportunity).selectinload(Opportunity.account),
                selectinload(Quote.estimate),
                selectinload(Quote.created_by_employee),
            )
            .order_by(Quote.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        
        result = await self.session.execute(query)
        quotes = list(result.scalars().all())
        
        # Count total matching quotes
        count_query = (
            select(func.count(Quote.id))
            .join(Opportunity, Quote.opportunity_id == Opportunity.id)
            .where(
                and_(
                    Quote.status == QuoteStatus.DRAFT,
                    Opportunity.delivery_center_id.in_(delivery_center_ids)
                )
            )
        )
        count_result = await self.session.execute(count_query)
        total = count_result.scalar_one()
        
        quote_responses = [await self._to_response(quote) for quote in quotes]
        return quote_responses, total
    
    async def update_quote_status(
        self,
        quote_id: UUID,
        status_data: QuoteStatusUpdate,
    ) -> Optional[QuoteResponse]:
        """Update quote status."""
        quote = await self.quote_repo.get(quote_id)
        if not quote:
            return None
        
        update_dict = {
            "status": status_data.status,
            "sent_date": status_data.sent_date,
        }
        
        # If status is REJECTED or INVALID, delete associated Engagement and unlock opportunity
        if status_data.status in [QuoteStatus.REJECTED, QuoteStatus.INVALID]:
            update_dict["is_active"] = False
            # Delete associated engagement(s)
            from app.services.engagement_service import EngagementService
            engagement_service = EngagementService(self.session)
            try:
                deleted_count = await engagement_service.delete_engagements_by_quote(quote_id)
                if deleted_count > 0:
                    logger.info(f"Deleted {deleted_count} engagement(s) for {status_data.status.value} quote {quote_id}")
            except Exception as e:
                logger.error(f"Failed to delete engagement(s) for quote {quote_id}: {e}")
                # Don't fail the quote status update if engagement deletion fails
            # Unlock opportunity and estimates
            await self._unlock_opportunity(quote.opportunity_id)
            await self._unlock_estimates(quote.opportunity_id)
        
        # If status is ACCEPTED, create Engagement automatically
        if status_data.status == QuoteStatus.ACCEPTED:
            from app.services.engagement_service import EngagementService
            engagement_service = EngagementService(self.session)
            try:
                await engagement_service.create_engagement_from_quote(
                    quote_id=quote_id,
                    created_by=None,  # Could be passed from context if available
                )
                logger.info(f"Created engagement for approved quote {quote_id}")
            except Exception as e:
                logger.error(f"Failed to create engagement for quote {quote_id}: {e}")
                # Don't fail the quote status update if engagement creation fails
                # The engagement can be created manually later if needed
        
        updated = await self.quote_repo.update(quote_id, **update_dict)
        await self.session.commit()
        
        updated = await self.quote_repo.get(quote_id)
        if not updated:
            return None
        return await self._to_response(updated)
    
    async def deactivate_quote(self, quote_id: UUID) -> Optional[QuoteResponse]:
        """Deactivate quote and unlock opportunity/estimates."""
        quote = await self.quote_repo.get(quote_id)
        if not quote:
            return None
        
        # Set quote as inactive
        update_dict = {"is_active": False}
        
        # Only preserve REJECTED status, all others (including ACCEPTED) should become INVALID
        if quote.status != QuoteStatus.REJECTED:
            update_dict["status"] = QuoteStatus.INVALID
        
        updated = await self.quote_repo.update(quote_id, **update_dict)
        
        # Delete associated engagement(s) when quote is unlocked/deactivated
        from app.services.engagement_service import EngagementService
        engagement_service = EngagementService(self.session)
        try:
            deleted_count = await engagement_service.delete_engagements_by_quote(quote_id)
            if deleted_count > 0:
                logger.info(f"Deleted {deleted_count} engagement(s) for deactivated/unlocked quote {quote_id}")
        except Exception as e:
            logger.error(f"Failed to delete engagement(s) for quote {quote_id}: {e}")
            # Don't fail the quote deactivation if engagement deletion fails
        
        # Unlock opportunity and estimates
        await self._unlock_opportunity(quote.opportunity_id)
        await self._unlock_estimates(quote.opportunity_id)
        
        await self.session.commit()
        
        updated = await self.quote_repo.get(quote_id)
        if not updated:
            return None
        return await self._to_response(updated)
    
    async def _snapshot_estimate(self, quote_id: UUID, estimate_id: UUID) -> None:
        """Snapshot estimate data (line items, phases, weekly hours)."""
        estimate = await self.estimate_repo.get_with_line_items(estimate_id)
        if not estimate:
            raise ValueError("Estimate not found")
        
        # Snapshot phases
        if estimate.phases:
            for phase in estimate.phases:
                await self.quote_phase_repo.create(
                    quote_id=quote_id,
                    name=phase.name,
                    start_date=phase.start_date,
                    end_date=phase.end_date,
                    color=phase.color,
                    row_order=phase.row_order,
                )
        
        # Snapshot line items
        if estimate.line_items:
            for line_item in estimate.line_items:
                quote_line_item_dict = {
                    "quote_id": quote_id,
                    "role_rates_id": line_item.role_rates_id,
                    "payable_center_id": line_item.payable_center_id,
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
                quote_line_item = await self.quote_line_item_repo.create(**quote_line_item_dict)
                
                # Snapshot weekly hours
                if line_item.weekly_hours:
                    for weekly_hour in line_item.weekly_hours:
                        await self.quote_weekly_hours_repo.create(
                            quote_line_item_id=quote_line_item.id,
                            week_start_date=weekly_hour.week_start_date,
                            hours=weekly_hour.hours,
                        )
    
    async def _snapshot_opportunity(self, opportunity_id: UUID) -> dict:
        """Snapshot opportunity metadata."""
        # Load opportunity with relationships for snapshot
        from sqlalchemy.orm import selectinload
        
        result = await self.session.execute(
            select(Opportunity)
            .options(
                selectinload(Opportunity.account),
                selectinload(Opportunity.delivery_center),
            )
            .where(Opportunity.id == opportunity_id)
        )
        opportunity = result.scalar_one_or_none()
        
        if not opportunity:
            raise ValueError("Opportunity not found")
        
        account_name = opportunity.account.company_name if opportunity.account else None
        delivery_center_name = opportunity.delivery_center.name if opportunity.delivery_center else None
        
        return {
            "name": opportunity.name,
            "start_date": opportunity.start_date.isoformat() if opportunity.start_date else None,
            "end_date": opportunity.end_date.isoformat() if opportunity.end_date else None,
            "status": opportunity.status.value if opportunity.status else None,
            "default_currency": opportunity.default_currency,
            "description": opportunity.description,
            "account_id": str(opportunity.account_id),
            "account_name": account_name,
            "delivery_center_id": str(opportunity.delivery_center_id),
            "delivery_center_name": delivery_center_name,
        }
    
    async def _lock_opportunity(self, opportunity_id: UUID) -> None:
        """Lock opportunity (prevent updates)."""
        # Locking is enforced at the service level by checking for active quotes
        # No database-level locking needed
        pass
    
    async def _unlock_opportunity(self, opportunity_id: UUID) -> None:
        """Unlock opportunity (allow updates)."""
        # Unlocking is enforced at the service level
        pass
    
    async def _lock_estimates(self, opportunity_id: UUID) -> None:
        """Lock all estimates for opportunity (prevent updates)."""
        # Locking is enforced at the service level by checking for active quotes
        # No database-level locking needed
        pass
    
    async def _unlock_estimates(self, opportunity_id: UUID) -> None:
        """Unlock all estimates for opportunity (allow updates)."""
        # Unlocking is enforced at the service level
        pass
    
    async def check_active_quote(self, opportunity_id: UUID) -> Optional[Quote]:
        """Check if opportunity has an active quote."""
        return await self.quote_repo.get_active_quote_by_opportunity(opportunity_id)
    
    def _compute_display_name(self, quote: Quote) -> str:
        """Compute friendly ID-style display name from snapshot_data or fallback."""
        snapshot = quote.snapshot_data or {}
        account_name = snapshot.get("account_name")
        opportunity_name = snapshot.get("name")
        if not account_name and not opportunity_name:
            from app.utils.quote_display import _format_date_mmddyyyy
            unique_suffix = str(quote.id).replace("-", "")[:4]
            date_part = _format_date_mmddyyyy(quote.created_at)
            return f"QT-Quote-{date_part}-{unique_suffix}-v{quote.version}"
        return compute_quote_display_name(
            account_name=account_name,
            opportunity_name=opportunity_name or (quote.opportunity.name if quote.opportunity else None),
            version=quote.version,
            quote_id=quote.id,
            quote_created_at=quote.created_at,
        )

    async def _to_response(self, quote: Quote) -> QuoteResponse:
        """Convert Quote model to QuoteResponse schema."""
        return QuoteResponse(
            id=quote.id,
            opportunity_id=quote.opportunity_id,
            estimate_id=quote.estimate_id,
            quote_number=quote.quote_number,
            display_name=self._compute_display_name(quote),
            version=quote.version,
            status=quote.status,
            is_active=quote.is_active,
            created_at=quote.created_at,
            created_by=quote.created_by,
            created_by_name=f"{quote.created_by_employee.first_name} {quote.created_by_employee.last_name}" if quote.created_by_employee else None,
            sent_date=quote.sent_date,
            notes=quote.notes,
            snapshot_data=quote.snapshot_data,
            opportunity_name=quote.opportunity.name if quote.opportunity else None,
            estimate_name=quote.estimate.name if quote.estimate else None,
            quote_type=quote.quote_type,
            target_amount=quote.target_amount,
            rate_billing_unit=quote.rate_billing_unit,
            blended_rate_amount=quote.blended_rate_amount,
            invoice_detail=quote.invoice_detail,
            cap_type=quote.cap_type,
            cap_amount=quote.cap_amount,
        )
    
    async def _to_detail_response(self, quote: Quote) -> QuoteDetailResponse:
        """Convert Quote model to QuoteDetailResponse schema."""
        base_response = await self._to_response(quote)
        
        # Convert line items
        line_items = []
        for line_item in quote.line_items:
            line_item_response = QuoteLineItemResponse(
                id=line_item.id,
                quote_id=line_item.quote_id,
                role_rates_id=line_item.role_rates_id,
                payable_center_id=line_item.payable_center_id,
                employee_id=line_item.employee_id,
                rate=line_item.rate,
                cost=line_item.cost,
                currency=line_item.currency,
                start_date=line_item.start_date.isoformat(),
                end_date=line_item.end_date.isoformat(),
                row_order=line_item.row_order,
                billable=line_item.billable,
                billable_expense_percentage=line_item.billable_expense_percentage,
                role_name=line_item.role_rate.role.role_name if line_item.role_rate and line_item.role_rate.role else None,
                delivery_center_name=line_item.role_rate.delivery_center.name if line_item.role_rate and line_item.role_rate.delivery_center else None,
                payable_center_name=line_item.payable_center.name if line_item.payable_center else None,
                employee_name=f"{line_item.employee.first_name} {line_item.employee.last_name}" if line_item.employee else None,
                weekly_hours=[
                    QuoteWeeklyHoursResponse(
                        id=wh.id,
                        week_start_date=wh.week_start_date.isoformat(),
                        hours=wh.hours,
                    )
                    for wh in line_item.weekly_hours
                ] if line_item.weekly_hours else [],
            )
            line_items.append(line_item_response)
        
        # Convert phases
        phases = [
            QuotePhaseResponse(
                id=phase.id,
                quote_id=phase.quote_id,
                name=phase.name,
                start_date=phase.start_date,
                end_date=phase.end_date,
                color=phase.color,
                row_order=phase.row_order,
            )
            for phase in quote.phases
        ]
        
        # Convert payment triggers
        payment_triggers = [
            PaymentTriggerResponse(
                id=trigger.id,
                quote_id=trigger.quote_id,
                name=trigger.name,
                trigger_type=trigger.trigger_type,
                time_type=trigger.time_type,
                amount=trigger.amount,
                num_installments=trigger.num_installments,
                milestone_date=trigger.milestone_date,
                row_order=trigger.row_order,
            )
            for trigger in (quote.payment_triggers or [])
        ]
        
        # Convert variable compensations
        variable_compensations = [
            VariableCompensationResponse(
                id=comp.id,
                quote_id=comp.quote_id,
                employee_id=comp.employee_id,
                revenue_type=comp.revenue_type,
                percentage_amount=comp.percentage_amount,
                employee_name=f"{comp.employee.first_name} {comp.employee.last_name}" if comp.employee else None,
            )
            for comp in (quote.variable_compensations or [])
        ]
        
        return QuoteDetailResponse(
            **base_response.model_dump(),
            line_items=line_items,
            phases=phases,
            payment_triggers=payment_triggers,
            variable_compensations=variable_compensations,
        )


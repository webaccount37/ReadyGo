"""
Database models.
Import all models here to ensure they're registered with Base.
"""

from app.models.employee import Employee
from app.models.opportunity import Opportunity
from app.models.calendar import Calendar
from app.models.billing_term import BillingTerm
from app.models.account import Account
from app.models.contact import Contact
from app.models.role import Role
from app.models.delivery_center import DeliveryCenter
from app.models.role_rate import RoleRate
from app.models.estimate import Estimate, EstimateLineItem, EstimateWeeklyHours, EstimatePhase
from app.models.engagement import Engagement, EngagementPhase, EngagementLineItem, EngagementWeeklyHours
from app.models.delivery_center_approver import DeliveryCenterApprover
from app.models.currency_rate import CurrencyRate
from app.models.quote import (
    Quote, QuoteLineItem, QuotePhase, QuoteWeeklyHours, QuoteStatus,
    QuotePaymentTrigger, QuoteVariableCompensation,
    QuoteType, PaymentTriggerType, TimeType, RevenueType,
    RateBillingUnit, InvoiceDetail, CapType
)
from app.models.timesheet import (
    Timesheet, TimesheetEntry, TimesheetDayNote, TimesheetApprovedSnapshot,
    TimesheetStatusHistory, TimesheetStatus, TimesheetEntryType
)
from app.models.engagement_timesheet_approver import EngagementTimesheetApprover
from app.models.opportunity_permanent_lock import OpportunityPermanentLock

__all__ = [
    "Employee",
    "Opportunity",
    "Calendar",
    "BillingTerm",
    "Account",
    "Contact",
    "Role",
    "DeliveryCenter",
    "RoleRate",
    "Estimate",
    "EstimateLineItem",
    "EstimateWeeklyHours",
    "EstimatePhase",
    "Engagement",
    "EngagementPhase",
    "EngagementLineItem",
    "EngagementWeeklyHours",
    "DeliveryCenterApprover",
    "CurrencyRate",
    "Quote",
    "QuoteLineItem",
    "QuotePhase",
    "QuoteWeeklyHours",
    "QuoteStatus",
    "Timesheet",
    "TimesheetEntry",
    "TimesheetDayNote",
    "TimesheetApprovedSnapshot",
    "TimesheetStatusHistory",
    "TimesheetStatus",
    "TimesheetEntryType",
    "EngagementTimesheetApprover",
    "OpportunityPermanentLock",
]



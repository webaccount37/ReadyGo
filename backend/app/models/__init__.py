"""
Database models.
Import all models here to ensure they're registered with Base.
"""

from app.models.employee import Employee
from app.models.engagement import Engagement
from app.models.release import Release
from app.models.calendar import Calendar
from app.models.billing_term import BillingTerm
from app.models.account import Account
from app.models.contact import Contact
from app.models.role import Role
from app.models.delivery_center import DeliveryCenter
from app.models.role_rate import RoleRate
from app.models.association_models import (
    EmployeeEngagement,
    EmployeeRelease,
)
from app.models.association_tables import (
    engagement_roles,
    release_roles,
)
from app.models.estimate import Estimate, EstimateLineItem, EstimateWeeklyHours, EstimatePhase

__all__ = [
    "Employee",
    "Engagement",
    "Release",
    "Calendar",
    "BillingTerm",
    "Account",
    "Contact",
    "Role",
    "EmployeeEngagement",
    "EmployeeRelease",
    "DeliveryCenter",
    "RoleRate",
    "Estimate",
    "EstimateLineItem",
    "EstimateWeeklyHours",
    "EstimatePhase",
    "engagement_roles",
    "release_roles",
]



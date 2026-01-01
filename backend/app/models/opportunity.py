"""
Opportunity model for quoting and staff planning system.
"""

from sqlalchemy import Column, String, Float, Date, JSON, ForeignKey, Enum as SQLEnum, Boolean, Integer, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum

from app.db.base import Base


class OpportunityStatus(str, enum.Enum):
    """Opportunity status enumeration."""
    DISCOVERY = "discovery"
    QUALIFIED = "qualified"
    PROPOSAL = "proposal"
    NEGOTIATION = "negotiation"
    WON = "won"
    LOST = "lost"
    CANCELLED = "cancelled"


class WinProbability(str, enum.Enum):
    """Win probability enumeration."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Accountability(str, enum.Enum):
    """Accountability enumeration."""
    FULL_OWNERSHIP = "full_ownership"
    MGMT_ACCOUNTABLE = "mgmt_accountable"
    MGMT_ADVISORY = "mgmt_advisory"
    STAFF_AUG_LIMITED = "staff_aug_limited"


class StrategicImportance(str, enum.Enum):
    """Strategic importance enumeration."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class OpportunityType(str, enum.Enum):
    """Opportunity type enumeration."""
    IMPLEMENTATION = "implementation"
    CONSULTING = "consulting"
    SUPPORT = "support"


class Opportunity(Base):
    """Opportunity model for quoting and staff planning."""
    
    __tablename__ = "opportunities"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String(255), nullable=False, index=True)
    parent_opportunity_id = Column(UUID(as_uuid=True), ForeignKey("opportunities.id"), nullable=True)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=False, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    status = Column(
        SQLEnum(OpportunityStatus, values_callable=lambda x: [e.value for e in OpportunityStatus]),
        nullable=False,
        default=OpportunityStatus.DISCOVERY
    )
    billing_term_id = Column(UUID(as_uuid=True), ForeignKey("billing_terms.id"), nullable=False, index=True)
    opportunity_type = Column(SQLEnum(OpportunityType), nullable=False, default=OpportunityType.IMPLEMENTATION)
    description = Column(String(2000), nullable=True)
    utilization = Column(Float, nullable=True)
    margin = Column(Float, nullable=True)
    default_currency = Column(String(3), default="USD", nullable=False)
    delivery_center_id = Column(UUID(as_uuid=True), ForeignKey("delivery_centers.id"), nullable=False, index=True)
    opportunity_owner_id = Column(UUID(as_uuid=True), ForeignKey("employees.id"), nullable=True, index=True)
    invoice_customer = Column(Boolean, default=True, nullable=False)
    billable_expenses = Column(Boolean, default=True, nullable=False)
    attributes = Column(JSON, nullable=True, default=dict)
    
    # New deal/forecast fields
    probability = Column(Float, nullable=True)  # Read-only, calculated from status
    win_probability = Column(SQLEnum(WinProbability), nullable=True)
    accountability = Column(SQLEnum(Accountability), nullable=True)
    strategic_importance = Column(SQLEnum(StrategicImportance), nullable=True)
    deal_creation_date = Column(Date, nullable=True)  # Read-only, set on creation
    deal_value = Column(Numeric(15, 2), nullable=True)  # Generic currency field
    deal_value_usd = Column(Numeric(15, 2), nullable=True)  # Calculated field
    close_date = Column(Date, nullable=True)  # Read-only, set when status is Won/Lost/Cancelled
    deal_length = Column(Integer, nullable=True)  # Calculated in days
    forecast_value = Column(Numeric(15, 2), nullable=True)  # Calculated: probability * deal_value
    forecast_value_usd = Column(Numeric(15, 2), nullable=True)  # Calculated: probability * deal_value_usd
    project_start_month = Column(Integer, nullable=True)  # 1-12
    project_start_year = Column(Integer, nullable=True)  # 4-digit year
    project_duration_months = Column(Integer, nullable=True)  # 1-12
    
    # Relationships
    parent_opportunity = relationship("Opportunity", remote_side=[id], backref="child_opportunities")
    account = relationship("Account", back_populates="opportunities")
    billing_term = relationship("BillingTerm", back_populates="opportunities")
    delivery_center = relationship("DeliveryCenter", back_populates="opportunities")
    opportunity_owner = relationship("Employee", foreign_keys=[opportunity_owner_id], back_populates="owned_opportunities")
    engagements = relationship("Engagement", back_populates="opportunity", cascade="all, delete-orphan")


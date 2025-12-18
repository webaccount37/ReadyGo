"""
Engagement model for quoting and staff planning system.
"""

from sqlalchemy import Column, String, Float, Date, JSON, ForeignKey, Enum as SQLEnum, Boolean, Integer, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.ext.associationproxy import association_proxy
import uuid
import enum

from app.db.base import Base


class EngagementStatus(str, enum.Enum):
    """Engagement status enumeration."""
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


class EngagementType(str, enum.Enum):
    """Engagement type enumeration."""
    IMPLEMENTATION = "implementation"
    CONSULTING = "consulting"
    SUPPORT = "support"


class Engagement(Base):
    """Engagement model for quoting and staff planning."""
    
    __tablename__ = "engagements"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String(255), nullable=False, index=True)
    parent_engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=True)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=False, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    status = Column(
        SQLEnum(EngagementStatus, values_callable=lambda x: [e.value for e in EngagementStatus]),
        nullable=False,
        default=EngagementStatus.DISCOVERY
    )
    billing_term_id = Column(UUID(as_uuid=True), ForeignKey("billing_terms.id"), nullable=False, index=True)
    engagement_type = Column(SQLEnum(EngagementType), nullable=False, default=EngagementType.IMPLEMENTATION)
    description = Column(String(2000), nullable=True)
    utilization = Column(Float, nullable=True)
    margin = Column(Float, nullable=True)
    default_currency = Column(String(3), default="USD", nullable=False)
    delivery_center_id = Column(UUID(as_uuid=True), ForeignKey("delivery_centers.id"), nullable=False, index=True)
    engagement_owner_id = Column(UUID(as_uuid=True), ForeignKey("employees.id"), nullable=True, index=True)
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
    parent_engagement = relationship("Engagement", remote_side=[id], backref="child_engagements")
    account = relationship("Account", back_populates="engagements")
    billing_term = relationship("BillingTerm", back_populates="engagements")
    delivery_center = relationship("DeliveryCenter", back_populates="engagements")
    engagement_owner = relationship("Employee", foreign_keys=[engagement_owner_id], back_populates="owned_engagements")
    # Use association objects instead of simple many-to-many
    # Explicitly specify foreign_keys to ensure correct filtering
    employee_associations = relationship(
        "EmployeeEngagement", 
        back_populates="engagement", 
        cascade="all, delete-orphan",
        foreign_keys="[EmployeeEngagement.engagement_id]",
        primaryjoin="Engagement.id == EmployeeEngagement.engagement_id"
    )
    # Convenience proxy to access employees through associations (for backward compatibility)
    employees = association_proxy("employee_associations", "employee")
    
    releases = relationship("Release", back_populates="engagement", cascade="all, delete-orphan")
    roles = relationship("Role", secondary="engagement_roles", back_populates="engagements")

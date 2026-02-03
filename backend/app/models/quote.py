"""
Quote model for project quoting system.
"""

from sqlalchemy import Column, String, Date, JSON, ForeignKey, Numeric, Integer, UniqueConstraint, Boolean, DateTime, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum

from app.db.base import Base


class QuoteStatus(str, enum.Enum):
    """Quote status enumeration."""
    DRAFT = "DRAFT"
    SENT = "SENT"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    INVALID = "INVALID"


class QuoteType(str, enum.Enum):
    """Quote type enumeration."""
    FIXED_BID = "FIXED_BID"
    TIME_MATERIALS = "TIME_MATERIALS"


class PaymentTriggerType(str, enum.Enum):
    """Payment trigger type enumeration."""
    TIME = "TIME"
    MILESTONE = "MILESTONE"


class TimeType(str, enum.Enum):
    """Time type enumeration for payment triggers."""
    IMMEDIATE = "IMMEDIATE"
    MONTHLY = "MONTHLY"


class RevenueType(str, enum.Enum):
    """Revenue type enumeration for variable compensation."""
    GROSS_REVENUE = "GROSS_REVENUE"
    GROSS_MARGIN = "GROSS_MARGIN"


class RateBillingUnit(str, enum.Enum):
    """Rate billing unit enumeration."""
    HOURLY_ACTUALS = "HOURLY_ACTUALS"
    DAILY_ACTUALS = "DAILY_ACTUALS"
    HOURLY_BLENDED = "HOURLY_BLENDED"
    DAILY_BLENDED = "DAILY_BLENDED"


class InvoiceDetail(str, enum.Enum):
    """Invoice detail enumeration."""
    ROLE = "ROLE"
    EMPLOYEE = "EMPLOYEE"
    EMPLOYEE_WITH_DESCRIPTIONS = "EMPLOYEE_WITH_DESCRIPTIONS"


class CapType(str, enum.Enum):
    """Cap type enumeration."""
    NONE = "NONE"
    CAPPED = "CAPPED"
    FLOOR = "FLOOR"


class Quote(Base):
    """Quote model for project quotes."""
    
    __tablename__ = "quotes"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    opportunity_id = Column(UUID(as_uuid=True), ForeignKey("opportunities.id", ondelete="CASCADE"), nullable=False, index=True)
    estimate_id = Column(UUID(as_uuid=True), ForeignKey("estimates.id", ondelete="RESTRICT"), nullable=False, index=True)
    quote_number = Column(String(255), nullable=False, unique=True, index=True)
    version = Column(Integer, nullable=False, default=1)
    status = Column(SQLEnum(QuoteStatus), nullable=False, default=QuoteStatus.DRAFT, index=True)
    is_active = Column(Boolean, nullable=False, default=False, index=True)
    created_at = Column(DateTime, nullable=False, server_default="now()")
    created_by = Column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True)
    sent_date = Column(Date, nullable=True)
    notes = Column(String(2000), nullable=True)
    snapshot_data = Column(JSON, nullable=True)
    
    # New quote type fields
    quote_type = Column(SQLEnum(QuoteType), nullable=True, index=True)
    target_amount = Column(Numeric(15, 2), nullable=True)  # Only for FIXED_BID
    rate_billing_unit = Column(SQLEnum(RateBillingUnit), nullable=True)  # Only for TIME_MATERIALS
    blended_rate_amount = Column(Numeric(15, 2), nullable=True)  # Only when rate_billing_unit is BLENDED
    invoice_detail = Column(SQLEnum(InvoiceDetail), nullable=True)  # Only for TIME_MATERIALS
    cap_type = Column(SQLEnum(CapType), nullable=True)  # Only for TIME_MATERIALS
    cap_amount = Column(Numeric(15, 2), nullable=True)  # Only when cap_type is CAPPED or FLOOR
    
    # Relationships
    opportunity = relationship("Opportunity", back_populates="quotes")
    estimate = relationship("Estimate")
    created_by_employee = relationship("Employee", foreign_keys=[created_by])
    line_items = relationship("QuoteLineItem", back_populates="quote", cascade="all, delete-orphan", order_by="QuoteLineItem.row_order")
    phases = relationship("QuotePhase", back_populates="quote", cascade="all, delete-orphan", order_by="QuotePhase.row_order")
    payment_triggers = relationship("QuotePaymentTrigger", back_populates="quote", cascade="all, delete-orphan", order_by="QuotePaymentTrigger.row_order")
    variable_compensations = relationship("QuoteVariableCompensation", back_populates="quote", cascade="all, delete-orphan")


class QuoteLineItem(Base):
    """Line item in a quote representing a role assignment snapshot."""
    
    __tablename__ = "quote_line_items"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    quote_id = Column(UUID(as_uuid=True), ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False, index=True)
    role_rates_id = Column(UUID(as_uuid=True), ForeignKey("role_rates.id", ondelete="RESTRICT"), nullable=False, index=True)
    payable_center_id = Column(UUID(as_uuid=True), ForeignKey("delivery_centers.id", ondelete="SET NULL"), nullable=True, index=True)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True)
    rate = Column(Numeric(15, 2), nullable=False)  # External bill rate snapshot
    cost = Column(Numeric(15, 2), nullable=False)  # Internal cost rate snapshot
    currency = Column(String(3), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    row_order = Column(Integer, nullable=False, default=0)
    billable = Column(Boolean, nullable=False, default=True)
    billable_expense_percentage = Column(Numeric(5, 2), nullable=False, default=0)
    
    # Relationships
    quote = relationship("Quote", back_populates="line_items")
    role_rate = relationship("RoleRate")
    payable_center = relationship("DeliveryCenter", foreign_keys=[payable_center_id])
    employee = relationship("Employee")
    weekly_hours = relationship("QuoteWeeklyHours", back_populates="line_item", cascade="all, delete-orphan", order_by="QuoteWeeklyHours.week_start_date")


class QuotePhase(Base):
    """Phase definition for a quote with time range and color."""
    
    __tablename__ = "quote_phases"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    quote_id = Column(UUID(as_uuid=True), ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    color = Column(String(7), nullable=False, default="#3B82F6")  # Hex color code
    row_order = Column(Integer, nullable=False, default=0)
    
    # Relationships
    quote = relationship("Quote", back_populates="phases")


class QuoteWeeklyHours(Base):
    """Weekly hours allocation for a quote line item."""
    
    __tablename__ = "quote_weekly_hours"
    __table_args__ = (
        UniqueConstraint("quote_line_item_id", "week_start_date", name="uq_quote_line_item_week"),
    )
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    quote_line_item_id = Column(UUID(as_uuid=True), ForeignKey("quote_line_items.id", ondelete="CASCADE"), nullable=False, index=True)
    week_start_date = Column(Date, nullable=False, index=True)  # Sunday of the week
    hours = Column(Numeric(10, 2), nullable=False, default=0)
    
    # Relationships
    line_item = relationship("QuoteLineItem", back_populates="weekly_hours")


class QuotePaymentTrigger(Base):
    """Payment trigger for Fixed Bid quotes."""
    
    __tablename__ = "quote_payment_triggers"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    quote_id = Column(UUID(as_uuid=True), ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    trigger_type = Column(SQLEnum(PaymentTriggerType), nullable=False)
    time_type = Column(SQLEnum(TimeType), nullable=True)  # Only for TIME triggers
    amount = Column(Numeric(15, 2), nullable=False)
    num_installments = Column(Integer, nullable=True)  # Only for MONTHLY triggers
    milestone_date = Column(Date, nullable=True)  # Only for MILESTONE triggers
    row_order = Column(Integer, nullable=False, default=0)
    
    # Relationships
    quote = relationship("Quote", back_populates="payment_triggers")


class QuoteVariableCompensation(Base):
    """Variable compensation assignment for quotes."""
    
    __tablename__ = "quote_variable_compensations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    quote_id = Column(UUID(as_uuid=True), ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="RESTRICT"), nullable=False, index=True)
    revenue_type = Column(SQLEnum(RevenueType), nullable=False, default=RevenueType.GROSS_MARGIN)
    percentage_amount = Column(Numeric(5, 2), nullable=False)  # 0-100
    
    # Relationships
    quote = relationship("Quote", back_populates="variable_compensations")
    employee = relationship("Employee")


"""
Quote model for project quoting system.
"""

from sqlalchemy import Column, String, Date, JSON, ForeignKey, Enum as SQLEnum, Numeric, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum

from app.db.base import Base


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


class QuoteStatus(str, enum.Enum):
    """Quote status enumeration."""
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"


class Quote(Base):
    """Quote model for project quotes."""
    
    __tablename__ = "quotes"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    currency = Column(String(3), nullable=False, default="USD")
    status = Column(
        SQLEnum(QuoteStatus, values_callable=lambda x: [e.value for e in QuoteStatus]),
        nullable=False,
        default=QuoteStatus.DRAFT
    )
    description = Column(String(2000), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("employees.id"), nullable=True, index=True)
    attributes = Column(JSON, nullable=True, default=dict)
    
    # Relationships
    engagement = relationship("Engagement", back_populates="quotes")
    created_by_employee = relationship("Employee", foreign_keys=[created_by])
    line_items = relationship("QuoteLineItem", back_populates="quote", cascade="all, delete-orphan", order_by="QuoteLineItem.row_order")
    phases = relationship("QuotePhase", back_populates="quote", cascade="all, delete-orphan", order_by="QuotePhase.row_order")


class QuoteLineItem(Base):
    """Line item in a quote representing a role assignment."""
    
    __tablename__ = "quote_line_items"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    quote_id = Column(UUID(as_uuid=True), ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False, index=True)
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=False, index=True)
    delivery_center_id = Column(UUID(as_uuid=True), ForeignKey("delivery_centers.id"), nullable=False, index=True)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id"), nullable=True, index=True)
    rate = Column(Numeric(15, 2), nullable=False)  # External bill rate
    cost = Column(Numeric(15, 2), nullable=False)  # Internal cost rate
    currency = Column(String(3), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    row_order = Column(Integer, nullable=False, default=0)
    
    # Relationships
    quote = relationship("Quote", back_populates="line_items")
    role = relationship("Role")
    delivery_center = relationship("DeliveryCenter")
    employee = relationship("Employee")
    weekly_hours = relationship("QuoteWeeklyHours", back_populates="line_item", cascade="all, delete-orphan", order_by="QuoteWeeklyHours.week_start_date")


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



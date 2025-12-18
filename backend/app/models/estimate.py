"""
Estimate model for project estimating system.
"""

from sqlalchemy import Column, String, Date, JSON, ForeignKey, Enum as SQLEnum, Numeric, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum

from app.db.base import Base


class EstimatePhase(Base):
    """Phase definition for an estimate with time range and color."""
    
    __tablename__ = "quote_phases"  # Keep table name for now (would need migration to change)
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    quote_id = Column(UUID(as_uuid=True), ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False, index=True)  # Keep column name for now
    name = Column(String(100), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    color = Column(String(7), nullable=False, default="#3B82F6")  # Hex color code
    row_order = Column(Integer, nullable=False, default=0)
    
    # Relationships
    estimate = relationship("Estimate", back_populates="phases", foreign_keys=[quote_id], primaryjoin="EstimatePhase.quote_id == Estimate.id")


class EstimateStatus(str, enum.Enum):
    """Estimate status enumeration."""
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"


class Estimate(Base):
    """Estimate model for project estimates."""
    
    __tablename__ = "quotes"  # Keep table name for now (would need migration to change)
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    release_id = Column(UUID(as_uuid=True), ForeignKey("releases.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    currency = Column(String(3), nullable=False, default="USD")
    status = Column(
        SQLEnum(EstimateStatus, values_callable=lambda x: [e.value for e in EstimateStatus]),
        nullable=False,
        default=EstimateStatus.DRAFT
    )
    description = Column(String(2000), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("employees.id"), nullable=True, index=True)
    attributes = Column(JSON, nullable=True, default=dict)
    
    # Relationships
    release = relationship("Release", back_populates="estimates")
    created_by_employee = relationship("Employee", foreign_keys=[created_by])
    line_items = relationship("EstimateLineItem", back_populates="estimate", cascade="all, delete-orphan", order_by="EstimateLineItem.row_order", foreign_keys="[EstimateLineItem.quote_id]", primaryjoin="Estimate.id == EstimateLineItem.quote_id")
    phases = relationship("EstimatePhase", back_populates="estimate", cascade="all, delete-orphan", order_by="EstimatePhase.row_order", foreign_keys="[EstimatePhase.quote_id]", primaryjoin="Estimate.id == EstimatePhase.quote_id")


class EstimateLineItem(Base):
    """Line item in an estimate representing a role assignment."""
    
    __tablename__ = "quote_line_items"  # Keep table name for now (would need migration to change)
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    quote_id = Column(UUID(as_uuid=True), ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False, index=True)  # Keep column name for now
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
    estimate = relationship("Estimate", back_populates="line_items", foreign_keys=[quote_id], primaryjoin="EstimateLineItem.quote_id == Estimate.id")
    role = relationship("Role")
    delivery_center = relationship("DeliveryCenter")
    employee = relationship("Employee")
    weekly_hours = relationship("EstimateWeeklyHours", back_populates="line_item", cascade="all, delete-orphan", order_by="EstimateWeeklyHours.week_start_date")


class EstimateWeeklyHours(Base):
    """Weekly hours allocation for an estimate line item."""
    
    __tablename__ = "quote_weekly_hours"  # Keep table name for now (would need migration to change)
    __table_args__ = (
        UniqueConstraint("quote_line_item_id", "week_start_date", name="uq_quote_line_item_week"),
    )
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    quote_line_item_id = Column(UUID(as_uuid=True), ForeignKey("quote_line_items.id", ondelete="CASCADE"), nullable=False, index=True)  # Keep column name for now
    week_start_date = Column(Date, nullable=False, index=True)  # Monday of the week
    hours = Column(Numeric(10, 2), nullable=False, default=0)
    
    # Relationships
    line_item = relationship("EstimateLineItem", back_populates="weekly_hours", foreign_keys=[quote_line_item_id], primaryjoin="EstimateWeeklyHours.quote_line_item_id == EstimateLineItem.id")


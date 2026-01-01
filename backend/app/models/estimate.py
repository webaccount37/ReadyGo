"""
Estimate model for project estimating system.
"""

from sqlalchemy import Column, String, Date, JSON, ForeignKey, Numeric, Integer, UniqueConstraint, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum

from app.db.base import Base


class EstimatePhase(Base):
    """Phase definition for an estimate with time range and color."""
    
    __tablename__ = "estimate_phases"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    estimate_id = Column(UUID(as_uuid=True), ForeignKey("estimates.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    color = Column(String(7), nullable=False, default="#3B82F6")  # Hex color code
    row_order = Column(Integer, nullable=False, default=0)
    
    # Relationships
    estimate = relationship("Estimate", back_populates="phases", foreign_keys=[estimate_id], primaryjoin="EstimatePhase.estimate_id == Estimate.id")


class Estimate(Base):
    """Estimate model for project estimates."""
    
    __tablename__ = "estimates"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(String(2000), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("employees.id"), nullable=True, index=True)
    active_version = Column(Boolean, nullable=False, default=False)
    attributes = Column(JSON, nullable=True, default=dict)
    
    # Relationships
    engagement = relationship("Engagement", back_populates="estimates")
    created_by_employee = relationship("Employee", foreign_keys=[created_by])
    line_items = relationship("EstimateLineItem", back_populates="estimate", cascade="all, delete-orphan", order_by="EstimateLineItem.row_order", foreign_keys="[EstimateLineItem.estimate_id]", primaryjoin="Estimate.id == EstimateLineItem.estimate_id")
    phases = relationship("EstimatePhase", back_populates="estimate", cascade="all, delete-orphan", order_by="EstimatePhase.row_order", foreign_keys="[EstimatePhase.estimate_id]", primaryjoin="Estimate.id == EstimatePhase.estimate_id")


class EstimateLineItem(Base):
    """Line item in an estimate representing a role assignment."""
    
    __tablename__ = "estimate_line_items"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    estimate_id = Column(UUID(as_uuid=True), ForeignKey("estimates.id", ondelete="CASCADE"), nullable=False, index=True)
    role_rates_id = Column(UUID(as_uuid=True), ForeignKey("role_rates.id"), nullable=False, index=True)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id"), nullable=True, index=True)
    rate = Column(Numeric(15, 2), nullable=False)  # External bill rate
    cost = Column(Numeric(15, 2), nullable=False)  # Internal cost rate
    currency = Column(String(3), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    row_order = Column(Integer, nullable=False, default=0)
    billable = Column(Boolean, nullable=False, default=True)
    billable_expense_percentage = Column(Numeric(5, 2), nullable=False, default=0)  # Billable expense percentage (0-100)
    
    # Relationships
    estimate = relationship("Estimate", back_populates="line_items", foreign_keys=[estimate_id], primaryjoin="EstimateLineItem.estimate_id == Estimate.id")
    role_rate = relationship("RoleRate", back_populates="estimate_line_items")
    employee = relationship("Employee")
    weekly_hours = relationship("EstimateWeeklyHours", back_populates="line_item", cascade="all, delete-orphan", order_by="EstimateWeeklyHours.week_start_date")


class EstimateWeeklyHours(Base):
    """Weekly hours allocation for an estimate line item."""
    
    __tablename__ = "estimate_weekly_hours"
    __table_args__ = (
        UniqueConstraint("estimate_line_item_id", "week_start_date", name="uq_estimate_line_item_week"),
    )
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    estimate_line_item_id = Column(UUID(as_uuid=True), ForeignKey("estimate_line_items.id", ondelete="CASCADE"), nullable=False, index=True)
    week_start_date = Column(Date, nullable=False, index=True)  # Sunday of the week
    hours = Column(Numeric(10, 2), nullable=False, default=0)
    
    # Relationships
    line_item = relationship("EstimateLineItem", back_populates="weekly_hours", foreign_keys=[estimate_line_item_id], primaryjoin="EstimateWeeklyHours.estimate_line_item_id == EstimateLineItem.id")


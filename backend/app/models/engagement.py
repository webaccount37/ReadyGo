"""
Engagement model for project engagements.
"""

from sqlalchemy import Column, String, Date, JSON, ForeignKey, Numeric, Integer, UniqueConstraint, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid

from app.db.base import Base


class EngagementPhase(Base):
    """Phase definition for an engagement with time range and color."""
    
    __tablename__ = "engagement_phases"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    color = Column(String(7), nullable=False, default="#3B82F6")  # Hex color code
    row_order = Column(Integer, nullable=False, default=0)
    
    # Relationships
    engagement = relationship("Engagement", back_populates="phases", foreign_keys=[engagement_id], primaryjoin="EngagementPhase.engagement_id == Engagement.id")


class Engagement(Base):
    """Engagement model for project engagements."""
    
    __tablename__ = "engagements"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    quote_id = Column(UUID(as_uuid=True), ForeignKey("quotes.id", ondelete="RESTRICT"), nullable=False, index=True)
    opportunity_id = Column(UUID(as_uuid=True), ForeignKey("opportunities.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(String(2000), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("employees.id"), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, server_default="now()")
    attributes = Column(JSON, nullable=True, default=dict)
    
    # Relationships
    quote = relationship("Quote", foreign_keys=[quote_id])
    opportunity = relationship("Opportunity", back_populates="engagements")
    timesheet_approvers = relationship("EngagementTimesheetApprover", back_populates="engagement", cascade="all, delete-orphan")
    created_by_employee = relationship("Employee", foreign_keys=[created_by])
    line_items = relationship("EngagementLineItem", back_populates="engagement", cascade="all, delete-orphan", order_by="EngagementLineItem.row_order", foreign_keys="[EngagementLineItem.engagement_id]", primaryjoin="Engagement.id == EngagementLineItem.engagement_id")
    phases = relationship("EngagementPhase", back_populates="engagement", cascade="all, delete-orphan", order_by="EngagementPhase.row_order", foreign_keys="[EngagementPhase.engagement_id]", primaryjoin="Engagement.id == EngagementPhase.engagement_id")


class EngagementLineItem(Base):
    """Line item in an engagement representing a role assignment."""
    
    __tablename__ = "engagement_line_items"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id", ondelete="CASCADE"), nullable=False, index=True)
    role_rates_id = Column(UUID(as_uuid=True), ForeignKey("role_rates.id"), nullable=False, index=True)
    payable_center_id = Column(UUID(as_uuid=True), ForeignKey("delivery_centers.id"), nullable=True, index=True)  # Payable Center (reference only, not used for rate calculations)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id"), nullable=True, index=True)
    rate = Column(Numeric(15, 2), nullable=False)  # External bill rate
    cost = Column(Numeric(15, 2), nullable=False)  # Internal cost rate
    currency = Column(String(3), nullable=False)
    start_date = Column(Date, nullable=False)  # Can be any date (not tied to Opportunity)
    end_date = Column(Date, nullable=False)  # Can be any date (not tied to Opportunity)
    row_order = Column(Integer, nullable=False, default=0)
    billable = Column(Boolean, nullable=False, default=True)
    billable_expense_percentage = Column(Numeric(5, 2), nullable=False, default=0)  # Billable expense percentage (0-100)
    
    # Relationships
    engagement = relationship("Engagement", back_populates="line_items", foreign_keys=[engagement_id], primaryjoin="EngagementLineItem.engagement_id == Engagement.id")
    role_rate = relationship("RoleRate", back_populates="engagement_line_items")
    payable_center = relationship("DeliveryCenter", foreign_keys=[payable_center_id])  # Payable Center relationship
    employee = relationship("Employee")
    weekly_hours = relationship("EngagementWeeklyHours", back_populates="line_item", cascade="all, delete-orphan", order_by="EngagementWeeklyHours.week_start_date")


class EngagementWeeklyHours(Base):
    """Weekly hours allocation for an engagement line item."""
    
    __tablename__ = "engagement_weekly_hours"
    __table_args__ = (
        UniqueConstraint("engagement_line_item_id", "week_start_date", name="uq_engagement_line_item_week"),
    )
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    engagement_line_item_id = Column(UUID(as_uuid=True), ForeignKey("engagement_line_items.id", ondelete="CASCADE"), nullable=False, index=True)
    week_start_date = Column(Date, nullable=False, index=True)  # Sunday of the week
    hours = Column(Numeric(10, 2), nullable=False, default=0)
    
    # Relationships
    line_item = relationship("EngagementLineItem", back_populates="weekly_hours", foreign_keys=[engagement_line_item_id], primaryjoin="EngagementWeeklyHours.engagement_line_item_id == EngagementLineItem.id")

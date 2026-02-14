"""
Timesheet models for time entry and approval workflows.
"""

from sqlalchemy import Column, String, Date, ForeignKey, Numeric, Integer, Boolean, DateTime, UniqueConstraint, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum

from app.db.base import Base


class TimesheetStatus(str, enum.Enum):
    """Timesheet status enumeration."""
    NOT_SUBMITTED = "NOT_SUBMITTED"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REOPENED = "REOPENED"
    INVOICED = "INVOICED"


class TimesheetEntryType(str, enum.Enum):
    """Timesheet entry type enumeration."""
    ENGAGEMENT = "ENGAGEMENT"
    SALES = "SALES"


class Timesheet(Base):
    """Timesheet model - one per employee per week."""
    
    __tablename__ = "timesheets"
    __table_args__ = (
        UniqueConstraint("employee_id", "week_start_date", name="uq_timesheet_employee_week"),
    )
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    week_start_date = Column(Date, nullable=False, index=True)  # Sunday of the week
    status = Column(SQLEnum(TimesheetStatus), nullable=False, default=TimesheetStatus.NOT_SUBMITTED, index=True)
    created_at = Column(DateTime, nullable=False, server_default="now()")
    updated_at = Column(DateTime, nullable=False, server_default="now()", onupdate="now()")
    
    # Relationships
    employee = relationship("Employee", back_populates="timesheets")
    entries = relationship("TimesheetEntry", back_populates="timesheet", cascade="all, delete-orphan", order_by="TimesheetEntry.row_order")
    status_history = relationship("TimesheetStatusHistory", back_populates="timesheet", cascade="all, delete-orphan", order_by="TimesheetStatusHistory.changed_at")


class TimesheetEntry(Base):
    """Single row in a timesheet - Engagement or Sales time entry."""
    
    __tablename__ = "timesheet_entries"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    timesheet_id = Column(UUID(as_uuid=True), ForeignKey("timesheets.id", ondelete="CASCADE"), nullable=False, index=True)
    row_order = Column(Integer, nullable=False, default=0)
    
    entry_type = Column(SQLEnum(TimesheetEntryType), nullable=False, default=TimesheetEntryType.ENGAGEMENT)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=False, index=True)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=True, index=True)
    opportunity_id = Column(UUID(as_uuid=True), ForeignKey("opportunities.id"), nullable=True, index=True)
    engagement_line_item_id = Column(UUID(as_uuid=True), ForeignKey("engagement_line_items.id"), nullable=True, index=True)
    engagement_phase_id = Column(UUID(as_uuid=True), ForeignKey("engagement_phases.id"), nullable=True, index=True)
    billable = Column(Boolean, nullable=False, default=True)
    
    # Per-day hours (Sun=0 through Sat=6)
    sun_hours = Column(Numeric(10, 2), nullable=False, default=0)
    mon_hours = Column(Numeric(10, 2), nullable=False, default=0)
    tue_hours = Column(Numeric(10, 2), nullable=False, default=0)
    wed_hours = Column(Numeric(10, 2), nullable=False, default=0)
    thu_hours = Column(Numeric(10, 2), nullable=False, default=0)
    fri_hours = Column(Numeric(10, 2), nullable=False, default=0)
    sat_hours = Column(Numeric(10, 2), nullable=False, default=0)
    
    # Relationships
    timesheet = relationship("Timesheet", back_populates="entries")
    account = relationship("Account", foreign_keys=[account_id])
    engagement = relationship("Engagement", foreign_keys=[engagement_id])
    opportunity = relationship("Opportunity", foreign_keys=[opportunity_id])
    engagement_line_item = relationship("EngagementLineItem", foreign_keys=[engagement_line_item_id])
    engagement_phase = relationship("EngagementPhase", foreign_keys=[engagement_phase_id])
    day_notes = relationship("TimesheetDayNote", back_populates="timesheet_entry", cascade="all, delete-orphan")
    approved_snapshots = relationship("TimesheetApprovedSnapshot", back_populates="timesheet_entry", cascade="all, delete-orphan")


class TimesheetDayNote(Base):
    """Optional notes per day for timesheet entries."""
    
    __tablename__ = "timesheet_day_notes"
    __table_args__ = (
        UniqueConstraint("timesheet_entry_id", "day_of_week", name="uq_timesheet_entry_day"),
    )
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    timesheet_entry_id = Column(UUID(as_uuid=True), ForeignKey("timesheet_entries.id", ondelete="CASCADE"), nullable=False, index=True)
    day_of_week = Column(Integer, nullable=False)  # 0=Sun, 1=Mon, ..., 6=Sat
    note = Column(String(2000), nullable=True)
    
    # Relationships
    timesheet_entry = relationship("TimesheetEntry", back_populates="day_notes")


class TimesheetApprovedSnapshot(Base):
    """Snapshot of cost/rate when timesheet is approved - for invoicing."""
    
    __tablename__ = "timesheet_approved_snapshots"
    __table_args__ = (
        UniqueConstraint("timesheet_entry_id", "day_of_week", name="uq_snapshot_entry_day"),
    )
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    timesheet_entry_id = Column(UUID(as_uuid=True), ForeignKey("timesheet_entries.id", ondelete="CASCADE"), nullable=False, index=True)
    day_of_week = Column(Integer, nullable=False)
    
    hours = Column(Numeric(10, 2), nullable=False)
    cost = Column(Numeric(15, 2), nullable=False)
    rate = Column(Numeric(15, 2), nullable=False)
    billable = Column(Boolean, nullable=False)
    
    invoice_currency = Column(String(3), nullable=False)
    invoice_rate = Column(Numeric(15, 2), nullable=False)
    invoice_cost = Column(Numeric(15, 2), nullable=False)
    currency_rate_id = Column(UUID(as_uuid=True), ForeignKey("currency_rates.id"), nullable=True, index=True)
    currency_rate_applied = Column(Numeric(15, 6), nullable=True)
    
    # Relationships
    timesheet_entry = relationship("TimesheetEntry", back_populates="approved_snapshots")
    currency_rate = relationship("CurrencyRate", foreign_keys=[currency_rate_id])


class TimesheetStatusHistory(Base):
    """Audit trail for timesheet status changes."""
    
    __tablename__ = "timesheet_status_history"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    timesheet_id = Column(UUID(as_uuid=True), ForeignKey("timesheets.id", ondelete="CASCADE"), nullable=False, index=True)
    from_status = Column(SQLEnum(TimesheetStatus), nullable=True)
    to_status = Column(SQLEnum(TimesheetStatus), nullable=False)
    changed_by_employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id"), nullable=True, index=True)
    changed_at = Column(DateTime, nullable=False, server_default="now()")
    
    # Relationships
    timesheet = relationship("Timesheet", back_populates="status_history")
    changed_by_employee = relationship("Employee", foreign_keys=[changed_by_employee_id])

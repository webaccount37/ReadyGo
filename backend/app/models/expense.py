"""Expense sheets, lines, status history, and receipt metadata."""

import uuid

from sqlalchemy import (
    Column,
    String,
    Date,
    ForeignKey,
    Numeric,
    Integer,
    Boolean,
    DateTime,
    UniqueConstraint,
    Enum as SQLEnum,
    func,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.timesheet import TimesheetStatus, TimesheetEntryType


class ExpenseSheet(Base):
    __tablename__ = "expense_sheets"
    __table_args__ = (UniqueConstraint("employee_id", "week_start_date", name="uq_expense_sheet_employee_week"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    week_start_date = Column(Date, nullable=False, index=True)
    status = Column(
        SQLEnum(TimesheetStatus, native_enum=False, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=TimesheetStatus.NOT_SUBMITTED,
        index=True,
    )
    reimbursement_currency = Column(String(3), nullable=False, default="USD")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    employee = relationship("Employee", back_populates="expense_sheets")
    lines = relationship(
        "ExpenseLine",
        back_populates="sheet",
        cascade="all, delete-orphan",
        order_by="ExpenseLine.row_order",
    )
    status_history = relationship(
        "ExpenseStatusHistory",
        back_populates="sheet",
        cascade="all, delete-orphan",
        order_by="ExpenseStatusHistory.changed_at",
    )


class ExpenseLine(Base):
    __tablename__ = "expense_lines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    expense_sheet_id = Column(UUID(as_uuid=True), ForeignKey("expense_sheets.id", ondelete="CASCADE"), nullable=False, index=True)
    row_order = Column(Integer, nullable=False, default=0)

    entry_type = Column(
        SQLEnum(TimesheetEntryType, native_enum=False, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=TimesheetEntryType.ENGAGEMENT,
    )
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=True, index=True)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=True, index=True)
    opportunity_id = Column(UUID(as_uuid=True), ForeignKey("opportunities.id"), nullable=True, index=True)
    engagement_line_item_id = Column(UUID(as_uuid=True), ForeignKey("engagement_line_items.id"), nullable=True, index=True)
    engagement_phase_id = Column(UUID(as_uuid=True), ForeignKey("engagement_phases.id"), nullable=True, index=True)
    billable = Column(Boolean, nullable=False, default=True)

    reimburse = Column(Boolean, nullable=False, default=True)
    date_incurred = Column(Date, nullable=True)
    expense_category_id = Column(Integer, ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=True, index=True)
    description = Column(Text, nullable=True)
    line_currency = Column(String(3), nullable=False, default="USD")
    amount = Column(Numeric(18, 4), nullable=False, default=0)

    sheet = relationship("ExpenseSheet", back_populates="lines")
    account = relationship("Account", foreign_keys=[account_id])
    engagement = relationship("Engagement", foreign_keys=[engagement_id])
    opportunity = relationship("Opportunity", foreign_keys=[opportunity_id])
    engagement_line_item = relationship("EngagementLineItem", foreign_keys=[engagement_line_item_id])
    engagement_phase = relationship("EngagementPhase", foreign_keys=[engagement_phase_id])
    category = relationship("ExpenseCategory", back_populates="lines")
    receipts = relationship(
        "ExpenseReceipt",
        back_populates="line",
        cascade="all, delete-orphan",
    )


class ExpenseStatusHistory(Base):
    __tablename__ = "expense_status_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    expense_sheet_id = Column(UUID(as_uuid=True), ForeignKey("expense_sheets.id", ondelete="CASCADE"), nullable=False, index=True)
    from_status = Column(
        SQLEnum(TimesheetStatus, native_enum=False, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
    )
    to_status = Column(
        SQLEnum(TimesheetStatus, native_enum=False, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    changed_by_employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id"), nullable=True, index=True)
    changed_at = Column(DateTime, nullable=False, server_default=func.now())
    note = Column(String(2000), nullable=True)

    sheet = relationship("ExpenseSheet", back_populates="status_history")
    changed_by_employee = relationship("Employee", foreign_keys=[changed_by_employee_id])


class ExpenseReceipt(Base):
    __tablename__ = "expense_receipts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    expense_line_id = Column(UUID(as_uuid=True), ForeignKey("expense_lines.id", ondelete="CASCADE"), nullable=False, index=True)
    blob_container = Column(String(255), nullable=False)
    blob_name = Column(String(512), nullable=False)
    original_filename = Column(String(512), nullable=True)
    content_type = Column(String(255), nullable=True)
    size_bytes = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    line = relationship("ExpenseLine", back_populates="receipts")

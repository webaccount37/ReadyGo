"""
Persistence for Financial Forecast manual expenses, overrides, and audit history.
"""

from sqlalchemy import Column, String, Date, ForeignKey, Numeric, Integer, DateTime, Text, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy import func
import uuid

from app.db.base import Base


class FinancialForecastExpenseLine(Base):
    """User-defined expense line under an allowed expense parent group."""

    __tablename__ = "financial_forecast_expense_lines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    delivery_center_id = Column(UUID(as_uuid=True), ForeignKey("delivery_centers.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_group_code = Column(String(128), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    created_by_employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)

    delivery_center = relationship("DeliveryCenter")
    created_by_employee = relationship("Employee", foreign_keys=[created_by_employee_id])
    cells = relationship("FinancialForecastExpenseCell", back_populates="line", cascade="all, delete-orphan")


class FinancialForecastExpenseCell(Base):
    """Manual currency amount per expense line per calendar month."""

    __tablename__ = "financial_forecast_expense_cells"
    __table_args__ = (
        UniqueConstraint("line_id", "month_start_date", name="uq_ff_expense_line_month"),
        Index("ix_ff_expense_cells_dc_month", "month_start_date"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    line_id = Column(UUID(as_uuid=True), ForeignKey("financial_forecast_expense_lines.id", ondelete="CASCADE"), nullable=False, index=True)
    month_start_date = Column(Date, nullable=False, index=True)
    amount = Column(Numeric(18, 4), nullable=False, default=0)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    updated_by_employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)

    line = relationship("FinancialForecastExpenseLine", back_populates="cells")
    updated_by_employee = relationship("Employee", foreign_keys=[updated_by_employee_id])


class FinancialForecastLineOverride(Base):
    """Manual override for an automated P&L row for a delivery center and month."""

    __tablename__ = "financial_forecast_line_overrides"
    __table_args__ = (
        UniqueConstraint("delivery_center_id", "row_key", "month_start_date", name="uq_ff_override_dc_row_month"),
        Index("ix_ff_overrides_dc_month", "delivery_center_id", "month_start_date"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    delivery_center_id = Column(UUID(as_uuid=True), ForeignKey("delivery_centers.id", ondelete="CASCADE"), nullable=False, index=True)
    row_key = Column(String(256), nullable=False, index=True)
    month_start_date = Column(Date, nullable=False, index=True)
    amount = Column(Numeric(18, 4), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    created_by_employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)
    updated_by_employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)

    delivery_center = relationship("DeliveryCenter")


class FinancialForecastChangeEvent(Base):
    """Append-only audit trail for financial forecast edits."""

    __tablename__ = "financial_forecast_change_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    delivery_center_id = Column(UUID(as_uuid=True), ForeignKey("delivery_centers.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String(64), nullable=False, index=True)
    payload = Column(JSONB, nullable=False, default=dict)
    correlation_id = Column(String(64), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)

    delivery_center = relationship("DeliveryCenter")
    employee = relationship("Employee", foreign_keys=[employee_id])

"""Engagement expense approver association (parallel to timesheet approvers)."""

from sqlalchemy import Column, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.base import Base


class EngagementExpenseApprover(Base):
    __tablename__ = "engagement_expense_approvers"

    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id", ondelete="CASCADE"), primary_key=True)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), primary_key=True)

    engagement = relationship("Engagement", back_populates="expense_approvers", foreign_keys=[engagement_id])
    employee = relationship("Employee", foreign_keys=[employee_id])

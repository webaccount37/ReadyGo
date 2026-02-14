"""
Engagement Timesheet Approver association model.
"""

from sqlalchemy import Column, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.base import Base


class EngagementTimesheetApprover(Base):
    """Association model for engagement-timesheet approver relationships."""
    
    __tablename__ = "engagement_timesheet_approvers"
    
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id", ondelete="CASCADE"), primary_key=True)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), primary_key=True)
    
    # Relationships
    engagement = relationship("Engagement", back_populates="timesheet_approvers", foreign_keys=[engagement_id])
    employee = relationship("Employee", foreign_keys=[employee_id])

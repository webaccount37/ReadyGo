"""
Opportunity permanent lock - triggered when timesheet entry with hours is saved.
"""

from sqlalchemy import Column, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid

from app.db.base import Base


class OpportunityPermanentLock(Base):
    """Records that an Opportunity is permanently locked due to timesheet entry."""
    
    __tablename__ = "opportunity_permanent_locks"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    opportunity_id = Column(UUID(as_uuid=True), ForeignKey("opportunities.id", ondelete="CASCADE"), nullable=False, index=True, unique=True)
    locked_at = Column(DateTime, nullable=False, server_default="now()")
    locked_by_timesheet_id = Column(UUID(as_uuid=True), ForeignKey("timesheets.id"), nullable=True, index=True)
    
    # Relationships
    opportunity = relationship("Opportunity", back_populates="permanent_lock")
    timesheet = relationship("Timesheet", foreign_keys=[locked_by_timesheet_id])

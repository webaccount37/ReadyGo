"""
Employee-Engagement association model.
"""

from sqlalchemy import Column, Date, Float, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum

from app.db.base import Base


class DeliveryCenterEnum(str, enum.Enum):
    """Delivery center enumeration."""
    NORTH_AMERICA = "north-america"
    THAILAND = "thailand"
    PHILIPPINES = "philippines"
    AUSTRALIA = "australia"


class EmployeeEngagement(Base):
    """Association model for employee-engagement relationships."""
    
    __tablename__ = "employee_engagements"
    
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id"), primary_key=True)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id"), primary_key=True)
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    project_rate = Column(Float, nullable=False)
    delivery_center = Column(SQLEnum(DeliveryCenterEnum), nullable=False)
    
    # Relationships
    employee = relationship("Employee", foreign_keys=[employee_id])
    engagement = relationship("Engagement", foreign_keys=[engagement_id])
    role = relationship("Role", foreign_keys=[role_id])


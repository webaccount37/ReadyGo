"""
Calendar model for tracking working days, holidays, and financial periods.
"""

from sqlalchemy import Column, Integer, Boolean, String, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid

from app.db.base import Base


class Calendar(Base):
    """Calendar model for tracking dates, holidays, and working hours."""
    
    __tablename__ = "calendars"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    year = Column(Integer, nullable=False, index=True)
    month = Column(Integer, nullable=False, index=True)
    day = Column(Integer, nullable=False, index=True)
    is_holiday = Column(Boolean, default=False, nullable=False)
    holiday_name = Column(String(255), nullable=True)
    financial_period = Column(String(50), nullable=True)  # FY2024-Q1-M01 format
    working_hours = Column(Float, default=8.0, nullable=False)
    notes = Column(String(1000), nullable=True)
    
    # Relationships
    employees = relationship("Employee", foreign_keys="Employee.availability_calendar_id")


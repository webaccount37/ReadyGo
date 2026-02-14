"""
Employee model for staff planning and quoting system.
"""

from sqlalchemy import Column, String, Boolean, Float, Date, JSON, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum

from app.db.base import Base


class EmployeeType(str, enum.Enum):
    """Employee type enumeration."""
    FULL_TIME = "full-time"
    CONTRACT = "contract"


class EmployeeStatus(str, enum.Enum):
    """Employee status enumeration."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    ON_LEAVE = "on-leave"


class Employee(Base):
    """Employee model for staff planning."""
    
    __tablename__ = "employees"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    employee_type = Column(SQLEnum(EmployeeType), nullable=False, default=EmployeeType.FULL_TIME)
    status = Column(SQLEnum(EmployeeStatus), nullable=False, default=EmployeeStatus.ACTIVE)
    role_title = Column(String(100), nullable=True)
    skills = Column(JSON, nullable=True, default=list)
    internal_cost_rate = Column(Float, nullable=False)  # ICR
    internal_bill_rate = Column(Float, nullable=False)  # IBR
    external_bill_rate = Column(Float, nullable=False)  # EBR
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    availability_calendar_id = Column(UUID(as_uuid=True), ForeignKey("calendars.id"), nullable=True)
    billable = Column(Boolean, default=True, nullable=False)
    default_currency = Column(String(3), nullable=True, default="USD")
    timezone = Column(String(50), default="UTC", nullable=False)
    delivery_center_id = Column(UUID(as_uuid=True), ForeignKey("delivery_centers.id"), nullable=True)
    
    # Relationships
    availability_calendar = relationship("Calendar", foreign_keys=[availability_calendar_id])
    delivery_center = relationship("DeliveryCenter")
    owned_opportunities = relationship("Opportunity", foreign_keys="Opportunity.opportunity_owner_id", back_populates="opportunity_owner")
    timesheets = relationship("Timesheet", back_populates="employee", foreign_keys="Timesheet.employee_id")



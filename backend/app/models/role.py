"""
Role model for job roles and positions.
"""

from sqlalchemy import Column, String, Float, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum

from app.db.base import Base


class RoleStatus(str, enum.Enum):
    """Role status enumeration."""
    ACTIVE = "active"
    INACTIVE = "inactive"


class Role(Base):
    """Role model for job roles and positions."""
    
    __tablename__ = "roles"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    role_name = Column(String(100), nullable=False, unique=True, index=True)
    role_internal_cost_rate = Column(Float, nullable=True)
    role_external_rate = Column(Float, nullable=True)
    status = Column(SQLEnum(RoleStatus), nullable=False, default=RoleStatus.ACTIVE)
    default_currency = Column(String(3), default="USD", nullable=False)
    
    # Relationships
    employees = relationship("Employee", back_populates="role", foreign_keys="Employee.role_id")
    engagements = relationship("Engagement", secondary="engagement_roles", back_populates="roles")
    releases = relationship("Release", secondary="release_roles", back_populates="roles")
    role_rates = relationship("RoleRate", back_populates="role", cascade="all, delete-orphan")




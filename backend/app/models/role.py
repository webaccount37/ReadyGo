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
    status = Column(SQLEnum(RoleStatus), nullable=False, default=RoleStatus.ACTIVE)
    
    # Relationships
    role_rates = relationship("RoleRate", back_populates="role", cascade="all, delete-orphan")




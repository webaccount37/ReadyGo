"""
Role model for job roles and positions.
"""

from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid

from app.db.base import Base


class Role(Base):
    """Role model for job roles and positions."""
    
    __tablename__ = "roles"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    role_name = Column(String(100), nullable=False, unique=True, index=True)
    
    # Relationships
    role_rates = relationship("RoleRate", back_populates="role", cascade="all, delete-orphan")




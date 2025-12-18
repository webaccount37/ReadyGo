"""
Release model for project releases and iterations.
"""

from sqlalchemy import Column, String, Float, Date, JSON, ForeignKey, Enum as SQLEnum, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.ext.associationproxy import association_proxy
import uuid
import enum

from app.db.base import Base


class ReleaseStatus(str, enum.Enum):
    """Release status enumeration."""
    PLANNING = "planning"
    ACTIVE = "active"
    COMPLETED = "completed"
    ON_HOLD = "on-hold"


class Release(Base):
    """Release model for project releases."""
    
    __tablename__ = "releases"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String(255), nullable=False, index=True)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=False, index=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    budget = Column(Numeric(15, 2), nullable=True)
    status = Column(SQLEnum(ReleaseStatus), nullable=False, default=ReleaseStatus.PLANNING)
    billing_term_id = Column(UUID(as_uuid=True), ForeignKey("billing_terms.id"), nullable=True, index=True)
    description = Column(String(2000), nullable=True)
    default_currency = Column(String(3), default="USD", nullable=False)
    delivery_center_id = Column(UUID(as_uuid=True), ForeignKey("delivery_centers.id"), nullable=True, index=True)
    attributes = Column(JSON, nullable=True, default=dict)
    
    # Relationships
    engagement = relationship("Engagement", back_populates="releases")
    billing_term = relationship("BillingTerm", back_populates="releases")
    delivery_center = relationship("DeliveryCenter", back_populates="releases")
    # Use association objects instead of simple many-to-many
    # Explicitly specify foreign_keys to ensure correct filtering
    employee_associations = relationship(
        "EmployeeRelease", 
        back_populates="release", 
        cascade="all, delete-orphan",
        foreign_keys="[EmployeeRelease.release_id]",
        primaryjoin="Release.id == EmployeeRelease.release_id"
    )
    # Convenience proxy to access employees through associations (for backward compatibility)
    employees = association_proxy("employee_associations", "employee")
    
    roles = relationship("Role", secondary="release_roles", back_populates="releases")
    estimates = relationship("Estimate", back_populates="release", cascade="all, delete-orphan")



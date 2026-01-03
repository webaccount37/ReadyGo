"""
Engagement model for project engagements and iterations.
"""

from sqlalchemy import Column, String, Float, Date, JSON, ForeignKey, Enum as SQLEnum, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum

from app.db.base import Base


class EngagementStatus(str, enum.Enum):
    """Engagement status enumeration."""
    PLANNING = "planning"
    ACTIVE = "active"
    COMPLETED = "completed"
    ON_HOLD = "on-hold"


class Engagement(Base):
    """Engagement model for project engagements."""
    
    __tablename__ = "engagements"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String(255), nullable=False, index=True)
    opportunity_id = Column(UUID(as_uuid=True), ForeignKey("opportunities.id"), nullable=False, index=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    budget = Column(Numeric(15, 2), nullable=True)
    status = Column(SQLEnum(EngagementStatus), nullable=False, default=EngagementStatus.PLANNING)
    billing_term_id = Column(UUID(as_uuid=True), ForeignKey("billing_terms.id"), nullable=True, index=True)
    description = Column(String(2000), nullable=True)
    default_currency = Column(String(3), default="USD", nullable=False)
    delivery_center_id = Column(UUID(as_uuid=True), ForeignKey("delivery_centers.id"), nullable=True, index=True)
    attributes = Column(JSON, nullable=True, default=dict)
    
    # Relationships
    opportunity = relationship("Opportunity", back_populates="engagements")
    billing_term = relationship("BillingTerm", back_populates="engagements")
    delivery_center = relationship("DeliveryCenter", back_populates="engagements")
    estimates = relationship("Estimate", back_populates="engagement", cascade="all, delete-orphan")
    quotes = relationship("Quote", back_populates="engagement", cascade="all, delete-orphan")


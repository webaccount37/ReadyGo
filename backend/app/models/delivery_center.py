"""
Delivery Center model.
"""

from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid

from app.db.base import Base


class DeliveryCenter(Base):
    """Delivery center model."""
    
    __tablename__ = "delivery_centers"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(50), unique=True, nullable=False, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)  # e.g., "north-america"
    default_currency = Column(String(3), default="USD", nullable=False)
    
    # Relationships
    opportunities = relationship("Opportunity", back_populates="delivery_center")
    engagements = relationship("Engagement", back_populates="delivery_center")
    approvers = relationship("DeliveryCenterApprover", back_populates="delivery_center", cascade="all, delete-orphan")



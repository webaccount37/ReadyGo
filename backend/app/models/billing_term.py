"""
Billing Term model for client billing terms reference table.
"""

from sqlalchemy import Column, String, Integer, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid

from app.db.base import Base


class BillingTerm(Base):
    """Billing Term reference model for standardized billing terms."""
    
    __tablename__ = "billing_terms"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    code = Column(String(50), nullable=False, unique=True, index=True)  # e.g., "NET30"
    name = Column(String(100), nullable=False)  # e.g., "Net 30 Days"
    description = Column(String(500), nullable=True)  # e.g., "Payment due within 30 days of invoice date"
    days_until_due = Column(Integer, nullable=True)  # Number of days until payment is due
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)  # For ordering in dropdowns
    
    # Relationships
    accounts = relationship("Account", back_populates="billing_term")
    opportunities = relationship("Opportunity", back_populates="billing_term")


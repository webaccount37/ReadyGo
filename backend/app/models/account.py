"""
Account model for customer management.
"""

from sqlalchemy import Column, String, ForeignKey, Enum as SQLEnum, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum

from app.db.base import Base


class AccountType(str, enum.Enum):
    """Account type enumeration."""
    VENDOR = "vendor"
    CUSTOMER = "customer"
    PARTNER = "partner"
    NETWORK = "network"


class Account(Base):
    """Account model for customer management."""
    
    __tablename__ = "accounts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    company_name = Column(String(255), nullable=False, unique=True, index=True)
    type = Column(
        SQLEnum(AccountType, values_callable=lambda x: [e.value for e in AccountType]),
        nullable=False,
        index=True
    )
    industry = Column(String(100), nullable=True)
    street_address = Column(String(255), nullable=True)
    city = Column(String(100), nullable=True)
    region = Column(String(100), nullable=True)
    country = Column(String(100), nullable=False)
    billing_term_id = Column(UUID(as_uuid=True), ForeignKey("billing_terms.id"), nullable=True, index=True)
    default_currency = Column(String(3), default="USD", nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    
    # Relationships
    opportunities = relationship("Opportunity", back_populates="account", cascade="all, delete-orphan")
    contacts = relationship("Contact", back_populates="account", cascade="all, delete-orphan")
    billing_term = relationship("BillingTerm", back_populates="accounts")

"""
Client model for customer management.
"""

from sqlalchemy import Column, String, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum

from app.db.base import Base


class ClientStatus(str, enum.Enum):
    """Client status enumeration."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    PROSPECT = "prospect"


class Client(Base):
    """Client model for customer management."""
    
    __tablename__ = "clients"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    company_name = Column(String(255), nullable=False, unique=True, index=True)
    industry = Column(String(100), nullable=True)
    street_address = Column(String(255), nullable=False)
    city = Column(String(100), nullable=False)
    region = Column(String(100), nullable=False)
    country = Column(String(100), nullable=False)
    status = Column(SQLEnum(ClientStatus), nullable=False, default=ClientStatus.ACTIVE)
    billing_term_id = Column(UUID(as_uuid=True), ForeignKey("billing_terms.id"), nullable=False, index=True)
    default_currency = Column(String(3), default="USD", nullable=False)
    
    # Relationships
    projects = relationship("Project", back_populates="client", cascade="all, delete-orphan")
    contacts = relationship("Contact", back_populates="client", cascade="all, delete-orphan")
    billing_term = relationship("BillingTerm", back_populates="clients")




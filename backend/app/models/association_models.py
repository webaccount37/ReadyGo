"""
Association object models for many-to-many relationships with additional fields.
"""

from sqlalchemy import Column, String, Float, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid

from app.db.base import Base


class EmployeeEngagement(Base):
    """Association object for Employee-Engagement relationship with additional fields."""
    
    __tablename__ = "employee_engagements"
    
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id"), primary_key=True)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id"), primary_key=True)
    
    # Required fields for the association
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    project_rate = Column(Float, nullable=False)
    delivery_center_id = Column(UUID(as_uuid=True), ForeignKey("delivery_centers.id"), nullable=False)
    
    # Relationships
    employee = relationship("Employee", back_populates="engagement_associations")
    engagement = relationship("Engagement", back_populates="employee_associations")
    role = relationship("Role")
    delivery_center = relationship("DeliveryCenter", back_populates="employee_engagements")


class EmployeeRelease(Base):
    """Association object for Employee-Release relationship with additional fields."""
    
    __tablename__ = "employee_releases"
    
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id"), primary_key=True)
    release_id = Column(UUID(as_uuid=True), ForeignKey("releases.id"), primary_key=True)
    
    # Required fields for the association
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    project_rate = Column(Float, nullable=False)
    delivery_center_id = Column(UUID(as_uuid=True), ForeignKey("delivery_centers.id"), nullable=False)
    
    # Relationships
    employee = relationship("Employee", back_populates="release_associations")
    release = relationship("Release", back_populates="employee_associations")
    role = relationship("Role")
    delivery_center = relationship("DeliveryCenter", back_populates="employee_releases")


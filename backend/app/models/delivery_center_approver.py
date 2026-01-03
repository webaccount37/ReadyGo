"""
Delivery Center Approver association model.
"""

from sqlalchemy import Column, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.base import Base


class DeliveryCenterApprover(Base):
    """Association model for delivery center-approver relationships."""
    
    __tablename__ = "delivery_center_approvers"
    
    delivery_center_id = Column(UUID(as_uuid=True), ForeignKey("delivery_centers.id"), primary_key=True)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id"), primary_key=True)
    
    # Relationships
    delivery_center = relationship("DeliveryCenter", foreign_keys=[delivery_center_id])
    employee = relationship("Employee", foreign_keys=[employee_id])


"""
Role rate model linking a role to a delivery center and currency.
"""

from sqlalchemy import Column, String, Float, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid

from app.db.base import Base


class RoleRate(Base):
    """Rate for a role scoped to delivery center and currency."""

    __tablename__ = "role_rates"
    __table_args__ = (
        UniqueConstraint("role_id", "delivery_center_id", "currency", name="uq_role_dc_currency"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True)
    delivery_center_id = Column(UUID(as_uuid=True), ForeignKey("delivery_centers.id"), nullable=False, index=True)
    currency = Column(String(3), nullable=False)
    internal_cost_rate = Column(Float, nullable=False)
    external_rate = Column(Float, nullable=False)

    # Relationships
    role = relationship("Role", back_populates="role_rates")
    delivery_center = relationship("DeliveryCenter")



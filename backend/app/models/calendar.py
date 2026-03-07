"""
Calendar model for tracking holidays and calendar events by delivery center.
"""

from sqlalchemy import Column, Integer, String, Numeric, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid

from app.db.base import Base


class Calendar(Base):
    """Calendar model for tracking dates, holidays, and hours by delivery center."""

    __tablename__ = "calendars"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    date = Column(Date, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    country_code = Column(String(2), nullable=False)
    hours = Column(Numeric(10, 2), nullable=False, default=8)
    year = Column(Integer, nullable=False, index=True)  # Denormalized for filtering
    delivery_center_id = Column(
        UUID(as_uuid=True), ForeignKey("delivery_centers.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Relationships
    delivery_center = relationship("DeliveryCenter", backref="calendar_events")

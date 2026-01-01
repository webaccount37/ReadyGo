"""
Currency rate model for conversion rates to USD.
"""

from sqlalchemy import Column, String, Float
from sqlalchemy.dialects.postgresql import UUID
import uuid

from app.db.base import Base


class CurrencyRate(Base):
    """Currency rate model for conversion rates to USD."""
    
    __tablename__ = "currency_rates"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    currency_code = Column(String(3), nullable=False, unique=True, index=True)
    rate_to_usd = Column(Float, nullable=False)
    
    def __repr__(self):
        return f"<CurrencyRate(currency_code={self.currency_code}, rate_to_usd={self.rate_to_usd})>"


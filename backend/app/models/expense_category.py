"""Expense category lookup (integer id, name)."""

from sqlalchemy import Column, String, Integer, DateTime, func, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.base import Base


class ExpenseCategory(Base):
    __tablename__ = "expense_categories"
    __table_args__ = (UniqueConstraint("name", name="uq_expense_categories_name"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    lines = relationship("ExpenseLine", back_populates="category")

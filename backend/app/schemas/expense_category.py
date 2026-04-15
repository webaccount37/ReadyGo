"""Expense category schemas."""

from pydantic import BaseModel, Field


class ExpenseCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class ExpenseCategoryUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class ExpenseCategoryResponse(BaseModel):
    id: int
    name: str
    in_use: bool = False

    class Config:
        from_attributes = True


class ExpenseCategoryListResponse(BaseModel):
    items: list[ExpenseCategoryResponse]
    total: int

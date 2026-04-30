"""Merge SharePoint migration head with parallel b2c3d4e5f6a1 head.

Revision ID: a002_merge_sharepoint_b2c3
Revises: a001_sharepoint, b2c3d4e5f6a1
Create Date: 2026-03-26

"""
from typing import Sequence, Union

from alembic import op

revision: str = "a002_merge_sharepoint_b2c3"
down_revision: Union[str, tuple[str, ...], None] = ("a001_sharepoint", "b2c3d4e5f6a1")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

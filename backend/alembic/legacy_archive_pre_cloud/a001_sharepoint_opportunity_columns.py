"""Add SharePoint folder columns to opportunities.

Revision ID: a001_sharepoint
Revises:
Create Date: 2025-03-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a001_sharepoint"
down_revision: Union[str, None] = "merge_heads_roles_client"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "opportunities",
        sa.Column("sharepoint_folder_web_url", sa.String(length=2000), nullable=True),
    )
    op.add_column(
        "opportunities",
        sa.Column("sharepoint_drive_id", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "opportunities",
        sa.Column("sharepoint_item_id", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "opportunities",
        sa.Column("sharepoint_provisioning_error", sa.String(length=2000), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("opportunities", "sharepoint_provisioning_error")
    op.drop_column("opportunities", "sharepoint_item_id")
    op.drop_column("opportunities", "sharepoint_drive_id")
    op.drop_column("opportunities", "sharepoint_folder_web_url")

"""Merge migration: combine add_client_approval_trigger and backfill_role_rates heads.

Revision ID: merge_heads_roles_client
Revises: add_client_approval_trigger, backfill_role_rates
Create Date: 2026-03-16

"""
from alembic import op

revision = "merge_heads_roles_client"
down_revision = ("add_client_approval_trigger", "backfill_role_rates")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

"""financial forecast tables

Revision ID: ff20260412
Revises:
Create Date: 2026-04-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "ff20260412"
down_revision: Union[str, None] = "a002_merge_sharepoint_b2c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "financial_forecast_expense_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("delivery_center_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("delivery_centers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_group_code", sa.String(128), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_by_employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_ff_exp_lines_dc", "financial_forecast_expense_lines", ["delivery_center_id"])
    op.create_index("ix_ff_exp_lines_parent", "financial_forecast_expense_lines", ["parent_group_code"])

    op.create_table(
        "financial_forecast_expense_cells",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("line_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("financial_forecast_expense_lines.id", ondelete="CASCADE"), nullable=False),
        sa.Column("month_start_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_by_employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("line_id", "month_start_date", name="uq_ff_expense_line_month"),
    )
    op.create_index("ix_ff_expense_cells_line", "financial_forecast_expense_cells", ["line_id"])
    op.create_index("ix_ff_expense_cells_month", "financial_forecast_expense_cells", ["month_start_date"])

    op.create_table(
        "financial_forecast_line_overrides",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("delivery_center_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("delivery_centers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("row_key", sa.String(256), nullable=False),
        sa.Column("month_start_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_by_employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by_employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("delivery_center_id", "row_key", "month_start_date", name="uq_ff_override_dc_row_month"),
    )
    op.create_index("ix_ff_overrides_dc_month", "financial_forecast_line_overrides", ["delivery_center_id", "month_start_date"])
    op.create_index("ix_ff_overrides_row", "financial_forecast_line_overrides", ["row_key"])

    op.create_table(
        "financial_forecast_change_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("delivery_center_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("delivery_centers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("correlation_id", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_ff_change_dc", "financial_forecast_change_events", ["delivery_center_id"])
    op.create_index("ix_ff_change_created", "financial_forecast_change_events", ["created_at"])
    op.create_index("ix_ff_change_action", "financial_forecast_change_events", ["action"])


def downgrade() -> None:
    op.drop_table("financial_forecast_change_events")
    op.drop_table("financial_forecast_line_overrides")
    op.drop_table("financial_forecast_expense_cells")
    op.drop_table("financial_forecast_expense_lines")

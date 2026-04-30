"""Expense management: categories, sheets, lines, receipts, engagement expense approvers."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "expense_mgmt_001"
down_revision = "ff20260412"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "expense_categories",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_expense_categories_name"),
    )

    op.execute(
        """
        INSERT INTO expense_categories (name) VALUES
        ('Airfare'),
        ('Hotels'),
        ('Taxis or Shared Rides'),
        ('Meals'),
        ('Vehicle Gas & Fuel'),
        ('Vehicle Rental')
        """
    )

    op.create_table(
        "engagement_expense_approvers",
        sa.Column("engagement_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["engagement_id"], ["engagements.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("engagement_id", "employee_id"),
    )

    op.create_table(
        "expense_sheets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("week_start_date", sa.Date(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default="NOT_SUBMITTED",
        ),
        sa.Column("reimbursement_currency", sa.String(length=3), nullable=False, server_default="USD"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_id", "week_start_date", name="uq_expense_sheet_employee_week"),
    )
    op.create_index("ix_expense_sheets_employee_id", "expense_sheets", ["employee_id"])
    op.create_index("ix_expense_sheets_week_start_date", "expense_sheets", ["week_start_date"])
    op.create_index("ix_expense_sheets_status", "expense_sheets", ["status"])

    op.create_table(
        "expense_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expense_sheet_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("row_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("entry_type", sa.String(length=32), nullable=False, server_default="ENGAGEMENT"),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("engagement_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("opportunity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("engagement_line_item_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("engagement_phase_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("billable", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("reimburse", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("date_incurred", sa.Date(), nullable=True),
        sa.Column("expense_category_id", sa.Integer(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("line_currency", sa.String(length=3), nullable=False, server_default="USD"),
        sa.Column("amount", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"]),
        sa.ForeignKeyConstraint(["engagement_id"], ["engagements.id"]),
        sa.ForeignKeyConstraint(["engagement_line_item_id"], ["engagement_line_items.id"]),
        sa.ForeignKeyConstraint(["engagement_phase_id"], ["engagement_phases.id"]),
        sa.ForeignKeyConstraint(["expense_category_id"], ["expense_categories.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["expense_sheet_id"], ["expense_sheets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["opportunity_id"], ["opportunities.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_expense_lines_expense_sheet_id", "expense_lines", ["expense_sheet_id"])
    op.create_index("ix_expense_lines_expense_category_id", "expense_lines", ["expense_category_id"])

    op.create_table(
        "expense_status_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expense_sheet_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("from_status", sa.String(length=32), nullable=True),
        sa.Column("to_status", sa.String(length=32), nullable=False),
        sa.Column("changed_by_employee_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("changed_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("note", sa.String(length=2000), nullable=True),
        sa.ForeignKeyConstraint(["changed_by_employee_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["expense_sheet_id"], ["expense_sheets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_expense_status_history_expense_sheet_id", "expense_status_history", ["expense_sheet_id"])

    op.create_table(
        "expense_receipts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expense_line_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("blob_container", sa.String(length=255), nullable=False),
        sa.Column("blob_name", sa.String(length=512), nullable=False),
        sa.Column("original_filename", sa.String(length=512), nullable=True),
        sa.Column("content_type", sa.String(length=255), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["expense_line_id"], ["expense_lines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_expense_receipts_expense_line_id", "expense_receipts", ["expense_line_id"])


def downgrade() -> None:
    op.drop_index("ix_expense_receipts_expense_line_id", table_name="expense_receipts")
    op.drop_table("expense_receipts")
    op.drop_index("ix_expense_status_history_expense_sheet_id", table_name="expense_status_history")
    op.drop_table("expense_status_history")
    op.drop_index("ix_expense_lines_expense_category_id", table_name="expense_lines")
    op.drop_index("ix_expense_lines_expense_sheet_id", table_name="expense_lines")
    op.drop_table("expense_lines")
    op.drop_index("ix_expense_sheets_status", table_name="expense_sheets")
    op.drop_index("ix_expense_sheets_week_start_date", table_name="expense_sheets")
    op.drop_index("ix_expense_sheets_employee_id", table_name="expense_sheets")
    op.drop_table("expense_sheets")
    op.drop_table("engagement_expense_approvers")
    op.drop_table("expense_categories")

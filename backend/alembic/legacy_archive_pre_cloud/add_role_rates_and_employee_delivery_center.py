"""
Add role_rates table and employee delivery center foreign key.

Revision ID: add_role_rates_dc_fk
Revises: make_employee_fields_required
Create Date: 2025-12-05 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid as uuid_module

# revision identifiers, used by Alembic.
revision = "add_role_rates_dc_fk"
down_revision = "make_employee_fields_required"
branch_labels = None
depends_on = None


def _seed_delivery_centers() -> None:
    """Ensure the four required delivery centers exist."""
    dc_uuids = {
        "north-america": uuid_module.uuid5(uuid_module.NAMESPACE_DNS, "delivery-center.north-america"),
        "thailand": uuid_module.uuid5(uuid_module.NAMESPACE_DNS, "delivery-center.thailand"),
        "philippines": uuid_module.uuid5(uuid_module.NAMESPACE_DNS, "delivery-center.philippines"),
        "australia": uuid_module.uuid5(uuid_module.NAMESPACE_DNS, "delivery-center.australia"),
    }
    op.execute(
        sa.text(
            """
            INSERT INTO delivery_centers (id, name, code)
            VALUES
                (:na_id, 'North America', 'north-america'),
                (:th_id, 'Thailand', 'thailand'),
                (:ph_id, 'Philippines', 'philippines'),
                (:au_id, 'Australia', 'australia')
            ON CONFLICT (code) DO NOTHING
            """
        ).bindparams(
            na_id=dc_uuids["north-america"],
            th_id=dc_uuids["thailand"],
            ph_id=dc_uuids["philippines"],
            au_id=dc_uuids["australia"],
        )
    )


def upgrade() -> None:
    _seed_delivery_centers()

    # Add delivery_center_id to employees and backfill to North America by default
    op.add_column(
        "employees",
        sa.Column("delivery_center_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    op.create_foreign_key(
        "fk_employees_delivery_center_id",
        "employees",
        "delivery_centers",
        ["delivery_center_id"],
        ["id"],
    )
    op.create_index("ix_employees_delivery_center_id", "employees", ["delivery_center_id"])

    op.execute(
        sa.text(
            """
            UPDATE employees
            SET delivery_center_id = dc.id
            FROM delivery_centers dc
            WHERE dc.code = 'north-america' AND delivery_center_id IS NULL
            """
        )
    )

    op.alter_column("employees", "delivery_center_id", nullable=False)

    # Create role_rates table
    op.create_table(
        "role_rates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=uuid_module.uuid4),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("delivery_center_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("internal_cost_rate", sa.Float(), nullable=False),
        sa.Column("external_rate", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["delivery_center_id"], ["delivery_centers.id"]),
        sa.UniqueConstraint("role_id", "delivery_center_id", "currency", name="uq_role_dc_currency"),
    )
    op.create_index("ix_role_rates_role_id", "role_rates", ["role_id"])
    op.create_index("ix_role_rates_delivery_center_id", "role_rates", ["delivery_center_id"])


def downgrade() -> None:
    op.drop_index("ix_role_rates_delivery_center_id", table_name="role_rates")
    op.drop_index("ix_role_rates_role_id", table_name="role_rates")
    op.drop_table("role_rates")

    op.drop_index("ix_employees_delivery_center_id", table_name="employees")
    op.drop_constraint("fk_employees_delivery_center_id", "employees", type_="foreignkey")
    op.drop_column("employees", "delivery_center_id")


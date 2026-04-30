"""add_delivery_center_approvers_table

Revision ID: 1d3c5cb3726a
Revises: b2c3d4e5f6a1
Create Date: 2026-01-03 04:34:01.975261

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '1d3c5cb3726a'
down_revision = 'b2c3d4e5f6a1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create delivery_center_approvers table
    op.create_table(
        'delivery_center_approvers',
        sa.Column('delivery_center_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint('delivery_center_id', 'employee_id'),
        sa.ForeignKeyConstraint(['delivery_center_id'], ['delivery_centers.id'], name='fk_delivery_center_approvers_delivery_center_id'),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], name='fk_delivery_center_approvers_employee_id'),
    )


def downgrade() -> None:
    # Drop delivery_center_approvers table
    op.drop_table('delivery_center_approvers')













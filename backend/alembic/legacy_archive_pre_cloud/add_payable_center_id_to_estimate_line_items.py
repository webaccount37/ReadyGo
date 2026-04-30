"""add_payable_center_id_to_estimate_line_items

Revision ID: add_payable_center_id
Revises: 
Create Date: 2026-01-02 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_payable_center_id'
down_revision = 'f2c72dfb1ee9'  # Latest merge point
branch_labels = None
depends_on = None


def upgrade():
    # Add payable_center_id column to estimate_line_items table
    op.add_column(
        'estimate_line_items',
        sa.Column(
            'payable_center_id',
            postgresql.UUID(as_uuid=True),
            nullable=True,
            index=True
        )
    )
    
    # Add foreign key constraint
    op.create_foreign_key(
        'fk_estimate_line_items_payable_center_id',
        'estimate_line_items',
        'delivery_centers',
        ['payable_center_id'],
        ['id']
    )
    
    # For existing records, set payable_center_id to the delivery_center_id from the role_rate
    # This ensures backward compatibility
    op.execute("""
        UPDATE estimate_line_items
        SET payable_center_id = (
            SELECT role_rates.delivery_center_id
            FROM role_rates
            WHERE role_rates.id = estimate_line_items.role_rates_id
        )
    """)


def downgrade():
    # Remove foreign key constraint
    op.drop_constraint(
        'fk_estimate_line_items_payable_center_id',
        'estimate_line_items',
        type_='foreignkey'
    )
    
    # Remove payable_center_id column
    op.drop_column('estimate_line_items', 'payable_center_id')


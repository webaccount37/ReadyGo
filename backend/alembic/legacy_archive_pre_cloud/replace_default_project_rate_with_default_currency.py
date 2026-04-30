"""replace default_project_rate with default_currency

Revision ID: replace_default_currency
Revises: f1e2d3c4b5a6
Create Date: 2025-12-04 08:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'replace_default_currency'
down_revision = 'f1e2d3c4b5a6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the default_project_rate column
    op.drop_column('employees', 'default_project_rate')
    
    # Add the default_currency column with default value 'USD'
    op.add_column('employees', sa.Column('default_currency', sa.String(length=3), nullable=True, server_default='USD'))


def downgrade() -> None:
    # Remove the default_currency column
    op.drop_column('employees', 'default_currency')
    
    # Restore the default_project_rate column
    op.add_column('employees', sa.Column('default_project_rate', sa.Float(), nullable=True))


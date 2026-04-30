"""replace_account_region_with_delivery_center_id_in_releases

Revision ID: replace_account_region_releases
Revises: replace_financial_terms_releases
Create Date: 2025-12-06 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'replace_account_region_releases'
down_revision = 'replace_financial_terms_releases'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add delivery_center_id column as nullable (releases don't require it)
    op.add_column('releases', sa.Column('delivery_center_id', postgresql.UUID(as_uuid=True), nullable=True))
    
    # Set default delivery_center_id for existing releases from their engagement
    op.execute("""
        UPDATE releases r
        SET delivery_center_id = (
            SELECT delivery_center_id 
            FROM engagements 
            WHERE id = r.engagement_id
        )
        WHERE delivery_center_id IS NULL
    """)
    
    # Add foreign key constraint
    op.create_foreign_key(
        'fk_releases_delivery_center_id',
        'releases', 'delivery_centers',
        ['delivery_center_id'], ['id']
    )
    
    # Add index
    op.create_index(op.f('ix_releases_delivery_center_id'), 'releases', ['delivery_center_id'], unique=False)
    
    # Drop the old account_region column
    op.drop_column('releases', 'account_region')


def downgrade() -> None:
    # Add back the account_region column
    op.add_column('releases', sa.Column('account_region', sa.String(length=100), nullable=True))
    
    # Migrate data back - set account_region to the name of the delivery center
    op.execute("""
        UPDATE releases 
        SET account_region = (
            SELECT name FROM delivery_centers WHERE delivery_centers.id = releases.delivery_center_id
        )
        WHERE delivery_center_id IS NOT NULL
    """)
    
    # Remove index and foreign key
    op.drop_index(op.f('ix_releases_delivery_center_id'), table_name='releases')
    op.drop_constraint('fk_releases_delivery_center_id', 'releases', type_='foreignkey')
    
    # Remove delivery_center_id column
    op.drop_column('releases', 'delivery_center_id')








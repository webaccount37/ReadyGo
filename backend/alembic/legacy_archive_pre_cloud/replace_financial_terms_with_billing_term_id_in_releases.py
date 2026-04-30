"""replace_financial_terms_with_billing_term_id_in_releases

Revision ID: replace_financial_terms_releases
Revises: 0bfd96fd8268
Create Date: 2025-12-06 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'replace_financial_terms_releases'
down_revision = '0bfd96fd8268'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add billing_term_id column as nullable (releases don't require it)
    op.add_column('releases', sa.Column('billing_term_id', postgresql.UUID(as_uuid=True), nullable=True))
    
    # Optionally set default billing_term_id for existing releases
    # Use the billing_term_id from the associated engagement, or leave NULL
    op.execute("""
        UPDATE releases r
        SET billing_term_id = (
            SELECT billing_term_id 
            FROM engagements 
            WHERE id = r.engagement_id
        )
        WHERE billing_term_id IS NULL
    """)
    
    # Add foreign key constraint
    op.create_foreign_key(
        'fk_releases_billing_term_id',
        'releases', 'billing_terms',
        ['billing_term_id'], ['id']
    )
    
    # Add index
    op.create_index(op.f('ix_releases_billing_term_id'), 'releases', ['billing_term_id'], unique=False)
    
    # Drop the old financial_terms column
    op.drop_column('releases', 'financial_terms')


def downgrade() -> None:
    # Add back the financial_terms column
    op.add_column('releases', sa.Column('financial_terms', sa.String(length=500), nullable=True))
    
    # Migrate data back - set financial_terms to the name of the billing term
    op.execute("""
        UPDATE releases 
        SET financial_terms = (
            SELECT name FROM billing_terms WHERE billing_terms.id = releases.billing_term_id
        )
        WHERE billing_term_id IS NOT NULL
    """)
    
    # Remove index and foreign key
    op.drop_index(op.f('ix_releases_billing_term_id'), table_name='releases')
    op.drop_constraint('fk_releases_billing_term_id', 'releases', type_='foreignkey')
    
    # Remove billing_term_id column
    op.drop_column('releases', 'billing_term_id')









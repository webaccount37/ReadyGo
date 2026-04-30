"""add_billing_term_id_to_engagements

Revision ID: dfb224dce0b8
Revises: a4ef08adf0e0
Create Date: 2025-12-06 04:23:22.982549

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'dfb224dce0b8'
down_revision = 'a4ef08adf0e0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add billing_term_id column as nullable first
    op.add_column('engagements', sa.Column('billing_term_id', postgresql.UUID(as_uuid=True), nullable=True))
    
    # Set default billing_term_id for existing engagements
    # Use the billing_term_id from the associated account, or the first billing_term if no account
    op.execute("""
        UPDATE engagements e
        SET billing_term_id = COALESCE(
            (SELECT billing_term_id FROM accounts WHERE id = e.account_id),
            (SELECT id FROM billing_terms LIMIT 1)
        )
        WHERE billing_term_id IS NULL
    """)
    
    # If there are still NULL values (no accounts and no billing_terms), create a default
    # But first check if we have any billing_terms at all
    op.execute("""
        DO $$
        DECLARE
            default_billing_term_id UUID;
        BEGIN
            -- Get the first billing_term_id or create one if none exists
            SELECT id INTO default_billing_term_id FROM billing_terms LIMIT 1;
            
            IF default_billing_term_id IS NULL THEN
                -- Create a default billing_term
                INSERT INTO billing_terms (id, name, description, net_days, created_at, updated_at)
                VALUES (gen_random_uuid(), 'Net 30', 'Standard Net 30 payment terms', 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING id INTO default_billing_term_id;
            END IF;
            
            -- Update any remaining NULL values
            UPDATE engagements
            SET billing_term_id = default_billing_term_id
            WHERE billing_term_id IS NULL;
        END $$;
    """)
    
    # Now make it NOT NULL
    op.alter_column('engagements', 'billing_term_id', nullable=False)
    
    # Add foreign key constraint
    op.create_foreign_key(
        'fk_engagements_billing_term_id',
        'engagements', 'billing_terms',
        ['billing_term_id'], ['id']
    )
    
    # Add index
    op.create_index(op.f('ix_engagements_billing_term_id'), 'engagements', ['billing_term_id'], unique=False)


def downgrade() -> None:
    # Remove index and foreign key
    op.drop_index(op.f('ix_engagements_billing_term_id'), table_name='engagements')
    op.drop_constraint('fk_engagements_billing_term_id', 'engagements', type_='foreignkey')
    
    # Remove column
    op.drop_column('engagements', 'billing_term_id')





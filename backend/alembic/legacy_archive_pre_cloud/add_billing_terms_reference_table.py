"""Add billing terms reference table

Revision ID: billing_terms_table
Revises: client_addr_contacts
Create Date: 2025-12-04

This migration:
1. Creates the billing_terms reference table with common billing terms
2. Adds billing_term_id foreign key to clients table
3. Migrates existing billing_terms string data to the new reference
4. Removes the old billing_terms string column
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid

# revision identifiers, used by Alembic.
revision = 'billing_terms_table'
down_revision = 'client_addr_contacts'
branch_labels = None
depends_on = None

# Pre-defined billing terms with UUIDs
BILLING_TERMS = [
    {"id": str(uuid.uuid4()), "code": "NET15", "name": "Net 15 Days", "description": "Payment due within 15 days of invoice date", "days_until_due": 15, "sort_order": 1},
    {"id": str(uuid.uuid4()), "code": "NET30", "name": "Net 30 Days", "description": "Payment due within 30 days of invoice date", "days_until_due": 30, "sort_order": 2},
    {"id": str(uuid.uuid4()), "code": "NET45", "name": "Net 45 Days", "description": "Payment due within 45 days of invoice date", "days_until_due": 45, "sort_order": 3},
    {"id": str(uuid.uuid4()), "code": "NET60", "name": "Net 60 Days", "description": "Payment due within 60 days of invoice date", "days_until_due": 60, "sort_order": 4},
    {"id": str(uuid.uuid4()), "code": "NET90", "name": "Net 90 Days", "description": "Payment due within 90 days of invoice date", "days_until_due": 90, "sort_order": 5},
    {"id": str(uuid.uuid4()), "code": "DUE_ON_RECEIPT", "name": "Due on Receipt", "description": "Payment due immediately upon receipt of invoice", "days_until_due": 0, "sort_order": 0},
    {"id": str(uuid.uuid4()), "code": "2_10_NET30", "name": "2/10 Net 30", "description": "2% discount if paid within 10 days, otherwise net 30", "days_until_due": 30, "sort_order": 6},
    {"id": str(uuid.uuid4()), "code": "EOM", "name": "End of Month", "description": "Payment due at the end of the month", "days_until_due": None, "sort_order": 7},
    {"id": str(uuid.uuid4()), "code": "MFI", "name": "Month Following Invoice", "description": "Payment due in the month following invoice date", "days_until_due": None, "sort_order": 8},
    {"id": str(uuid.uuid4()), "code": "PREPAID", "name": "Prepaid", "description": "Payment required before work begins", "days_until_due": 0, "sort_order": 9},
    {"id": str(uuid.uuid4()), "code": "COD", "name": "Cash on Delivery", "description": "Payment due upon delivery of goods or services", "days_until_due": 0, "sort_order": 10},
    {"id": str(uuid.uuid4()), "code": "MILESTONE", "name": "Milestone Based", "description": "Payment tied to project milestones", "days_until_due": None, "sort_order": 11},
]

# Get the default NET30 ID for migrating existing clients
DEFAULT_BILLING_TERM_ID = BILLING_TERMS[1]["id"]  # NET30


def upgrade() -> None:
    # 1. Create billing_terms table
    op.create_table('billing_terms',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('days_until_due', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_billing_terms_id'), 'billing_terms', ['id'], unique=False)
    op.create_index(op.f('ix_billing_terms_code'), 'billing_terms', ['code'], unique=True)
    
    # 2. Insert default billing terms
    billing_terms_table = sa.table('billing_terms',
        sa.column('id', sa.UUID()),
        sa.column('code', sa.String()),
        sa.column('name', sa.String()),
        sa.column('description', sa.String()),
        sa.column('days_until_due', sa.Integer()),
        sa.column('is_active', sa.Boolean()),
        sa.column('sort_order', sa.Integer()),
    )
    
    op.bulk_insert(billing_terms_table, BILLING_TERMS)
    
    # 3. Add billing_term_id column to clients (nullable initially)
    op.add_column('clients', sa.Column('billing_term_id', sa.UUID(), nullable=True))
    
    # 4. Set all existing clients to use NET30 as default
    op.execute(f"UPDATE clients SET billing_term_id = '{DEFAULT_BILLING_TERM_ID}'")
    
    # 5. Make billing_term_id NOT NULL and add foreign key
    op.alter_column('clients', 'billing_term_id', nullable=False)
    op.create_foreign_key(
        'fk_clients_billing_term_id',
        'clients', 'billing_terms',
        ['billing_term_id'], ['id']
    )
    op.create_index(op.f('ix_clients_billing_term_id'), 'clients', ['billing_term_id'], unique=False)
    
    # 6. Drop the old billing_terms string column
    op.drop_column('clients', 'billing_terms')


def downgrade() -> None:
    # 1. Add back the billing_terms string column
    op.add_column('clients', sa.Column('billing_terms', sa.String(length=500), nullable=True))
    
    # 2. Migrate data back - set billing_terms to the name of the billing term
    op.execute("""
        UPDATE clients 
        SET billing_terms = (
            SELECT name FROM billing_terms WHERE billing_terms.id = clients.billing_term_id
        )
    """)
    
    # 3. Make billing_terms NOT NULL
    op.alter_column('clients', 'billing_terms', nullable=False)
    
    # 4. Drop the foreign key and billing_term_id column
    op.drop_index(op.f('ix_clients_billing_term_id'), table_name='clients')
    op.drop_constraint('fk_clients_billing_term_id', 'clients', type_='foreignkey')
    op.drop_column('clients', 'billing_term_id')
    
    # 5. Drop the billing_terms table
    op.drop_index(op.f('ix_billing_terms_code'), table_name='billing_terms')
    op.drop_index(op.f('ix_billing_terms_id'), table_name='billing_terms')
    op.drop_table('billing_terms')


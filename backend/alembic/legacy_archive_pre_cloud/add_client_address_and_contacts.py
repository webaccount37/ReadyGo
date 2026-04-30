"""Add client address fields and contacts table

Revision ID: client_addr_contacts
Revises: make_employee_fields_required
Create Date: 2025-12-04

This migration:
1. Adds street_address and city columns to clients table
2. Makes billing_terms, street_address, city, region, country NOT NULL
3. Creates the contacts table with many-to-one relationship to clients
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'client_addr_contacts'
down_revision = 'make_employee_fields_required'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new columns to clients table
    op.add_column('clients', sa.Column('street_address', sa.String(length=255), nullable=True))
    op.add_column('clients', sa.Column('city', sa.String(length=100), nullable=True))
    
    # Update existing rows with default values before making columns NOT NULL
    op.execute("UPDATE clients SET street_address = 'Address Required' WHERE street_address IS NULL")
    op.execute("UPDATE clients SET city = 'City Required' WHERE city IS NULL")
    op.execute("UPDATE clients SET region = 'Region Required' WHERE region IS NULL OR region = ''")
    op.execute("UPDATE clients SET country = 'Country Required' WHERE country IS NULL OR country = ''")
    op.execute("UPDATE clients SET billing_terms = 'Net 30' WHERE billing_terms IS NULL OR billing_terms = ''")
    
    # Make columns NOT NULL
    op.alter_column('clients', 'street_address', nullable=False)
    op.alter_column('clients', 'city', nullable=False)
    op.alter_column('clients', 'region', nullable=False)
    op.alter_column('clients', 'country', nullable=False)
    op.alter_column('clients', 'billing_terms', nullable=False)
    
    # Create contacts table
    op.create_table('contacts',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('client_id', sa.UUID(), nullable=False),
        sa.Column('first_name', sa.String(length=100), nullable=False),
        sa.Column('last_name', sa.String(length=100), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('job_title', sa.String(length=100), nullable=True),
        sa.Column('is_primary', sa.String(length=10), nullable=False, server_default='false'),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_contacts_id'), 'contacts', ['id'], unique=False)
    op.create_index(op.f('ix_contacts_client_id'), 'contacts', ['client_id'], unique=False)


def downgrade() -> None:
    # Drop contacts table
    op.drop_index(op.f('ix_contacts_client_id'), table_name='contacts')
    op.drop_index(op.f('ix_contacts_id'), table_name='contacts')
    op.drop_table('contacts')
    
    # Make columns nullable again
    op.alter_column('clients', 'billing_terms', nullable=True)
    op.alter_column('clients', 'country', nullable=True)
    op.alter_column('clients', 'region', nullable=True)
    op.alter_column('clients', 'city', nullable=True)
    op.alter_column('clients', 'street_address', nullable=True)
    
    # Drop new columns
    op.drop_column('clients', 'city')
    op.drop_column('clients', 'street_address')


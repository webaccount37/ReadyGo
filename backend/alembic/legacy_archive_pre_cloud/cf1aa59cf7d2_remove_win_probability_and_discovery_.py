"""remove_win_probability_and_discovery_make_end_date_required

Revision ID: cf1aa59cf7d2
Revises: update_accounts_contacts
Create Date: 2026-01-06 21:06:57.250659

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'cf1aa59cf7d2'
down_revision = 'update_accounts_contacts'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop win_probability column if it exists
    op.drop_column('opportunities', 'win_probability', schema=None)
    
    # Make end_date NOT NULL (set default for NULL values first)
    op.execute("""
        UPDATE opportunities 
        SET end_date = start_date + INTERVAL '30 days'
        WHERE end_date IS NULL
    """)
    op.alter_column('opportunities', 'end_date',
                    existing_type=sa.Date(),
                    nullable=False)
    
    # Update the opportunity_status enum to remove 'discovery'
    # First, update any existing 'discovery' values to 'qualified'
    op.execute("""
        UPDATE opportunities 
        SET status = 'qualified'
        WHERE status = 'discovery'
    """)
    
    # Drop and recreate the enum type without 'discovery'
    # Split into separate execute calls for asyncpg compatibility
    # First drop the default constraint
    op.execute("ALTER TABLE opportunities ALTER COLUMN status DROP DEFAULT")
    # Create new enum type
    op.execute("""
        CREATE TYPE opportunitystatus_new AS ENUM ('qualified', 'proposal', 'negotiation', 'won', 'lost', 'cancelled')
    """)
    # Change column type
    op.execute("""
        ALTER TABLE opportunities 
            ALTER COLUMN status TYPE opportunitystatus_new 
            USING status::text::opportunitystatus_new
    """)
    # Drop old enum
    op.execute("DROP TYPE opportunitystatus")
    # Rename new enum
    op.execute("ALTER TYPE opportunitystatus_new RENAME TO opportunitystatus")
    # Restore default
    op.execute("ALTER TABLE opportunities ALTER COLUMN status SET DEFAULT 'qualified'::opportunitystatus")


def downgrade() -> None:
    # Recreate the enum type with 'discovery'
    # Split into separate execute calls for asyncpg compatibility
    op.execute("""
        CREATE TYPE opportunitystatus_new AS ENUM ('discovery', 'qualified', 'proposal', 'negotiation', 'won', 'lost', 'cancelled')
    """)
    op.execute("""
        ALTER TABLE opportunities 
            ALTER COLUMN status TYPE opportunitystatus_new 
            USING status::text::opportunitystatus_new
    """)
    op.execute("DROP TYPE opportunitystatus")
    op.execute("ALTER TYPE opportunitystatus_new RENAME TO opportunitystatus")
    
    # Make end_date nullable again
    op.alter_column('opportunities', 'end_date',
                    existing_type=sa.Date(),
                    nullable=True)
    
    # Re-add win_probability column
    op.add_column('opportunities', 
                  sa.Column('win_probability', 
                           sa.Enum('LOW', 'MEDIUM', 'HIGH', name='winprobability'),
                           nullable=True))













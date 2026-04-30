"""make_end_date_nullable_in_engagements

Revision ID: e98a09c1e5b4
Revises: dfb224dce0b8
Create Date: 2025-12-06 05:16:53.286672

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e98a09c1e5b4'
down_revision = 'dfb224dce0b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Make end_date nullable in engagements table
    op.alter_column('engagements', 'end_date',
                    existing_type=sa.Date(),
                    nullable=True)


def downgrade() -> None:
    # Revert end_date to NOT NULL (set default for NULL values first)
    op.execute("""
        UPDATE engagements 
        SET end_date = start_date + INTERVAL '30 days'
        WHERE end_date IS NULL
    """)
    op.alter_column('engagements', 'end_date',
                    existing_type=sa.Date(),
                    nullable=False)





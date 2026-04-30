"""Convert employee associations to association objects with required fields

Revision ID: a1b2c3d4e5f6
Revises: 7dbe7fb867e1
Create Date: 2025-12-04 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '7dbe7fb867e1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create deliverycenter enum type (if it doesn't exist)
    op.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE deliverycenter AS ENUM ('north-america', 'thailand', 'philippines', 'australia');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """))
    
    # Drop old association tables (handle if they don't exist)
    op.execute(sa.text("DROP TABLE IF EXISTS employee_releases CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS employee_projects CASCADE"))
    
    # Create new employee_projects table with association object structure
    op.create_table('employee_projects',
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('role_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('project_rate', sa.Float(), nullable=False),
        sa.Column('delivery_center', postgresql.ENUM('north-america', 'thailand', 'philippines', 'australia', name='deliverycenter', create_type=False), nullable=False),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ),
        sa.PrimaryKeyConstraint('employee_id', 'project_id')
    )
    
    # Create new employee_releases table with association object structure
    op.create_table('employee_releases',
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('release_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('role_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('project_rate', sa.Float(), nullable=False),
        sa.Column('delivery_center', postgresql.ENUM('north-america', 'thailand', 'philippines', 'australia', name='deliverycenter', create_type=False), nullable=False),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ),
        sa.ForeignKeyConstraint(['release_id'], ['releases.id'], ),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ),
        sa.PrimaryKeyConstraint('employee_id', 'release_id')
    )


def downgrade() -> None:
    # Drop new association tables
    op.drop_table('employee_releases')
    op.drop_table('employee_projects')
    
    # Recreate old simple association tables
    op.create_table('employee_projects',
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
        sa.PrimaryKeyConstraint('employee_id', 'project_id')
    )
    
    op.create_table('employee_releases',
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('release_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ),
        sa.ForeignKeyConstraint(['release_id'], ['releases.id'], ),
        sa.PrimaryKeyConstraint('employee_id', 'release_id')
    )
    
    # Drop deliverycenter enum type
    op.execute(sa.text("DROP TYPE IF EXISTS deliverycenter"))

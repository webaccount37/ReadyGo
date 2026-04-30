"""Convert delivery center enum to table

Revision ID: f1e2d3c4b5a6
Revises: a1b2c3d4e5f6
Create Date: 2025-12-04 01:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid as uuid_module

# revision identifiers, used by Alembic.
revision = 'f1e2d3c4b5a6'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create delivery_centers table
    op.create_table('delivery_centers',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, default=uuid.uuid4),
        sa.Column('name', sa.String(50), nullable=False),
        sa.Column('code', sa.String(50), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
        sa.UniqueConstraint('code')
    )
    op.create_index('ix_delivery_centers_code', 'delivery_centers', ['code'])
    op.create_index('ix_delivery_centers_name', 'delivery_centers', ['name'])
    
    # Insert initial delivery center data
    # Use deterministic UUIDs based on the code for consistency
    dc_uuids = {
        'north-america': str(uuid_module.uuid5(uuid_module.NAMESPACE_DNS, 'delivery-center.north-america')),
        'thailand': str(uuid_module.uuid5(uuid_module.NAMESPACE_DNS, 'delivery-center.thailand')),
        'philippines': str(uuid_module.uuid5(uuid_module.NAMESPACE_DNS, 'delivery-center.philippines')),
        'australia': str(uuid_module.uuid5(uuid_module.NAMESPACE_DNS, 'delivery-center.australia')),
    }
    op.execute(sa.text(f"""
        INSERT INTO delivery_centers (id, name, code) VALUES
        ('{dc_uuids["north-america"]}', 'North America', 'north-america'),
        ('{dc_uuids["thailand"]}', 'Thailand', 'thailand'),
        ('{dc_uuids["philippines"]}', 'Philippines', 'philippines'),
        ('{dc_uuids["australia"]}', 'Australia', 'australia')
    """))
    
    # Add delivery_center_id column to employee_projects
    op.add_column('employee_projects', 
        sa.Column('delivery_center_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    
    # Migrate data from enum to foreign key
    op.execute(sa.text("""
        UPDATE employee_projects ep
        SET delivery_center_id = dc.id
        FROM delivery_centers dc
        WHERE ep.delivery_center::text = dc.code
    """))
    
    # Make delivery_center_id NOT NULL
    op.alter_column('employee_projects', 'delivery_center_id', nullable=False)
    
    # Add foreign key constraint
    op.create_foreign_key(
        'fk_employee_projects_delivery_center_id',
        'employee_projects', 'delivery_centers',
        ['delivery_center_id'], ['id']
    )
    
    # Drop old delivery_center enum column
    op.drop_column('employee_projects', 'delivery_center')
    
    # Add delivery_center_id column to employee_releases
    op.add_column('employee_releases',
        sa.Column('delivery_center_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    
    # Migrate data from enum to foreign key
    op.execute(sa.text("""
        UPDATE employee_releases er
        SET delivery_center_id = dc.id
        FROM delivery_centers dc
        WHERE er.delivery_center::text = dc.code
    """))
    
    # Make delivery_center_id NOT NULL
    op.alter_column('employee_releases', 'delivery_center_id', nullable=False)
    
    # Add foreign key constraint
    op.create_foreign_key(
        'fk_employee_releases_delivery_center_id',
        'employee_releases', 'delivery_centers',
        ['delivery_center_id'], ['id']
    )
    
    # Drop old delivery_center enum column
    op.drop_column('employee_releases', 'delivery_center')
    
    # Drop the enum type (if no other tables use it)
    op.execute(sa.text("DROP TYPE IF EXISTS deliverycenter"))


def downgrade() -> None:
    # Recreate enum type
    op.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE deliverycenter AS ENUM ('north-america', 'thailand', 'philippines', 'australia');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """))
    
    # Add delivery_center enum column back to employee_projects
    op.add_column('employee_projects',
        sa.Column('delivery_center', postgresql.ENUM('north-america', 'thailand', 'philippines', 'australia', name='deliverycenter', create_type=False), nullable=True)
    )
    
    # Migrate data back from foreign key to enum
    op.execute(sa.text("""
        UPDATE employee_projects ep
        SET delivery_center = dc.code::deliverycenter
        FROM delivery_centers dc
        WHERE ep.delivery_center_id = dc.id
    """))
    
    # Make delivery_center NOT NULL
    op.alter_column('employee_projects', 'delivery_center', nullable=False)
    
    # Drop foreign key and column
    op.drop_constraint('fk_employee_projects_delivery_center_id', 'employee_projects', type_='foreignkey')
    op.drop_column('employee_projects', 'delivery_center_id')
    
    # Add delivery_center enum column back to employee_releases
    op.add_column('employee_releases',
        sa.Column('delivery_center', postgresql.ENUM('north-america', 'thailand', 'philippines', 'australia', name='deliverycenter', create_type=False), nullable=True)
    )
    
    # Migrate data back from foreign key to enum
    op.execute(sa.text("""
        UPDATE employee_releases er
        SET delivery_center = dc.code::deliverycenter
        FROM delivery_centers dc
        WHERE er.delivery_center_id = dc.id
    """))
    
    # Make delivery_center NOT NULL
    op.alter_column('employee_releases', 'delivery_center', nullable=False)
    
    # Drop foreign key and column
    op.drop_constraint('fk_employee_releases_delivery_center_id', 'employee_releases', type_='foreignkey')
    op.drop_column('employee_releases', 'delivery_center_id')
    
    # Drop delivery_centers table
    op.drop_table('delivery_centers')


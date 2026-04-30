"""Account contract documents (MSA, NDA, Other) stored in blob storage."""

from alembic import op
import sqlalchemy as sa

revision = "accounts_docs_001"
down_revision = "a003_discovery_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("msa_blob_container", sa.String(length=255), nullable=True))
    op.add_column("accounts", sa.Column("msa_blob_name", sa.String(length=512), nullable=True))
    op.add_column("accounts", sa.Column("msa_original_filename", sa.String(length=512), nullable=True))
    op.add_column("accounts", sa.Column("nda_blob_container", sa.String(length=255), nullable=True))
    op.add_column("accounts", sa.Column("nda_blob_name", sa.String(length=512), nullable=True))
    op.add_column("accounts", sa.Column("nda_original_filename", sa.String(length=512), nullable=True))
    op.add_column("accounts", sa.Column("other_blob_container", sa.String(length=255), nullable=True))
    op.add_column("accounts", sa.Column("other_blob_name", sa.String(length=512), nullable=True))
    op.add_column("accounts", sa.Column("other_original_filename", sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column("accounts", "other_original_filename")
    op.drop_column("accounts", "other_blob_name")
    op.drop_column("accounts", "other_blob_container")
    op.drop_column("accounts", "nda_original_filename")
    op.drop_column("accounts", "nda_blob_name")
    op.drop_column("accounts", "nda_blob_container")
    op.drop_column("accounts", "msa_original_filename")
    op.drop_column("accounts", "msa_blob_name")
    op.drop_column("accounts", "msa_blob_container")

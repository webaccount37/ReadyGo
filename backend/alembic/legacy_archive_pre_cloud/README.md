# Pre–cloud squash Alembic history

These migration scripts were removed from `alembic/versions/` when collapsing to a single `initial_schema` revision for clean local and Azure deployments. They are kept for forensic reference only; **do not** copy them back into `versions/` unless you are recovering a specific historical change.

The current schema is defined by SQLAlchemy models plus the single revision under `alembic/versions/`.

"""
Association tables for many-to-many relationships.
Note: employee_projects and employee_releases are now association objects (see association_models.py).
"""

from sqlalchemy import Table, Column, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base

# Engagement ↔ Role (many-to-many)
engagement_roles = Table(
    "engagement_roles",
    Base.metadata,
    Column("engagement_id", UUID(as_uuid=True), ForeignKey("engagements.id"), primary_key=True),
    Column("role_id", UUID(as_uuid=True), ForeignKey("roles.id"), primary_key=True),
)

# Release ↔ Role (many-to-many)
release_roles = Table(
    "release_roles",
    Base.metadata,
    Column("release_id", UUID(as_uuid=True), ForeignKey("releases.id"), primary_key=True),
    Column("role_id", UUID(as_uuid=True), ForeignKey("roles.id"), primary_key=True),
)



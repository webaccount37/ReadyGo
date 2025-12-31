"""
Health check response schemas.
"""

from pydantic import BaseModel
from typing import Dict, Any


class HealthResponse(BaseModel):
    """Health check response schema."""
    status: str
    uptime: str
    checks: Dict[str, Any] = {}












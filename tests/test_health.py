"""
Health endpoint tests using pytest-asyncio and httpx.AsyncClient.
"""

import pytest
from httpx import AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_health_endpoint():
    """Test the health check endpoint returns expected structure."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/v1/health")
    
    assert response.status_code == 200
    data = response.json()
    
    assert "status" in data
    assert "uptime" in data
    assert "checks" in data
    assert isinstance(data["checks"], dict)
    
    # Status should be "ok" or "degraded"
    assert data["status"] in ["ok", "degraded"]











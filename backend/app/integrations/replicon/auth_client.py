"""Replicon services authentication (access token)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.integrations.replicon.settings import RepliconImportSettings

logger = logging.getLogger(__name__)


def _extract_token_from_response(data: Any) -> str | None:
    """Parse token from CreateAccessToken2 JSON (shape varies by tenant)."""
    if data is None:
        return None
    if isinstance(data, str):
        return data.strip() or None
    if isinstance(data, dict):
        for key in ("accessToken", "token", "access_token", "value"):
            v = data.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
        # nested common shapes
        for nest in ("d", "result", "accessTokenReference"):
            sub = data.get(nest)
            if isinstance(sub, dict):
                t = _extract_token_from_response(sub)
                if t:
                    return t
            if isinstance(sub, str) and sub.strip():
                return sub.strip()
    return None


async def get_access_token(settings: RepliconImportSettings) -> str:
    """Return a bearer token, using REPLICON_ACCESS_TOKEN or CreateAccessToken2."""
    if settings.access_token:
        return settings.access_token

    url = f"{settings.services_base_url}/AuthenticationService1.svc/CreateAccessToken2"
    # Replicon JSON services accept object graphs; try common identity shapes.
    bodies: list[dict[str, Any]] = [
        {
            "identity": {
                "repliconIdentity": {
                    "companyName": settings.company_name,
                    "loginName": settings.login_name,
                    "password": settings.password,
                }
            },
            "lifetime": {"hours": 24, "minutes": 0, "seconds": 0},
            "description": "ReadyGo replicon import",
        },
        {
            "identity": {
                "companyKey": settings.company_name,
                "loginName": settings.login_name,
                "password": settings.password,
            },
            "lifetime": {"hours": 24, "minutes": 0, "seconds": 0},
            "description": "ReadyGo replicon import",
        },
    ]

    async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
        last_err: str | None = None
        for body in bodies:
            try:
                r = await client.post(url, json=body)
                if r.status_code >= 400:
                    last_err = r.text[:500]
                    continue
                data = r.json()
                token = _extract_token_from_response(data)
                if token:
                    return token
                last_err = str(data)[:500]
            except Exception as e:
                last_err = str(e)
                continue

    raise RuntimeError(
        f"Could not obtain Replicon access token from CreateAccessToken2. Last error: {last_err}"
    )

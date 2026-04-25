"""Replicon Analytics (BI) API: tables + async extracts + CSV download."""

from __future__ import annotations

import asyncio
import csv
import io
import logging
import random
import time
from typing import Any

import httpx

from app.integrations.replicon.auth_client import get_access_token
from app.integrations.replicon.settings import RepliconImportSettings

logger = logging.getLogger(__name__)


async def _sleep_backoff(attempt: int) -> None:
    base = min(60.0, 0.5 * (2**attempt))
    await asyncio.sleep(base + random.random() * 0.5)


class RepliconAnalyticsClient:
    def __init__(self, settings: RepliconImportSettings):
        self._settings = settings

    async def _headers(self) -> dict[str, str]:
        token = await get_access_token(self._settings)
        return {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    async def list_tables(self) -> list[dict[str, Any]]:
        url = f"{self._settings.analytics_base_url}/tables"
        async with httpx.AsyncClient(timeout=self._settings.http_timeout_seconds) as client:
            for attempt in range(6):
                r = await client.get(url, headers=await self._headers())
                if r.status_code == 429 or r.status_code >= 500:
                    await _sleep_backoff(attempt)
                    continue
                r.raise_for_status()
                data = r.json()
                if isinstance(data, list):
                    return data
                if isinstance(data, dict) and "tables" in data:
                    return list(data["tables"])
                if isinstance(data, dict) and "items" in data:
                    return list(data["items"])
                return [data]
        return []

    async def create_extract(self, table_uri: str, filter_expression: Any = None) -> str:
        """Start an extract; return extract id."""
        url = f"{self._settings.analytics_base_url}/extracts"
        body: dict[str, Any] = {"tableUri": table_uri}
        if filter_expression is not None:
            body["filterExpression"] = filter_expression
        async with httpx.AsyncClient(timeout=self._settings.http_timeout_seconds) as client:
            for attempt in range(6):
                r = await client.post(url, headers=await self._headers(), json=body)
                if r.status_code == 429 or r.status_code >= 500:
                    await _sleep_backoff(attempt)
                    continue
                r.raise_for_status()
                data = r.json()
                eid = _coerce_extract_id(data)
                if not eid:
                    raise RuntimeError(f"Unexpected create extract response: {data!r}")
                return eid
        raise RuntimeError("create_extract failed after retries")

    async def get_extract(self, extract_id: str) -> dict[str, Any]:
        url = f"{self._settings.analytics_base_url}/extracts/{extract_id}"
        async with httpx.AsyncClient(timeout=self._settings.http_timeout_seconds) as client:
            r = await client.get(url, headers=await self._headers())
            r.raise_for_status()
            data = r.json()
            return data if isinstance(data, dict) else {"raw": data}

    async def wait_for_extract_csv(self, extract_id: str) -> str:
        """Poll until extract is ready; return CSV text."""
        deadline = time.monotonic() + self._settings.extract_poll_max_seconds
        while time.monotonic() < deadline:
            info = await self.get_extract(extract_id)
            status = _extract_status(info).lower()
            if status in ("failed", "error"):
                raise RuntimeError(f"Extract {extract_id} failed: {info}")
            if status in ("complete", "completed", "success", "succeeded"):
                csv_text = _extract_csv_payload(info)
                if csv_text is not None:
                    return csv_text
                # Some tenants return a URL to download
                url = _extract_download_url(info)
                if url:
                    return await self._download_text(url)
            await asyncio.sleep(self._settings.extract_poll_interval_seconds)
        raise TimeoutError(f"Extract {extract_id} did not complete in time")

    async def _download_text(self, url: str) -> str:
        async with httpx.AsyncClient(timeout=self._settings.http_timeout_seconds) as client:
            r = await client.get(url, headers=await self._headers())
            r.raise_for_status()
            return r.text

    async def fetch_timesheet_csv(self, table_uri: str | None = None) -> str:
        """List tables if needed, create extract, wait for CSV."""
        uri = table_uri or self._settings.analytics_table_uri
        if not uri:
            tables = await self.list_tables()
            uri = _pick_time_table_uri(tables)
        if not uri:
            raise RuntimeError(
                "Could not determine analytics table URI. Set REPLICON_ANALYTICS_TABLE_URI "
                "or ensure GET /tables returns a time-entry style table."
            )
        eid = await self.create_extract(uri)
        return await self.wait_for_extract_csv(eid)


def _coerce_extract_id(data: Any) -> str | None:
    if isinstance(data, str) and data:
        return data
    if not isinstance(data, dict):
        return None
    for k in ("extractId", "id", "extract_id", "uri"):
        v = data.get(k)
        if isinstance(v, str) and v:
            return v.rsplit("/", 1)[-1]
    d = data.get("d")
    if isinstance(d, dict):
        return _coerce_extract_id(d)
    return None


def _extract_status(info: dict[str, Any]) -> str:
    for k in ("status", "extractStatus", "state", "lifecycleState"):
        v = info.get(k)
        if isinstance(v, str) and v:
            return v
    d = info.get("d")
    if isinstance(d, dict):
        return _extract_status(d)
    return ""


def _extract_csv_payload(info: dict[str, Any]) -> str | None:
    for k in ("csv", "csvData", "data", "payload", "content"):
        v = info.get(k)
        if isinstance(v, str) and v.strip():
            return v
    return None


def _extract_download_url(info: dict[str, Any]) -> str | None:
    for k in ("location", "downloadUrl", "url", "csvUrl", "href"):
        v = info.get(k)
        if isinstance(v, str) and v.startswith("http"):
            return v
    d = info.get("d")
    if isinstance(d, dict):
        return _extract_download_url(d)
    return None


def _pick_time_table_uri(tables: list[dict[str, Any]]) -> str | None:
    """Heuristic: pick a table whose name/uri suggests detailed time entries."""
    candidates: list[tuple[int, str]] = []
    for t in tables:
        if not isinstance(t, dict):
            continue
        uri = t.get("uri") or t.get("tableUri") or t.get("id") or ""
        name = (t.get("displayText") or t.get("name") or t.get("title") or "").lower()
        s = f"{uri} {name}".lower()
        score = 0
        if "time entry" in s or "timeentry" in s:
            score += 10
        if "timesheet" in s and "detail" in s:
            score += 8
        if "allocation" in s:
            score += 2
        if uri and score > 0:
            candidates.append((score, str(uri)))
    candidates.sort(key=lambda x: -x[0])
    return candidates[0][1] if candidates else None


def parse_csv_rows(csv_text: str) -> tuple[list[str], list[dict[str, str]]]:
    """Return (headers, rows as dicts with original header keys)."""
    f = io.StringIO(csv_text)
    reader = csv.DictReader(f)
    headers = reader.fieldnames or []
    rows = [{k: (v or "").strip() for k, v in row.items()} for row in reader]
    return list(headers), rows

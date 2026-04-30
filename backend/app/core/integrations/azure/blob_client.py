"""Azure Blob Storage client for expense receipts and other binary assets."""

from __future__ import annotations

import asyncio
import logging
from io import BytesIO
from typing import BinaryIO, List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

try:
    from azure.core.exceptions import ResourceExistsError
    from azure.storage.blob import BlobServiceClient, ContentSettings
except ImportError:  # pragma: no cover
    BlobServiceClient = None  # type: ignore
    ContentSettings = None  # type: ignore
    ResourceExistsError = Exception  # type: ignore

try:
    from azure.identity import DefaultAzureCredential
except ImportError:  # pragma: no cover
    DefaultAzureCredential = None  # type: ignore


def _build_blob_service_client():
    if not BlobServiceClient:
        raise RuntimeError("azure-storage-blob is not installed")
    name = (settings.AZURE_STORAGE_ACCOUNT_NAME or "").strip()
    if not name:
        raise ValueError("AZURE_STORAGE_ACCOUNT_NAME is not configured")
    key = (settings.AZURE_STORAGE_ACCOUNT_KEY or "").strip()
    if key:
        conn = (
            f"DefaultEndpointsProtocol=https;AccountName={name};"
            f"AccountKey={key};EndpointSuffix=core.windows.net"
        )
        return BlobServiceClient.from_connection_string(conn)
    if DefaultAzureCredential is None:
        raise ValueError("AZURE_STORAGE_ACCOUNT_KEY is empty and DefaultAzureCredential is unavailable")
    account_url = f"https://{name}.blob.core.windows.net"
    mi_client = (settings.AZURE_MANAGED_IDENTITY_CLIENT_ID or "").strip()
    cred_kwargs = {}
    if mi_client:
        cred_kwargs["managed_identity_client_id"] = mi_client
    return BlobServiceClient(account_url, credential=DefaultAzureCredential(**cred_kwargs))


class AzureBlobClient:
    """Upload/download/delete blobs in Azure Storage."""

    def __init__(self):
        self._client: Optional[BlobServiceClient] = None

    def _get_client(self) -> BlobServiceClient:
        if self._client is None:
            self._client = _build_blob_service_client()
        return self._client

    async def ensure_container(self, container_name: str) -> None:
        """Create container if missing (idempotent)."""

        def _run():
            svc = self._get_client()
            try:
                svc.create_container(container_name)
            except ResourceExistsError:
                pass

        await asyncio.to_thread(_run)

    async def upload_blob(
        self,
        container_name: str,
        blob_name: str,
        data: BinaryIO | bytes,
        content_type: Optional[str] = None,
    ) -> str:
        raw = data.read() if hasattr(data, "read") else data

        def _run():
            svc = self._get_client()
            cc = svc.get_container_client(container_name)
            blob = cc.get_blob_client(blob_name)
            kwargs = {}
            if content_type and ContentSettings:
                kwargs["content_settings"] = ContentSettings(content_type=content_type)
            blob.upload_blob(raw, overwrite=True, **kwargs)
            return blob.url

        return await asyncio.to_thread(_run)

    async def download_blob(self, container_name: str, blob_name: str) -> bytes:

        def _run():
            svc = self._get_client()
            blob = svc.get_container_client(container_name).get_blob_client(blob_name)
            return blob.download_blob().readall()

        return await asyncio.to_thread(_run)

    async def delete_blob(self, container_name: str, blob_name: str) -> None:

        def _run():
            svc = self._get_client()
            blob = svc.get_container_client(container_name).get_blob_client(blob_name)
            blob.delete_blob()

        await asyncio.to_thread(_run)

    async def list_blobs(self, container_name: str, prefix: Optional[str] = None) -> List[str]:

        def _run():
            svc = self._get_client()
            cc = svc.get_container_client(container_name)
            return [b.name for b in cc.list_blobs(name_starts_with=prefix)]

        return await asyncio.to_thread(_run)

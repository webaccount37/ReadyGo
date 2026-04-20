"""Upload/download/delete account contract documents (MSA, NDA, Other) in Azure Blob Storage."""

from __future__ import annotations

import re
from typing import Literal
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.integrations.azure.blob_client import AzureBlobClient
from app.db.repositories.account_repository import AccountRepository

DocType = Literal["msa", "nda", "other"]

MAX_DOC_BYTES = 25 * 1024 * 1024


def _safe_filename(name: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9._-]+", "_", name or "file")[:200]
    return base or "file"


class AccountDocumentService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.account_repo = AccountRepository(session)

    def _columns(self, doc_type: DocType) -> tuple[str, str, str]:
        return (
            f"{doc_type}_blob_container",
            f"{doc_type}_blob_name",
            f"{doc_type}_original_filename",
        )

    async def upload(
        self,
        account_id: UUID,
        doc_type: DocType,
        filename: str,
        content_type: str | None,
        data: bytes,
    ) -> None:
        if doc_type not in ("msa", "nda", "other"):
            raise ValueError("Invalid document type")
        if len(data) > MAX_DOC_BYTES:
            raise ValueError(f"File exceeds maximum size of {MAX_DOC_BYTES // (1024 * 1024)} MB")

        account = await self.account_repo.get(account_id)
        if not account:
            raise ValueError("Account not found")

        container_col, blob_col, orig_col = self._columns(doc_type)
        container = settings.AZURE_STORAGE_ACCOUNT_DOCUMENTS_CONTAINER.strip() or "account-documents"
        blob = AzureBlobClient()
        await blob.ensure_container(container)

        old_container = getattr(account, container_col, None)
        old_blob = getattr(account, blob_col, None)
        if old_container and old_blob:
            try:
                await blob.delete_blob(old_container, old_blob)
            except Exception:
                pass

        blob_name = f"{account_id}/{doc_type}/{uuid4()}_{_safe_filename(filename)}"
        await blob.upload_blob(container, blob_name, data, content_type=content_type)

        await self.account_repo.update(
            account_id,
            **{
                container_col: container,
                blob_col: blob_name,
                orig_col: (filename or "file")[:512],
            },
        )
        await self.session.commit()

    async def download(
        self,
        account_id: UUID,
        doc_type: DocType,
    ) -> tuple[bytes, str | None, str | None]:
        if doc_type not in ("msa", "nda", "other"):
            raise ValueError("Invalid document type")
        account = await self.account_repo.get(account_id)
        if not account:
            raise ValueError("Account not found")
        container_col, blob_col, orig_col = self._columns(doc_type)
        container = getattr(account, container_col, None)
        blob_name = getattr(account, blob_col, None)
        if not container or not blob_name:
            raise ValueError("No file uploaded for this slot")
        blob = AzureBlobClient()
        data = await blob.download_blob(container, blob_name)
        return data, None, getattr(account, orig_col, None)

    async def delete(self, account_id: UUID, doc_type: DocType) -> None:
        if doc_type not in ("msa", "nda", "other"):
            raise ValueError("Invalid document type")
        account = await self.account_repo.get(account_id)
        if not account:
            raise ValueError("Account not found")
        container_col, blob_col, orig_col = self._columns(doc_type)
        container = getattr(account, container_col, None)
        blob_name = getattr(account, blob_col, None)
        if container and blob_name:
            blob = AzureBlobClient()
            try:
                await blob.delete_blob(container, blob_name)
            except Exception:
                pass
        await self.account_repo.update(
            account_id,
            **{container_col: None, blob_col: None, orig_col: None},
        )
        await self.session.commit()

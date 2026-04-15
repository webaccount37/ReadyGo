"""Expense receipt upload/download backed by Azure Blob Storage."""

from __future__ import annotations

import re
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.integrations.azure.blob_client import AzureBlobClient
from app.db.repositories.expense_line_repository import ExpenseLineRepository
from app.db.repositories.expense_receipt_repository import ExpenseReceiptRepository
from app.models.timesheet import TimesheetStatus
from app.services.expense_approval_service import ExpenseApprovalService

MAX_RECEIPT_BYTES = 15 * 1024 * 1024


def _safe_filename(name: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9._-]+", "_", name or "file")[:200]
    return base or "file"


class ExpenseReceiptService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.line_repo = ExpenseLineRepository(session)
        self.receipt_repo = ExpenseReceiptRepository(session)

    async def _assert_can_edit_line(self, line_id: UUID, employee_id: UUID) -> None:
        line = await self.line_repo.get(line_id)
        if not line or not line.sheet:
            raise ValueError("Expense line not found")
        sheet = line.sheet
        if sheet.status not in (TimesheetStatus.NOT_SUBMITTED, TimesheetStatus.REOPENED):
            raise ValueError("Receipts cannot be modified in current sheet status")
        if sheet.employee_id == employee_id:
            return
        if not await ExpenseApprovalService(self.session)._can_approve_async(employee_id, sheet):
            raise ValueError("Not authorized to modify receipts for this line")

    async def _assert_can_view_line(self, line_id: UUID, employee_id: UUID) -> None:
        line = await self.line_repo.get(line_id)
        if not line or not line.sheet:
            raise ValueError("Expense line not found")
        sheet = line.sheet
        if sheet.employee_id == employee_id:
            return
        if not await ExpenseApprovalService(self.session)._can_approve_async(employee_id, sheet):
            raise ValueError("Not authorized to view this receipt")

    async def upload(
        self,
        line_id: UUID,
        employee_id: UUID,
        filename: str,
        content_type: str | None,
        data: bytes,
    ):
        if len(data) > MAX_RECEIPT_BYTES:
            raise ValueError(f"File exceeds maximum size of {MAX_RECEIPT_BYTES // (1024 * 1024)} MB")
        await self._assert_can_edit_line(line_id, employee_id)
        line = await self.line_repo.get(line_id)
        if not line:
            raise ValueError("Expense line not found")

        container = settings.AZURE_STORAGE_EXPENSE_RECEIPTS_CONTAINER.strip() or "expense-receipts"
        blob = AzureBlobClient()
        await blob.ensure_container(container)
        # Unique blob path: sheet/line/uuid_filename — original name is for display only (no collisions).
        blob_name = f"{line.expense_sheet_id}/{line_id}/{uuid4()}_{_safe_filename(filename)}"
        await blob.upload_blob(container, blob_name, data, content_type=content_type)

        rec = await self.receipt_repo.create(
            expense_line_id=line_id,
            blob_container=container,
            blob_name=blob_name,
            original_filename=filename[:512],
            content_type=(content_type or "")[:255] or None,
            size_bytes=len(data),
        )
        await self.session.commit()
        return rec

    async def download(self, line_id: UUID, receipt_id: UUID, employee_id: UUID) -> tuple[bytes, str | None, str | None]:
        await self._assert_can_view_line(line_id, employee_id)
        rec = await self.receipt_repo.get(receipt_id)
        if not rec or rec.expense_line_id != line_id:
            raise ValueError("Receipt not found")
        blob = AzureBlobClient()
        data = await blob.download_blob(rec.blob_container, rec.blob_name)
        return data, rec.content_type, rec.original_filename

    async def delete(self, line_id: UUID, receipt_id: UUID, employee_id: UUID) -> None:
        await self._assert_can_edit_line(line_id, employee_id)
        rec = await self.receipt_repo.get(receipt_id)
        if not rec or rec.expense_line_id != line_id:
            raise ValueError("Receipt not found")
        blob = AzureBlobClient()
        await blob.delete_blob(rec.blob_container, rec.blob_name)
        await self.receipt_repo.delete(receipt_id)
        await self.session.commit()

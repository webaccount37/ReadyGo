"""
Account API endpoints.
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
import io

from app.db.session import get_db
from app.controllers.account_controller import AccountController
from app.services.account_document_service import AccountDocumentService
from app.schemas.account import (
    AccountCreate,
    AccountUpdate,
    AccountResponse,
    AccountListResponse,
)

router = APIRouter()


@router.post("", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
async def create_account(
    account_data: AccountCreate,
    db: AsyncSession = Depends(get_db),
) -> AccountResponse:
    """Create a new account."""
    controller = AccountController(db)
    return await controller.create_account(account_data)


@router.get("", response_model=AccountListResponse)
async def list_accounts(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    region: str = Query(None),
    search: str = Query(None, description="Search company, industry, location, type"),
    sort_by: str = Query(
        None,
        description="company_name, industry, city, region, country, type, forecast_sum, plan_sum, actuals_sum",
    ),
    sort_order: str = Query("asc", description="asc or desc"),
    db: AsyncSession = Depends(get_db),
) -> AccountListResponse:
    """List accounts with optional filters."""
    controller = AccountController(db)
    return await controller.list_accounts(
        skip=skip,
        limit=limit,
        region=region,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.get("/{account_id}", response_model=AccountResponse)
async def get_account(
    account_id: UUID,
    include_projects: bool = Query(False),
    db: AsyncSession = Depends(get_db),
) -> AccountResponse:
    """Get account by ID."""
    controller = AccountController(db)
    account = await controller.get_account(account_id, include_projects)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )
    return account


@router.put("/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: UUID,
    account_data: AccountUpdate,
    db: AsyncSession = Depends(get_db),
) -> AccountResponse:
    """Update an account."""
    controller = AccountController(db)
    account = await controller.update_account(account_id, account_data)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )
    return account


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete an account."""
    controller = AccountController(db)
    deleted = await controller.delete_account(account_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )


def _doc_type(doc: str) -> str:
    d = (doc or "").lower()
    if d not in ("msa", "nda", "other"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid document type")
    return d


@router.post("/{account_id}/documents/{doc_type}", status_code=status.HTTP_204_NO_CONTENT)
async def upload_account_document(
    account_id: UUID,
    doc_type: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    doc = _doc_type(doc_type)
    data = await file.read()
    try:
        await AccountDocumentService(db).upload(
            account_id,
            doc,  # type: ignore[arg-type]
            file.filename or "file",
            file.content_type,
            data,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{account_id}/documents/{doc_type}/download")
async def download_account_document(
    account_id: UUID,
    doc_type: str,
    db: AsyncSession = Depends(get_db),
):
    doc = _doc_type(doc_type)
    try:
        data, content_type, filename = await AccountDocumentService(db).download(
            account_id,
            doc,  # type: ignore[arg-type]
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    headers = {}
    if filename:
        headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return StreamingResponse(
        io.BytesIO(data),
        media_type=content_type or "application/octet-stream",
        headers=headers,
    )


@router.delete("/{account_id}/documents/{doc_type}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account_document(
    account_id: UUID,
    doc_type: str,
    db: AsyncSession = Depends(get_db),
):
    doc = _doc_type(doc_type)
    try:
        await AccountDocumentService(db).delete(account_id, doc)  # type: ignore[arg-type]
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))








"""Tests: approver can approve via opportunity invoice DC (SALES / no engagement_id)."""

import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock

from app.services.timesheet_approval_service import TimesheetApprovalService


def test_can_approve_async_opportunity_id_only_uses_invoice_dc() -> None:
    approver_id = uuid.uuid4()
    opp_id = uuid.uuid4()

    entry_opp = MagicMock()
    entry_opp.engagement_id = None
    entry_opp.opportunity_id = opp_id

    timesheet = MagicMock()
    timesheet.employee_id = uuid.uuid4()
    timesheet.entries = [entry_opp]

    session = MagicMock()
    session.get = AsyncMock(return_value=MagicMock(delivery_center_id=None))

    svc = TimesheetApprovalService(session)
    svc._is_dc_approver_for_opportunity_async = AsyncMock(return_value=True)

    assert asyncio.run(svc._can_approve_async(approver_id, timesheet)) is True
    svc._is_dc_approver_for_opportunity_async.assert_awaited_once_with(approver_id, opp_id)


def test_can_approve_sync_opportunity_id_only() -> None:
    approver_id = uuid.uuid4()
    opp_id = uuid.uuid4()

    entry_opp = MagicMock()
    entry_opp.engagement_id = None
    entry_opp.opportunity_id = opp_id

    timesheet = MagicMock()
    timesheet.employee_id = None
    timesheet.entries = [entry_opp]

    session = MagicMock()
    svc = TimesheetApprovalService(session)
    svc._is_dc_approver_for_opportunity_sync = MagicMock(return_value=True)

    assert svc._can_approve(approver_id, timesheet) is True
    svc._is_dc_approver_for_opportunity_sync.assert_called_once_with(approver_id, opp_id)

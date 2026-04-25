"""Environment-driven settings for Replicon/time-export → Cortex import."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

_DEFAULT_EXPORT_NAME = "time_export_04252026.xlsx"


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


@dataclass(frozen=True)
class RepliconImportSettings:
    """Configuration loaded from environment variables."""

    timesheet_export_xlsx: Path | None
    services_base_url: str
    analytics_base_url: str
    company_name: str
    login_name: str
    password: str
    access_token: str | None
    analytics_table_uri: str | None
    approver_employee_id: UUID | None
    mapping_xlsx_path: Path
    cache_dir: Path
    engagement_created_log_path: Path
    state_json_path: Path
    row_status_output_xlsx: Path | None
    http_timeout_seconds: float
    extract_poll_interval_seconds: float
    extract_poll_max_seconds: float

    def uses_excel_timesheet_export(self) -> bool:
        """When True, read hours from ``timesheet_export_xlsx`` and skip Replicon HTTP APIs."""
        return self.timesheet_export_xlsx is not None and self.timesheet_export_xlsx.is_file()

    @classmethod
    def from_env(cls) -> RepliconImportSettings:
        repo_root = _repo_root()

        export: Path | None = None
        disable_excel = os.environ.get("REPLICON_DISABLE_EXCEL_EXPORT", "").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        explicit = (os.environ.get("REPLICON_TIMESHEET_EXPORT_XLSX") or "").strip()
        if explicit:
            p = Path(explicit.strip('"'))
            if not p.is_absolute():
                p = repo_root / p
            if not p.is_file():
                raise FileNotFoundError(
                    f"REPLICON_TIMESHEET_EXPORT_XLSX points to a missing file: {p}"
                )
            export = p
        elif not disable_excel:
            default_export = repo_root / "uploads" / _DEFAULT_EXPORT_NAME
            if default_export.is_file():
                export = default_export

        services = (os.environ.get("REPLICON_SERVICES_BASE_URL") or "").rstrip("/")
        analytics = (os.environ.get("REPLICON_ANALYTICS_BASE_URL") or "").rstrip("/")
        token = (os.environ.get("REPLICON_ACCESS_TOKEN") or "").strip() or None
        company = os.environ.get("REPLICON_COMPANY_NAME", "ReadyManagementSolutions").strip()
        login = os.environ.get("REPLICON_LOGIN_NAME", "").strip()
        password = os.environ.get("REPLICON_PASSWORD", "").strip()

        if not export:
            if not services:
                raise ValueError(
                    "Either place a timesheet export at "
                    f"uploads/{_DEFAULT_EXPORT_NAME} (or set REPLICON_TIMESHEET_EXPORT_XLSX), "
                    "or set REPLICON_SERVICES_BASE_URL for live Replicon Analytics."
                )
            if not analytics:
                analytics = services.replace("/services", "/analytics", 1)
                if "/analytics" not in analytics:
                    analytics = f"{services.rsplit('/', 1)[0]}/analytics"
            if not token and (not login or not password):
                raise ValueError(
                    "Set REPLICON_ACCESS_TOKEN or both REPLICON_LOGIN_NAME and REPLICON_PASSWORD "
                    "(not required when using REPLICON_TIMESHEET_EXPORT_XLSX / default export file)."
                )
        else:
            if not services:
                services = "https://unused.invalid"
            if not analytics:
                analytics = "https://unused.invalid"
            if not token:
                token = None
            if not login:
                login = ""
            if not password:
                password = ""

        approver_raw = os.environ.get("REPLICON_IMPORT_APPROVER_EMPLOYEE_ID", "").strip()
        approver: UUID | None = UUID(approver_raw) if approver_raw else None

        mapping = Path(
            os.environ.get(
                "REPLICON_MAPPING_XLSX",
                str(repo_root / "uploads" / "replicon_mapping.xlsx"),
            )
        )
        if not mapping.is_absolute():
            mapping = repo_root / mapping

        cache = Path(os.environ.get("REPLICON_CACHE_DIR", "uploads/replicon_cache"))
        if not cache.is_absolute():
            cache = repo_root / cache

        log_path = Path(
            os.environ.get(
                "REPLICON_ENGAGEMENT_CREATED_LOG",
                str(repo_root / "uploads" / "replicon_import_engagements_created.log"),
            )
        )
        if not log_path.is_absolute():
            log_path = repo_root / log_path

        state = Path(
            os.environ.get(
                "REPLICON_IMPORT_STATE_JSON",
                str(repo_root / "uploads" / "replicon_import_state.json"),
            )
        )
        if not state.is_absolute():
            state = repo_root / state

        row_status_out: Path | None = None
        rso = (os.environ.get("REPLICON_IMPORT_ROW_STATUS_XLSX") or "").strip()
        if rso:
            rsp = Path(rso.strip('"'))
            if not rsp.is_absolute():
                rsp = repo_root / rsp
            row_status_out = rsp

        table_uri = (os.environ.get("REPLICON_ANALYTICS_TABLE_URI") or "").strip() or None

        return cls(
            timesheet_export_xlsx=export,
            services_base_url=services,
            analytics_base_url=analytics,
            company_name=company,
            login_name=login,
            password=password,
            access_token=token,
            analytics_table_uri=table_uri,
            approver_employee_id=approver,
            mapping_xlsx_path=mapping,
            cache_dir=cache,
            engagement_created_log_path=log_path,
            state_json_path=state,
            row_status_output_xlsx=row_status_out,
            http_timeout_seconds=float(os.environ.get("REPLICON_HTTP_TIMEOUT_SECONDS", "120")),
            extract_poll_interval_seconds=float(os.environ.get("REPLICON_EXTRACT_POLL_SECONDS", "5")),
            extract_poll_max_seconds=float(os.environ.get("REPLICON_EXTRACT_POLL_MAX_SECONDS", "3600")),
        )

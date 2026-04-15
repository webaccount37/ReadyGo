"""
Application configuration using Pydantic BaseSettings.
Loads environment variables and provides typed configuration.
"""

from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
import json

# backend/app/core/config.py -> parents[2] == backend/
_BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=str(_BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )
    
    # Project metadata
    PROJECT_NAME: str = "ReadyGo Consulting Platform"
    VERSION: str = "0.1.0"
    API_V1_PREFIX: str = "/api/v1"
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/readygo"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://frontend:3000",
    ]
    
    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS_ORIGINS from JSON string or list."""
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                # If not JSON, try comma-separated
                return [s.strip() for s in v.split(",") if s.strip()]
        return v
    
    # Azure credentials (placeholders)
    AZURE_STORAGE_ACCOUNT_NAME: str = ""
    AZURE_STORAGE_ACCOUNT_KEY: str = ""
    AZURE_STORAGE_EXPENSE_RECEIPTS_CONTAINER: str = "expense-receipts"
    AZURE_KEY_VAULT_URL: str = ""
    
    # Entra ID (Azure AD) SSO Configuration
    AZURE_TENANT_ID: str = ""
    AZURE_CLIENT_ID: str = ""
    AZURE_CLIENT_SECRET: str = ""
    # Optional PFX for SharePoint REST (_api) app-only calls (e.g. Quick Launch). Graph works with the
    # client secret above, but sharepoint.com/_api often rejects secret-based tokens; use a cert from Entra.
    AZURE_SP_REST_CLIENT_CERTIFICATE_PATH: str = ""
    AZURE_SP_REST_CLIENT_CERTIFICATE_PASSWORD: str = ""
    AZURE_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/callback"
    AZURE_AUTHORITY: str = "https://login.microsoftonline.com"
    AZURE_SCOPES: List[str] = ["User.Read"]
    
    # SharePoint / Microsoft Graph (opportunity document folders)
    SHAREPOINT_INTEGRATION_ENABLED: bool = False
    SHAREPOINT_HOSTNAME: str = "readymanagementsolutions.sharepoint.com"
    # Server-relative site path without leading slash (Graph: /sites/{hostname}:/{path})
    SHAREPOINT_SITE_PATH: str = "sites/ActiveProjects"
    # document_library = Pattern B: one new document library per opportunity (sibling to other libraries).
    #   You will NOT see it inside another library's "All Documents" view — use Site contents or the stored web URL.
    # folder_inside_library = Pattern A: one folder inside an existing library (match SHAREPOINT_LIBRARY_NAME to that library's title).
    SHAREPOINT_PROVISIONING_MODE: str = "document_library"
    # Used only when SHAREPOINT_PROVISIONING_MODE=folder_inside_library — must match the library's name (Graph drive name), e.g. "Internal Projects (US)"
    SHAREPOINT_LIBRARY_NAME: str = "Documents"
    # Optional folder path inside that library (no leading slash)
    SHAREPOINT_PROJECTS_PARENT_PATH: str = ""
    # When reprovisioning changes SharePoint location to a different drive (e.g. Documents folder →
    # project library), migrate items from the old folder into the new library root.
    # none = disabled (default). move = single location. copy = duplicate into new library, leave originals.
    SHAREPOINT_FOLDER_MIGRATION_MODE: str = "none"
    # After creating/linking a document library (Pattern B), add a left-nav link via SharePoint REST (not Graph).
    SHAREPOINT_ADD_LIBRARY_TO_QUICK_LAUNCH: bool = True
    # After a new Quick Launch link is added, reorder nav (Home first, Recycle Bin / Edit last, A–Z between).
    SHAREPOINT_QUICK_LAUNCH_ALPHABETIZE: bool = True

    @field_validator("AZURE_SCOPES", mode="before")
    @classmethod
    def parse_scopes(cls, v):
        """Parse AZURE_SCOPES from JSON string or list."""
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                # If not JSON, try comma-separated
                return [s.strip() for s in v.split(",") if s.strip()]
        return v
    
    # Observability
    OTEL_EXPORTER_OTLP_ENDPOINT: str = "http://localhost:4317"
    OTEL_SERVICE_NAME: str = "readygo-backend"
    OTEL_ENVIRONMENT: str = "development"
    
    # Rate limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_PER_MINUTE: int = 60
    
    # Security
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # Default: 24 hours (1440 minutes). Override with ACCESS_TOKEN_EXPIRE_MINUTES env var


settings = Settings()



"""
Application configuration using Pydantic BaseSettings.
Loads environment variables and provides typed configuration.
"""

from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List
import json


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
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
    AZURE_KEY_VAULT_URL: str = ""
    
    # Entra ID (Azure AD) SSO Configuration
    AZURE_TENANT_ID: str = ""
    AZURE_CLIENT_ID: str = ""
    AZURE_CLIENT_SECRET: str = ""
    AZURE_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/callback"
    AZURE_AUTHORITY: str = "https://login.microsoftonline.com"
    AZURE_SCOPES: List[str] = ["User.Read"]
    
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
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()



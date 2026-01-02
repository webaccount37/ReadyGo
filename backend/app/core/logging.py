"""
Structured logging setup with OpenTelemetry integration.
"""

import logging
import sys
from typing import Any

from app.core.config import settings


def setup_logging() -> None:
    """
    Configure structured logging with JSON formatter and OpenTelemetry integration.
    """
    # Configure root logger
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
        ],
    )
    
    # Set log levels for specific libraries
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("asyncpg").setLevel(logging.WARNING)
    
    # TODO: Integrate with OpenTelemetry exporter
    # from opentelemetry.instrumentation.logging import LoggingInstrumentor
    # LoggingInstrumentor().instrument()
    
    logger = logging.getLogger(__name__)
    logger.info("Logging configured", extra={"environment": settings.OTEL_ENVIRONMENT})


def get_logger(name: str) -> logging.Logger:
    """Get a logger instance for a module."""
    return logging.getLogger(name)













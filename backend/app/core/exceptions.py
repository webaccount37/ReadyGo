"""
Global exception handlers for the FastAPI application.
Serializes exceptions into structured logs and sends traces/metrics to observability backend.
"""

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import logging
from typing import Any

from app.core.integrations.observability import record_exception


logger = logging.getLogger(__name__)


class AppException(Exception):
    """Base application exception."""
    def __init__(self, message: str, status_code: int = 500, details: Any = None):
        self.message = message
        self.status_code = status_code
        self.details = details
        super().__init__(self.message)


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    """Handle custom application exceptions."""
    logger.error(
        f"Application exception: {exc.message}",
        extra={
            "status_code": exc.status_code,
            "path": request.url.path,
            "details": exc.details,
        },
    )
    
    # Record exception in observability system
    record_exception(exc, request)
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "message": exc.message,
                "details": exc.details,
                "path": request.url.path,
            }
        },
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Handle HTTP exceptions."""
    logger.warning(
        f"HTTP exception: {exc.detail}",
        extra={
            "status_code": exc.status_code,
            "path": request.url.path,
        },
    )
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "message": exc.detail,
                "status_code": exc.status_code,
                "path": request.url.path,
            }
        },
    )


def _serialize_validation_errors(errors: list) -> list:
    """Convert validation errors to JSON-serializable format."""
    serialized = []
    for error in errors:
        serialized_error = {}
        for key, value in error.items():
            if key == "ctx" and isinstance(value, dict):
                # Handle context which may contain non-serializable objects like ValueError
                serialized_ctx = {}
                for ctx_key, ctx_value in value.items():
                    if isinstance(ctx_value, Exception):
                        serialized_ctx[ctx_key] = str(ctx_value)
                    else:
                        serialized_ctx[ctx_key] = ctx_value
                serialized_error[key] = serialized_ctx
            elif isinstance(value, Exception):
                serialized_error[key] = str(value)
            else:
                serialized_error[key] = value
        serialized.append(serialized_error)
    return serialized


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handle request validation errors."""
    # Serialize errors to ensure they're JSON-compatible
    serialized_errors = _serialize_validation_errors(exc.errors())
    
    logger.warning(
        f"Validation error: {serialized_errors}",
        extra={
            "path": request.url.path,
            "errors": serialized_errors,
        },
    )
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "message": "Validation error",
                "details": serialized_errors,
                "path": request.url.path,
            }
        },
    )


async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected exceptions."""
    logger.exception(
        f"Unhandled exception: {str(exc)}",
        extra={
            "path": request.url.path,
            "exception_type": type(exc).__name__,
        },
    )
    
    # Record exception in observability system
    record_exception(exc, request)
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "message": "Internal server error",
                "path": request.url.path,
            }
        },
    )


def setup_exception_handlers(app: FastAPI) -> None:
    """Register all exception handlers with the FastAPI app."""
    app.add_exception_handler(AppException, app_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, general_exception_handler)




"""
FastAPI application entry point.
Assembles the app with routers, middleware, lifespan handlers, and exception handlers.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.db.session import init_db, close_db
from app.deps.di_container import Container, get_container
from app.core.integrations.observability import setup_observability


# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.
    Initializes DB, DI container, telemetry, and Redis client.
    """
    # Startup
    setup_logging()
    setup_observability()
    
    # Initialize database
    await init_db()
    
    # Initialize dependency injection container
    container = Container()
    container.config.from_dict({
        "database_url": settings.DATABASE_URL,
        "redis_url": settings.REDIS_URL,
    })
    # Wire modules that need DI (uncomment when needed)
    # container.wire(modules=[__name__, "app.api.v1.endpoints.health"])
    
    # Store container in app state for access in routes
    app.state.container = container
    
    # Initialize global container instance
    import app.deps.di_container as di_module
    di_module._container = container
    
    yield
    
    # Shutdown
    await close_db()
    # Cleanup telemetry, Redis connections, etc.
    # TODO: Add cleanup logic here


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        description="Professional consulting platform API",
        openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )
    
    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Rate limiting middleware
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    
    # Include API router
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)
    
    # Add root-level health endpoint for convenience
    from app.api.v1.endpoints.health import get_health
    from fastapi import Request
    
    @app.get("/health", response_model=None, include_in_schema=False)
    async def root_health(request: Request):
        """Root-level health check endpoint."""
        return await get_health(request)
    
    # Global exception handler
    from app.core.exceptions import setup_exception_handlers
    setup_exception_handlers(app)
    
    return app


app = create_app()

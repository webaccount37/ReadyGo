"""
Database session management with async SQLAlchemy 2.0.
Handles connection pooling and session lifecycle.
"""

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,
)
from typing import AsyncGenerator

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Global engine and sessionmaker
engine = None
async_session_maker: async_sessionmaker[AsyncSession] = None


def create_engine():
    """Create async SQLAlchemy engine with connection pooling."""
    global engine
    
    # Configure connection pool for async
    # For async engines, use pool_size and max_overflow directly, not poolclass
    pool_size = 5
    max_overflow = 10
    
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,  # Set to True for SQL query logging
        pool_size=pool_size,
        max_overflow=max_overflow,
        pool_pre_ping=True,  # Verify connections before using
    )
    
    logger.info(
        "Database engine created",
        extra={
            "pool_size": pool_size,
            "max_overflow": max_overflow,
        },
    )
    
    return engine


def create_sessionmaker():
    """Create async sessionmaker."""
    global async_session_maker
    
    if engine is None:
        create_engine()
    
    async_session_maker = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    logger.info("Sessionmaker created")
    return async_session_maker


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency for getting database session.
    Yields a session and ensures it's closed after use.
    """
    if async_session_maker is None:
        create_sessionmaker()
    
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Initialize database connection and create tables."""
    global engine, async_session_maker
    
    if engine is None:
        create_engine()
    
    if async_session_maker is None:
        create_sessionmaker()
    
    logger.info("Database initialized")


async def close_db() -> None:
    """Close database connections."""
    global engine
    
    if engine:
        await engine.dispose()
        logger.info("Database connections closed")



"""
Dependency injection container using dependency-injector.
Wires DB, services, repositories, and controllers.
"""

from dependency_injector import containers, providers

from app.db.session import async_session_maker
from app.services.health_service import HealthService
from app.services.user_service import UserService
from app.services.email_service import EmailService
from app.controllers.health_controller import HealthController


class Container(containers.DeclarativeContainer):
    """Dependency injection container."""
    
    # Configuration
    config = providers.Configuration()
    
    # Database session provider
    # Note: For async sessions, we use a factory that creates a new session per request
    db_session = providers.Factory(
        lambda: async_session_maker(),
    )
    
    # Services
    health_service = providers.Singleton(
        HealthService,
    )
    
    user_service = providers.Singleton(
        UserService,
    )
    
    email_service = providers.Singleton(
        EmailService,
    )
    
    # Controllers
    health_controller = providers.Factory(
        HealthController,
    )


# Global container instance
_container: Container = None


def get_container() -> Container:
    """Get the global dependency injection container."""
    global _container
    if _container is None:
        _container = Container()
        _container.config.from_dict({
            "database_url": "postgresql+asyncpg://postgres:postgres@localhost:5432/readygo",
            "redis_url": "redis://localhost:6379/0",
        })
    return _container

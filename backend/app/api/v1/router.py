"""
API v1 router that aggregates all endpoint routers.
All routes require authentication except health and auth endpoints.
"""

from fastapi import APIRouter, Depends
from app.api.v1.middleware import require_authentication

from app.api.v1.endpoints import (
    health,
    auth,
    auth_refresh,
    debug_auth,
    users,
    employees,
    opportunities,
    calendars,
    accounts,
    contacts,
    roles,
    billing_terms,
    delivery_centers,
    estimates,
    currency_rates,
    quotes,
)

api_router = APIRouter()

# Public routes (no authentication required)
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(auth_refresh.router, prefix="/auth", tags=["authentication"])
api_router.include_router(debug_auth.router, prefix="/debug", tags=["debug"])  # REMOVE IN PRODUCTION

# Protected routes (authentication required for all endpoints)
# Authentication is enforced via dependency injection at the router level
api_router.include_router(
    users.router,
    prefix="/users",
    tags=["users"],
    dependencies=[Depends(require_authentication)],
)
api_router.include_router(
    employees.router,
    prefix="/employees",
    tags=["employees"],
    dependencies=[Depends(require_authentication)],
)
api_router.include_router(
    opportunities.router,
    prefix="/opportunities",
    tags=["opportunities"],
    dependencies=[Depends(require_authentication)],
)
api_router.include_router(
    calendars.router,
    prefix="/calendars",
    tags=["calendars"],
    dependencies=[Depends(require_authentication)],
)
api_router.include_router(
    accounts.router,
    prefix="/accounts",
    tags=["accounts"],
    dependencies=[Depends(require_authentication)],
)
api_router.include_router(
    contacts.router,
    prefix="/contacts",
    tags=["contacts"],
    dependencies=[Depends(require_authentication)],
)
api_router.include_router(
    roles.router,
    prefix="/roles",
    tags=["roles"],
    dependencies=[Depends(require_authentication)],
)
api_router.include_router(
    billing_terms.router,
    prefix="/billing-terms",
    tags=["billing-terms"],
    dependencies=[Depends(require_authentication)],
)
api_router.include_router(
    delivery_centers.router,
    prefix="/delivery-centers",
    tags=["delivery-centers"],
    dependencies=[Depends(require_authentication)],
)
api_router.include_router(
    estimates.router,
    prefix="/estimates",
    tags=["estimates"],
    dependencies=[Depends(require_authentication)],
)
api_router.include_router(
    currency_rates.router,
    prefix="/currency-rates",
    tags=["currency-rates"],
    dependencies=[Depends(require_authentication)],
)
api_router.include_router(
    quotes.router,
    prefix="/quotes",
    tags=["quotes"],
    dependencies=[Depends(require_authentication)],
)



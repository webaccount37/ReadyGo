"""
API v1 router that aggregates all endpoint routers.
"""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    health,
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

api_router.include_router(health.router, tags=["health"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(employees.router, prefix="/employees", tags=["employees"])
api_router.include_router(opportunities.router, prefix="/opportunities", tags=["opportunities"])
api_router.include_router(calendars.router, prefix="/calendars", tags=["calendars"])
api_router.include_router(accounts.router, prefix="/accounts", tags=["accounts"])
api_router.include_router(contacts.router, prefix="/contacts", tags=["contacts"])
api_router.include_router(roles.router, prefix="/roles", tags=["roles"])
api_router.include_router(billing_terms.router, prefix="/billing-terms", tags=["billing-terms"])
api_router.include_router(delivery_centers.router, prefix="/delivery-centers", tags=["delivery-centers"])
api_router.include_router(estimates.router, prefix="/estimates", tags=["estimates"])
api_router.include_router(currency_rates.router, prefix="/currency-rates", tags=["currency-rates"])
api_router.include_router(quotes.router, prefix="/quotes", tags=["quotes"])



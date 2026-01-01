"""
Currency conversion utility.
Provides conversion rates from various currencies to USD.
Rates are retrieved from the database.
"""

from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.currency_rate import CurrencyRate

# Cache for currency rates to avoid repeated database queries
_currency_rates_cache: Optional[dict[str, float]] = None


async def _load_currency_rates_from_db(session: AsyncSession) -> dict[str, float]:
    """Load currency rates from database."""
    try:
        result = await session.execute(select(CurrencyRate))
        currency_rates = result.scalars().all()
        if not currency_rates:
            # Fallback to default rates if table exists but is empty
            return _get_default_rates()
        return {cr.currency_code.upper(): cr.rate_to_usd for cr in currency_rates}
    except Exception:
        # Table doesn't exist yet - return default rates
        return _get_default_rates()


def _get_default_rates() -> dict[str, float]:
    """Get default currency rates as fallback."""
    return {
        "USD": 1.0,
        "PHP": 50.0,
        "VND": 24000.0,
        "THB": 35.0,
        "EUR": 0.85,
        "GBP": 0.75,
        "AUD": 1.35,
        "SGD": 1.35,
        "JPY": 110.0,
        "CNY": 6.5,
    }


async def _get_currency_rates(session: AsyncSession, use_cache: bool = True) -> dict[str, float]:
    """
    Get currency rates, using cache if available.
    
    Args:
        session: Database session
        use_cache: Whether to use cached rates (default: True)
        
    Returns:
        Dictionary mapping currency codes to rates
    """
    global _currency_rates_cache
    
    if use_cache and _currency_rates_cache is not None:
        return _currency_rates_cache
    
    rates = await _load_currency_rates_from_db(session)
    _currency_rates_cache = rates
    return rates


def clear_currency_rates_cache():
    """Clear the currency rates cache. Call this after updating rates."""
    global _currency_rates_cache
    _currency_rates_cache = None


async def get_conversion_rate_to_usd(currency: str, session: AsyncSession, use_cache: bool = True) -> float:
    """
    Get the conversion rate from a currency to USD.
    
    Args:
        currency: Currency code (e.g., "USD", "EUR")
        session: Database session
        use_cache: Whether to use cached rates (default: True)
        
    Returns:
        Conversion rate (how many units of currency = 1 USD)
    """
    currency_upper = currency.upper()
    rates = await _get_currency_rates(session, use_cache=use_cache)
    return rates.get(currency_upper, 1.0)


async def convert_to_usd(amount: float, from_currency: str, session: AsyncSession, use_cache: bool = True) -> float:
    """
    Convert an amount from a currency to USD.
    
    Args:
        amount: Amount in the source currency
        from_currency: Source currency code
        session: Database session
        use_cache: Whether to use cached rates (default: True)
        
    Returns:
        Amount in USD
    """
    if from_currency.upper() == "USD":
        return amount
    
    rate = await get_conversion_rate_to_usd(from_currency, session, use_cache)
    # If rate is how many units = 1 USD, then amount / rate = USD amount
    return amount / rate


async def convert_currency(
    amount: float,
    from_currency: str,
    to_currency: str,
    session: AsyncSession,
    use_cache: bool = True,
) -> float:
    """
    Convert an amount from one currency to another.
    
    Args:
        amount: Amount in the source currency
        from_currency: Source currency code
        to_currency: Target currency code
        session: Database session
        use_cache: Whether to use cached rates (default: True)
        
    Returns:
        Amount in target currency
    """
    if from_currency.upper() == to_currency.upper():
        return amount
    
    # Convert to USD first
    usd_amount = await convert_to_usd(amount, from_currency, session, use_cache)
    
    # Convert from USD to target currency
    if to_currency.upper() == "USD":
        return usd_amount
    
    to_rate = await get_conversion_rate_to_usd(to_currency, session, use_cache)
    # If rate is how many units = 1 USD, then USD amount * rate = target currency amount
    return usd_amount * to_rate









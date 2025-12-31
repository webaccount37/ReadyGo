"""
Currency conversion utility.
Provides conversion rates from various currencies to USD.
"""

# Simple conversion rate lookup table
# Rates are relative to USD (1 USD = 1.0)
# For other currencies, this shows how many units = 1 USD
# Example: 1 USD = 50 PHP, so PHP rate is 50.0
CURRENCY_RATES_TO_USD = {
    "USD": 1.0,
    "PHP": 50.0,  # Example rate - should be updated with real rates
    "VND": 24000.0,  # Example rate
    "THB": 35.0,  # Example rate
    "EUR": 0.85,  # Example rate
    "GBP": 0.75,  # Example rate
    "AUD": 1.35,  # Example rate
    "SGD": 1.35,  # Example rate
    "JPY": 110.0,  # Example rate
    "CNY": 6.5,  # Example rate
}


def get_conversion_rate_to_usd(currency: str) -> float:
    """
    Get the conversion rate from a currency to USD.
    
    Args:
        currency: Currency code (e.g., "USD", "EUR")
        
    Returns:
        Conversion rate (how many units of currency = 1 USD)
    """
    currency_upper = currency.upper()
    return CURRENCY_RATES_TO_USD.get(currency_upper, 1.0)


def convert_to_usd(amount: float, from_currency: str) -> float:
    """
    Convert an amount from a currency to USD.
    
    Args:
        amount: Amount in the source currency
        from_currency: Source currency code
        
    Returns:
        Amount in USD
    """
    if from_currency.upper() == "USD":
        return amount
    
    rate = get_conversion_rate_to_usd(from_currency)
    # If rate is how many units = 1 USD, then amount / rate = USD amount
    return amount / rate









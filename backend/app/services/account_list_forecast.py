"""Pure helpers for account list aggregation (kept import-light for tests)."""

from decimal import Decimal


def forecast_contribution_from_opportunity_row(raw) -> Decimal:
    """Forecast $ contribution for one opportunity row (list view rules)."""
    fv = raw.forecast_value_usd
    if fv is not None and Decimal(str(fv)) > 0:
        return Decimal(str(fv))
    if raw.deal_value_usd is not None and raw.probability is not None and raw.probability > 0:
        return Decimal(str(raw.deal_value_usd)) * (Decimal(str(raw.probability)) / 100)
    return Decimal("0")

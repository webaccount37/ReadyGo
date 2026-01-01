/**
 * Currency rate types matching backend schemas.
 */

export interface CurrencyRate {
  id: string;
  currency_code: string;
  rate_to_usd: number;
}

export interface CurrencyRateCreate {
  currency_code: string;
  rate_to_usd: number;
}

export interface CurrencyRateUpdate {
  rate_to_usd: number;
}

export type CurrencyRateResponse = CurrencyRate;

export interface CurrencyRateListResponse {
  items: CurrencyRateResponse[];
  total: number;
}


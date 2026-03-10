/**
 * Account types matching backend schemas.
 */

export type AccountType = "vendor" | "customer" | "partner" | "network";

export interface BillingTermInfo {
  id: string;
  code: string;
  name: string;
}

export interface Account {
  id: string;
  company_name: string;
  type: AccountType;
  industry?: string;
  street_address?: string;
  city?: string;
  region?: string;
  country: string;
  billing_term_id?: string;
  billing_term?: BillingTermInfo;
  default_currency: string;
  created_at: string;
  contact_count?: number;
  opportunities_count?: number;
  forecast_sum?: number;
  plan_sum?: number;
  actuals_sum?: number;
  has_locked_opportunities?: boolean;
}

export interface AccountCreate {
  company_name: string;
  type: AccountType;
  industry?: string;
  street_address?: string;
  city?: string;
  region?: string;
  country: string;
  billing_term_id?: string;
  default_currency?: string;
}

export interface AccountUpdate {
  company_name?: string;
  type?: AccountType;
  industry?: string;
  street_address?: string;
  city?: string;
  region?: string;
  country?: string;
  billing_term_id?: string;
  default_currency?: string;
}

export type AccountResponse = Account;

export interface AccountListResponse {
  items: AccountResponse[];
  total: number;
}










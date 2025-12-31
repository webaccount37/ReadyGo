/**
 * Account types matching backend schemas.
 */

export type AccountStatus = "active" | "inactive" | "prospect";

export interface BillingTermInfo {
  id: string;
  code: string;
  name: string;
}

export interface Account {
  id: string;
  company_name: string;
  industry?: string;
  street_address: string;
  city: string;
  region: string;
  country: string;
  status: AccountStatus;
  billing_term_id: string;
  billing_term?: BillingTermInfo;
  default_currency: string;
}

export interface AccountCreate {
  company_name: string;
  industry?: string;
  street_address: string;
  city: string;
  region: string;
  country: string;
  status?: AccountStatus;
  billing_term_id: string;
  default_currency?: string;
}

export interface AccountUpdate {
  company_name?: string;
  industry?: string;
  street_address?: string;
  city?: string;
  region?: string;
  country?: string;
  status?: AccountStatus;
  billing_term_id?: string;
  default_currency?: string;
}

export type AccountResponse = Account;

export interface AccountListResponse {
  items: AccountResponse[];
  total: number;
}









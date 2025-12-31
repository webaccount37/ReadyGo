/**
 * Billing Term types matching backend schemas.
 */

export interface BillingTerm {
  id: string;
  code: string;
  name: string;
  description?: string;
  days_until_due?: number;
  is_active: boolean;
  sort_order: number;
}

export interface BillingTermCreate {
  code: string;
  name: string;
  description?: string;
  days_until_due?: number;
  is_active?: boolean;
  sort_order?: number;
}

export interface BillingTermUpdate {
  code?: string;
  name?: string;
  description?: string;
  days_until_due?: number;
  is_active?: boolean;
  sort_order?: number;
}

export type BillingTermResponse = BillingTerm;

export interface BillingTermListResponse {
  items: BillingTermResponse[];
  total: number;
}









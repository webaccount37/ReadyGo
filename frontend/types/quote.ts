/**
 * Quote types matching backend schemas.
 */

export type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "INVALID";

export interface QuoteWeeklyHours {
  id: string;
  week_start_date: string;
  hours: string;
}

export interface QuotePhase {
  id: string;
  quote_id: string;
  name: string;
  start_date: string;
  end_date: string;
  color: string;
  row_order: number;
}

export interface QuoteLineItem {
  id: string;
  quote_id: string;
  role_rates_id: string;
  payable_center_id?: string;
  employee_id?: string;
  rate: string;
  cost: string;
  currency: string;
  start_date: string;
  end_date: string;
  row_order: number;
  billable: boolean;
  billable_expense_percentage?: string;
  role_name?: string;
  delivery_center_name?: string;
  payable_center_name?: string;
  employee_name?: string;
  weekly_hours?: QuoteWeeklyHours[];
}

export interface Quote {
  id: string;
  opportunity_id: string;
  estimate_id: string;
  quote_number: string;
  version: number;
  status: QuoteStatus;
  is_active: boolean;
  created_at: string;
  created_by?: string;
  created_by_name?: string;
  sent_date?: string;
  notes?: string;
  snapshot_data?: Record<string, unknown>;
  opportunity_name?: string;
  estimate_name?: string;
  line_items?: QuoteLineItem[];
  phases?: QuotePhase[];
}

export interface QuoteCreate {
  opportunity_id: string;
  estimate_id: string;
  notes?: string;
}

export interface QuoteUpdate {
  notes?: string;
}

export interface QuoteStatusUpdate {
  status: QuoteStatus;
  sent_date?: string;
}

export type QuoteResponse = Quote;
export type QuoteDetailResponse = Quote;
export type QuoteLineItemResponse = QuoteLineItem;
export type QuotePhaseResponse = QuotePhase;
export type QuoteWeeklyHoursResponse = QuoteWeeklyHours;

export interface QuoteListResponse {
  items: QuoteResponse[];
  total: number;
}


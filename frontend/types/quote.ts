/**
 * Quote types matching backend schemas.
 */

export type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "INVALID";
export type QuoteType = "FIXED_BID" | "TIME_MATERIALS";
export type PaymentTriggerType = "TIME" | "MILESTONE";
export type TimeType = "IMMEDIATE" | "MONTHLY";
export type RevenueType = "GROSS_REVENUE" | "GROSS_MARGIN";
export type RateBillingUnit = "HOURLY_ACTUALS" | "DAILY_ACTUALS" | "HOURLY_BLENDED" | "DAILY_BLENDED";
export type InvoiceDetail = "ROLE" | "EMPLOYEE" | "EMPLOYEE_WITH_DESCRIPTIONS";
export type CapType = "NONE" | "CAPPED" | "FLOOR";

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

export interface PaymentTrigger {
  id: string;
  quote_id: string;
  name: string;
  trigger_type: PaymentTriggerType;
  time_type?: TimeType;
  amount: string;
  num_installments?: number;
  milestone_date?: string;
  row_order: number;
}

export interface VariableCompensation {
  id: string;
  quote_id: string;
  employee_id: string;
  revenue_type: RevenueType;
  percentage_amount: string;
  employee_name?: string;
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
  display_name: string;
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
  quote_type?: QuoteType;
  target_amount?: string;
  rate_billing_unit?: RateBillingUnit;
  blended_rate_amount?: string;
  invoice_detail?: InvoiceDetail;
  cap_type?: CapType;
  cap_amount?: string;
  line_items?: QuoteLineItem[];
  phases?: QuotePhase[];
  payment_triggers?: PaymentTrigger[];
  variable_compensations?: VariableCompensation[];
}

export interface PaymentTriggerCreate {
  name: string;
  trigger_type: PaymentTriggerType;
  time_type?: TimeType;
  amount: string;
  num_installments?: number;
  milestone_date?: string;
  row_order?: number;
}

export interface VariableCompensationCreate {
  employee_id: string;
  revenue_type?: RevenueType;
  percentage_amount: string;
}

export interface QuoteCreate {
  opportunity_id: string;
  estimate_id: string;
  notes?: string;
  quote_type?: QuoteType;
  target_amount?: string;
  rate_billing_unit?: RateBillingUnit;
  blended_rate_amount?: string;
  invoice_detail?: InvoiceDetail;
  cap_type?: CapType;
  cap_amount?: string;
  payment_triggers?: PaymentTriggerCreate[];
  variable_compensations?: VariableCompensationCreate[];
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


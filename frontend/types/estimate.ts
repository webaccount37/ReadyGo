/**
 * Estimate types matching backend schemas.
 */

// EstimateStatus removed - status is no longer used

export type AutoFillPattern = "uniform" | "ramp_up" | "ramp_down" | "ramp_up_down" | "custom";

export interface EstimateWeeklyHours {
  id: string;
  week_start_date: string;
  hours: string;
}

export interface EstimatePhase {
  id: string;
  estimate_id: string;
  name: string;
  start_date: string;
  end_date: string;
  color: string;
  row_order: number;
}

export interface EstimateLineItem {
  id: string;
  estimate_id: string;
  role_id: string;
  role_name?: string;
  delivery_center_id: string;
  delivery_center_name?: string;
  employee_id?: string;
  employee_name?: string;
  rate: string;
  cost: string;
  currency: string;
  start_date: string;
  end_date: string;
  row_order: number;
  billable: boolean;
  billable_expense_percentage?: string;
  weekly_hours?: EstimateWeeklyHours[];
}

export interface Estimate {
  id: string;
  opportunity_id: string;
  opportunity_name?: string;
  name: string;
  currency?: string; // Derived from opportunity, optional in response
  active_version?: boolean;
  description?: string;
  phases?: EstimatePhase[];
  created_by?: string;
  created_by_name?: string;
  attributes?: Record<string, unknown>;
  line_items?: EstimateLineItem[];
  is_locked?: boolean;
  locked_by_quote_id?: string;
}

export interface EstimateCreate {
  opportunity_id: string;
  name: string;
  description?: string;
  active_version?: boolean;
  attributes?: Record<string, unknown>;
}

export interface EstimateUpdate {
  name?: string;
  description?: string;
  active_version?: boolean;
  attributes?: Record<string, unknown>;
}

export type EstimateResponse = Estimate;
export type EstimateDetailResponse = Estimate;
export type EstimateLineItemResponse = EstimateLineItem;

export interface EstimateListResponse {
  items: EstimateResponse[];
  total: number;
}

export interface EstimateLineItemCreate {
  role_id: string;
  delivery_center_id: string;
  employee_id?: string;
  rate?: string;
  cost?: string;
  currency?: string;
  start_date: string;
  end_date: string;
  row_order?: number;
  billable?: boolean;
  billable_expense_percentage?: string;
}

export interface EstimateLineItemUpdate {
  role_id?: string;
  delivery_center_id?: string;
  employee_id?: string | null; // null is used to clear the employee association
  rate?: string;
  cost?: string;
  currency?: string;
  start_date?: string;
  end_date?: string;
  row_order?: number;
  billable?: boolean;
  billable_expense_percentage?: string;
}

export interface AutoFillRequest {
  pattern: AutoFillPattern;
  hours_per_week?: string;
  start_hours?: string;
  end_hours?: string;
  interval_hours?: string;
  custom_hours?: Record<string, string>;
}

export interface WeeklyTotal {
  week_start_date: string;
  total_hours: string;
  total_cost: string;
  total_revenue: string;
}

export interface MonthlyTotal {
  year: number;
  month: number;
  total_hours: string;
  total_cost: string;
  total_revenue: string;
}

export interface RoleTotal {
  role_id: string;
  role_name: string;
  total_hours: string;
  total_cost: string;
  total_revenue: string;
}

export interface EstimateTotalsResponse {
  estimate_id: string;
  weekly_totals: WeeklyTotal[];
  monthly_totals: MonthlyTotal[];
  role_totals: RoleTotal[];
  overall_total_hours: string;
  overall_total_cost: string;
  overall_total_revenue: string;
}

export interface EstimateExcelImportResponse {
  created: number;
  updated: number;
  errors: string[];
}




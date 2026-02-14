/**
 * Engagement types for TypeScript.
 */

export interface EngagementPhase {
  id: string;
  engagement_id: string;
  name: string;
  start_date: string;
  end_date: string;
  color: string;
  row_order: number;
}

export interface EngagementWeeklyHours {
  id: string;
  week_start_date: string;
  hours: string;
}

export interface EngagementLineItem {
  id: string;
  engagement_id: string;
  role_rates_id: string;
  role_id?: string;
  delivery_center_id?: string;
  payable_center_id?: string;
  employee_id?: string;
  rate: string;
  cost: string;
  currency: string;
  start_date: string;
  end_date: string;
  row_order: number;
  billable: boolean;
  billable_expense_percentage: string;
  role_name?: string;
  delivery_center_name?: string;
  payable_center_name?: string;
  employee_name?: string;
  weekly_hours?: EngagementWeeklyHours[];
}

export interface ComparativeSummary {
  quote_amount?: string;
  estimate_cost?: string;
  estimate_revenue?: string;
  estimate_margin_amount?: string;
  estimate_margin_percentage?: string;
  resource_plan_revenue?: string;
  resource_plan_cost?: string;
  resource_plan_margin_amount?: string;
  resource_plan_margin_percentage?: string;
  revenue_deviation?: string;
  revenue_deviation_percentage?: string;
  margin_deviation?: string;
  currency: string;
}

export interface Engagement {
  id: string;
  quote_id: string;
  opportunity_id: string;
  account_id?: string;
  name: string;
  description?: string;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  attributes?: Record<string, unknown>;
  opportunity_name?: string;
  account_name?: string;
  quote_number?: string;
  quote_display_name?: string;
  line_items?: EngagementLineItem[];
  phases?: EngagementPhase[];
}

export interface EngagementTimesheetApprover {
  employee_id: string;
  employee_name?: string;
}

export interface EngagementDetailResponse extends Engagement {
  line_items: EngagementLineItem[];
  comparative_summary?: ComparativeSummary;
  timesheet_approvers?: EngagementTimesheetApprover[];
}

export interface EngagementCreate {
  quote_id: string;
  opportunity_id: string;
  name?: string;
  description?: string;
  attributes?: Record<string, unknown>;
}

export interface EngagementUpdate {
  description?: string;
  attributes?: Record<string, unknown>;
}

export interface EngagementPhaseCreate {
  name: string;
  start_date: string;
  end_date: string;
  color?: string;
  row_order?: number;
}

export interface EngagementPhaseUpdate {
  name?: string;
  start_date?: string;
  end_date?: string;
  color?: string;
  row_order?: number;
}

export interface EngagementLineItemCreate {
  role_rates_id?: string;
  role_id?: string;
  delivery_center_id?: string;
  payable_center_id?: string;
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

export interface EngagementLineItemUpdate {
  role_rates_id?: string;
  role_id?: string | null; // null is used to clear the role association
  delivery_center_id?: string;
  payable_center_id?: string;
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

export interface EngagementWeeklyHoursCreate {
  week_start_date: string;
  hours: string;
}

export type AutoFillPattern = "uniform" | "ramp_up" | "ramp_down" | "ramp_up_down" | "custom";

export interface AutoFillRequest {
  pattern: AutoFillPattern;
  hours_per_week?: string;
  start_hours?: string;
  end_hours?: string;
  interval_hours?: string;
  custom_hours?: Record<string, string>;
}

export interface EngagementExcelImportResponse {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

export interface EngagementListResponse {
  items: Engagement[];
  total: number;
}

// Type aliases for API responses
export type EngagementResponse = Engagement;
export type EngagementLineItemResponse = EngagementLineItem;

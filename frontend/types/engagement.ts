/**
 * Engagement types matching backend schemas.
 */

export type EngagementStatus = "discovery" | "qualified" | "proposal" | "negotiation" | "won" | "lost" | "cancelled";
export type EngagementType = "implementation" | "consulting" | "support";
export type WinProbability = "low" | "medium" | "high";
export type Accountability = "full_ownership" | "mgmt_accountable" | "mgmt_advisory" | "staff_aug_limited";
export type StrategicImportance = "critical" | "high" | "medium" | "low";

export interface EngagementEmployee {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role_id?: string;
  role_name?: string;
  start_date?: string;
  end_date?: string;
  project_rate?: number;
  delivery_center?: string;
}

export interface EngagementRelease {
  id: string;
  name: string;
  engagement_id: string;
  start_date?: string;
  end_date?: string;
  status: string;
  employees?: EngagementEmployee[];
}

export interface Engagement {
  id: string;
  name: string;
  parent_engagement_id?: string;
  account_id: string;
  account_name?: string;
  start_date: string;
  end_date?: string;
  status: EngagementStatus;
  billing_term_id: string;
  engagement_type: EngagementType;
  description?: string;
  utilization?: number;
  margin?: number;
  default_currency: string;
  delivery_center_id: string;
  engagement_owner_id?: string;
  invoice_customer: boolean;
  billable_expenses: boolean;
  attributes?: Record<string, unknown>;
  releases?: EngagementRelease[];
  employees?: EngagementEmployee[];
  // New deal/forecast fields
  probability?: number;
  win_probability?: WinProbability;
  accountability?: Accountability;
  strategic_importance?: StrategicImportance;
  deal_creation_date?: string;
  deal_value?: string;
  deal_value_usd?: string;
  close_date?: string;
  deal_length?: number;
  forecast_value?: string;
  forecast_value_usd?: string;
  project_start_month?: number;
  project_start_year?: number;
  project_duration_months?: number;
}

export interface EngagementCreate {
  name: string;
  parent_engagement_id?: string;
  account_id: string;
  start_date: string;
  end_date?: string;
  status?: EngagementStatus;
  billing_term_id: string;
  engagement_type?: EngagementType;
  description?: string;
  utilization?: number;
  margin?: number;
  default_currency?: string;
  delivery_center_id: string;
  engagement_owner_id?: string;
  invoice_customer?: boolean;
  billable_expenses?: boolean;
  attributes?: Record<string, unknown>;
  // New deal/forecast fields (most are read-only, but allow setting editable ones)
  win_probability?: WinProbability;
  accountability?: Accountability;
  strategic_importance?: StrategicImportance;
  deal_value?: string;
  project_start_month?: number;
  project_start_year?: number;
  project_duration_months?: number;
}

export interface EngagementUpdate {
  name?: string;
  parent_engagement_id?: string;
  account_id?: string;
  start_date?: string;
  end_date?: string | null;
  status?: EngagementStatus;
  billing_term_id?: string;
  engagement_type?: EngagementType;
  description?: string;
  utilization?: number;
  margin?: number;
  default_currency?: string;
  delivery_center_id?: string;
  engagement_owner_id?: string;
  invoice_customer?: boolean;
  billable_expenses?: boolean;
  attributes?: Record<string, unknown>;
  // New deal/forecast fields (most are read-only, but allow updates for editable ones)
  win_probability?: WinProbability;
  accountability?: Accountability;
  strategic_importance?: StrategicImportance;
  deal_value?: string;
  project_start_month?: number;
  project_start_year?: number;
  project_duration_months?: number;
}

export type EngagementResponse = Engagement;

export interface EngagementListResponse {
  items: EngagementResponse[];
  total: number;
}


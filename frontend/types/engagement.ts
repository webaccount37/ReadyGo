/**
 * Engagement types matching backend schemas.
 */

export type EngagementStatus = "planning" | "active" | "completed" | "on-hold";

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

export interface Engagement {
  id: string;
  name: string;
  opportunity_id: string;
  opportunity_name?: string;
  start_date?: string;
  end_date?: string;
  budget?: string;
  status: EngagementStatus;
  billing_term_id?: string;
  billing_term_name?: string;
  description?: string;
  default_currency: string;
  delivery_center_id?: string;
  delivery_center_name?: string;
  employees?: EngagementEmployee[];
  attributes?: Record<string, unknown>;
}

export interface EngagementCreate {
  name: string;
  opportunity_id: string;
  start_date?: string;
  end_date?: string;
  budget?: string;
  status?: EngagementStatus;
  billing_term_id?: string;
  description?: string;
  default_currency?: string;
  delivery_center_id?: string;
  attributes?: Record<string, unknown>;
}

export interface EngagementUpdate {
  name?: string;
  opportunity_id?: string;
  start_date?: string;
  end_date?: string;
  budget?: string;
  status?: EngagementStatus;
  billing_term_id?: string;
  description?: string;
  default_currency?: string;
  delivery_center_id?: string;
  attributes?: Record<string, unknown>;
}

export type EngagementResponse = Engagement;

export interface EngagementListResponse {
  items: EngagementResponse[];
  total: number;
}




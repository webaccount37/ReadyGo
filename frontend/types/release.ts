/**
 * Release types matching backend schemas.
 */

export type ReleaseStatus = "planning" | "active" | "completed" | "on-hold";

export interface ReleaseEmployee {
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

export interface Release {
  id: string;
  name: string;
  opportunity_id: string;
  opportunity_name?: string;
  start_date?: string;
  end_date?: string;
  budget?: string;
  status: ReleaseStatus;
  billing_term_id?: string;
  billing_term_name?: string;
  description?: string;
  default_currency: string;
  delivery_center_id?: string;
  delivery_center_name?: string;
  employees?: ReleaseEmployee[];
  attributes?: Record<string, unknown>;
}

export interface ReleaseCreate {
  name: string;
  opportunity_id: string;
  start_date?: string;
  end_date?: string;
  budget?: string;
  status?: ReleaseStatus;
  billing_term_id?: string;
  description?: string;
  default_currency?: string;
  delivery_center_id?: string;
  attributes?: Record<string, unknown>;
}

export interface ReleaseUpdate {
  name?: string;
  opportunity_id?: string;
  start_date?: string;
  end_date?: string;
  budget?: string;
  status?: ReleaseStatus;
  billing_term_id?: string;
  description?: string;
  default_currency?: string;
  delivery_center_id?: string;
  attributes?: Record<string, unknown>;
}

export type ReleaseResponse = Release;

export interface ReleaseListResponse {
  items: ReleaseResponse[];
  total: number;
}




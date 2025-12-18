/**
 * Role types matching backend schemas.
 */

export type RoleStatus = "active" | "inactive";

export interface RoleRate {
  id?: string;
  delivery_center_code: string;
  currency: string;
  internal_cost_rate: number;
  external_rate: number;
}

export interface Role {
  id: string;
  role_name: string;
  role_internal_cost_rate?: number;
  role_external_rate?: number;
  status: RoleStatus;
  default_currency: string;
  role_rates: RoleRate[];
}

export interface RoleCreate {
  role_name: string;
  role_internal_cost_rate?: number;
  role_external_rate?: number;
  status?: RoleStatus;
  default_currency?: string;
  role_rates: RoleRate[];
}

export interface RoleUpdate {
  role_name?: string;
  role_internal_cost_rate?: number;
  role_external_rate?: number;
  status?: RoleStatus;
  default_currency?: string;
  role_rates?: RoleRate[];
}

export type RoleResponse = Role;

export interface RoleListResponse {
  items: RoleResponse[];
  total: number;
}




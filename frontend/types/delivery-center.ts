/**
 * Delivery center types matching backend schemas.
 */

export interface EmployeeApproverSummary {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export interface DeliveryCenter {
  id: string;
  name: string;
  code: string;
  default_currency: string;
  approvers?: EmployeeApproverSummary[];
  opportunities_count?: number;
  employees_count?: number;
}

export interface DeliveryCenterCreate {
  name: string;
  code: string;
  default_currency: string;
}

export interface DeliveryCenterUpdate {
  name?: string;
  code?: string;
  default_currency?: string;
}

export interface DeliveryCenterApproverCreate {
  employee_id: string;
}

export interface DeliveryCenterApproverResponse {
  delivery_center_id: string;
  employee_id: string;
  employee: EmployeeApproverSummary;
}

export interface DeliveryCenterApproverListResponse {
  items: DeliveryCenterApproverResponse[];
  total: number;
}

export interface DeliveryCenterListResponse {
  items: DeliveryCenter[];
  total: number;
}

export type DeliveryCenterResponse = DeliveryCenter;

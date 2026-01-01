/**
 * Employee types matching backend schemas.
 */

export type EmployeeType = "full-time" | "contract";
export type EmployeeStatus = "active" | "inactive" | "on-leave";

export interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  employee_type: EmployeeType;
  status: EmployeeStatus;
  role_title?: string;
  role_id?: string;
  skills?: string[];
  internal_cost_rate?: number;
  internal_bill_rate?: number;
  external_bill_rate?: number;
  start_date?: string;
  end_date?: string;
  availability_calendar_id?: string;
  billable: boolean;
  default_currency?: string;
  timezone: string;
  delivery_center?: string;
  opportunities?: Array<{
    id: string;
    name: string;
    role_id?: string;
    role_name?: string;
    start_date?: string;
    end_date?: string;
    project_rate?: number;
    delivery_center?: string;
  }>;
  engagements?: Array<{
    id: string;
    name: string;
    opportunity_id: string;
    opportunity_name?: string;
    role_id?: string;
    role_name?: string;
    start_date?: string;
    end_date?: string;
    project_rate?: number;
    delivery_center?: string;
  }>;
}

export interface EmployeeCreate {
  first_name: string;
  last_name: string;
  email: string;
  employee_type: EmployeeType;
  status: EmployeeStatus;
  role_title?: string;
  role_id?: string;
  skills?: string[];
  internal_cost_rate: number;
  internal_bill_rate: number;
  external_bill_rate: number;
  start_date: string;
  end_date?: string;
  availability_calendar_id?: string;
  billable?: boolean;
  default_currency?: string;
  timezone?: string;
  delivery_center?: string;
}

export interface EmployeeUpdate {
  first_name?: string;
  last_name?: string;
  email?: string;
  employee_type?: EmployeeType;
  status?: EmployeeStatus;
  role_title?: string;
  role_id?: string;
  skills?: string[];
  internal_cost_rate?: number;
  internal_bill_rate?: number;
  external_bill_rate?: number;
  start_date?: string;
  end_date?: string;
  availability_calendar_id?: string;
  billable?: boolean;
  default_currency?: string;
  timezone?: string;
  delivery_center?: string;
}

export type EmployeeResponse = Employee;

export interface EmployeeListResponse {
  items: EmployeeResponse[];
  total: number;
}



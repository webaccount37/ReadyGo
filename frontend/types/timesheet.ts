/**
 * Timesheet types matching backend schemas.
 */

export type TimesheetStatus =
  | "NOT_SUBMITTED"
  | "SUBMITTED"
  | "APPROVED"
  | "REOPENED"
  | "INVOICED";

export type TimesheetEntryType = "ENGAGEMENT" | "SALES" | "HOLIDAY";

export interface TimesheetDayNote {
  id?: string;
  timesheet_entry_id?: string;
  day_of_week: number;
  note?: string;
}

export interface TimesheetEntryUpsert {
  id?: string;
  entry_type?: TimesheetEntryType;
  is_holiday_row?: boolean;
  account_id?: string;
  engagement_id?: string;
  opportunity_id?: string;
  engagement_line_item_id?: string;
  engagement_phase_id?: string;
  billable?: boolean;
  row_order?: number;
  sun_hours?: string | number;
  mon_hours?: string | number;
  tue_hours?: string | number;
  wed_hours?: string | number;
  thu_hours?: string | number;
  fri_hours?: string | number;
  sat_hours?: string | number;
  day_notes?: TimesheetDayNote[];
  account_name?: string;
  engagement_name?: string;
  opportunity_name?: string;
  requires_notes?: boolean;
}

export interface TimesheetEntry {
  id: string;
  timesheet_id: string;
  row_order: number;
  entry_type: string;
  is_holiday_row?: boolean;
  account_id: string;
  engagement_id?: string;
  opportunity_id?: string;
  engagement_line_item_id?: string;
  engagement_phase_id?: string;
  billable: boolean;
  sun_hours: string;
  mon_hours: string;
  tue_hours: string;
  wed_hours: string;
  thu_hours: string;
  fri_hours: string;
  sat_hours: string;
  total_hours: string;
  account_name?: string;
  engagement_name?: string;
  opportunity_name?: string;
  phase_name?: string;
  plan_hours?: string;
  day_notes?: TimesheetDayNote[];
  requires_notes?: boolean;
}

export interface TimesheetStatusHistoryEntry {
  id: string;
  timesheet_id: string;
  from_status?: string;
  to_status: string;
  changed_by_employee_id?: string;
  changed_by_name?: string;
  changed_at: string;
  note?: string;
}

export interface Timesheet {
  id: string;
  employee_id: string;
  week_start_date: string;
  status: string;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  total_hours: string;
  entries?: TimesheetEntry[];
  rejection_note?: string;
  status_history?: TimesheetStatusHistoryEntry[];
}

export interface RejectTimesheetRequest {
  note: string;
}

export interface TimesheetSubmitRequest {
  force?: boolean;
}

export interface TimesheetApprovalSummary {
  id: string;
  employee_id: string;
  employee_name: string;
  week_start_date: string;
  status: string;
  total_hours: string;
  engagement_names: string[];
}

export interface TimesheetApprovalListResponse {
  items: TimesheetApprovalSummary[];
  total: number;
}

export interface ManageableEmployeeSummary {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export interface ManageableEmployeesResponse {
  items: ManageableEmployeeSummary[];
  total: number;
}

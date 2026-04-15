export interface ExpenseReceipt {
  id: string;
  expense_line_id: string;
  original_filename?: string | null;
  content_type?: string | null;
  size_bytes: number;
  created_at: string;
}

/** Response from POST …/receipts (same shape as line-embedded receipts). */
export type ExpenseReceiptResponse = ExpenseReceipt;

export interface ExpenseLineUpsert {
  id?: string;
  entry_type?: "ENGAGEMENT" | "SALES";
  account_id?: string;
  engagement_id?: string;
  opportunity_id?: string;
  engagement_line_item_id?: string;
  engagement_phase_id?: string;
  billable?: boolean;
  reimburse?: boolean;
  date_incurred?: string | null;
  expense_category_id?: number | null;
  description?: string | null;
  line_currency?: string;
  amount?: string | number;
  row_order?: number;
  /** Populated from API / local state for display; omitted on save if backend strips extras. */
  account_name?: string | null;
  opportunity_name?: string | null;
  engagement_name?: string | null;
  category_name?: string | null;
  phase_name?: string | null;
}

export interface ExpenseLine {
  id: string;
  expense_sheet_id: string;
  row_order: number;
  entry_type: string;
  account_id?: string | null;
  engagement_id?: string | null;
  opportunity_id?: string | null;
  engagement_line_item_id?: string | null;
  engagement_phase_id?: string | null;
  billable: boolean;
  reimburse: boolean;
  date_incurred?: string | null;
  expense_category_id?: number | null;
  category_name?: string | null;
  description?: string | null;
  line_currency: string;
  amount: string | number;
  account_name?: string | null;
  engagement_name?: string | null;
  opportunity_name?: string | null;
  phase_name?: string | null;
  receipts?: ExpenseReceipt[];
}

export interface ExpenseSheet {
  id: string;
  employee_id: string;
  week_start_date: string;
  status: string;
  reimbursement_currency: string;
  created_at: string;
  updated_at: string;
  employee_name?: string | null;
  total_reimbursement: string | number;
  total_billable: string | number;
  total_amount: string | number;
  lines?: ExpenseLine[];
  rejection_note?: string | null;
  status_history?: ExpenseStatusHistory[];
}

export interface ExpenseStatusHistory {
  id: string;
  expense_sheet_id: string;
  from_status?: string | null;
  to_status: string;
  changed_by_employee_id?: string | null;
  changed_by_name?: string | null;
  changed_at: string;
  note?: string | null;
}

export interface ExpenseApprovalSummary {
  id: string;
  employee_id: string;
  employee_name: string;
  week_start_date: string;
  status: string;
  reimbursement_currency: string;
  total_amount: string | number;
  total_billable: string | number;
  total_reimbursement: string | number;
  labels: string[];
}

export interface ExpenseApprovalListResponse {
  items: ExpenseApprovalSummary[];
  total: number;
}

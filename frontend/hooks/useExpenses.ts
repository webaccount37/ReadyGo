/**
 * React Query hooks for expense sheets (parallel to timesheets; no incomplete-week APIs).
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from "@tanstack/react-query";
import { expensesApi } from "@/lib/api/expenses";
import type { ExpenseSheet, ExpenseLineUpsert, ExpenseApprovalListResponse } from "@/types/expense";
import type { ManageableEmployeesResponse } from "@/types/timesheet";

const QUERY_KEYS = {
  all: ["expenses"] as const,
  my: (week?: string) => [...QUERY_KEYS.all, "me", week] as const,
  weekStatuses: (params?: Record<string, unknown>) =>
    [...QUERY_KEYS.all, "me", "week-statuses", params] as const,
  detail: (id: string) => [...QUERY_KEYS.all, "detail", id] as const,
  pendingApprovals: (params?: Record<string, unknown>) =>
    [...QUERY_KEYS.all, "approvals", "pending", params] as const,
};

export function useMyExpenseSheet(
  week?: string,
  options?: Omit<UseQueryOptions<ExpenseSheet>, "queryKey" | "queryFn">
) {
  return useQuery<ExpenseSheet>({
    queryKey: QUERY_KEYS.my(week),
    queryFn: () => expensesApi.getMySheet(week),
    refetchOnMount: "always",
    ...options,
  });
}

export function useExpenseWeekStatuses(
  params?: { past_weeks?: number; future_weeks?: number },
  options?: Omit<UseQueryOptions<Record<string, string>>, "queryKey" | "queryFn">
) {
  return useQuery<Record<string, string>>({
    queryKey: QUERY_KEYS.weekStatuses(params),
    queryFn: () => expensesApi.getMyWeekStatuses(params),
    ...options,
  });
}

export function useExpenseSheet(
  sheetId: string,
  options?: Omit<UseQueryOptions<ExpenseSheet>, "queryKey" | "queryFn">
) {
  return useQuery<ExpenseSheet>({
    queryKey: QUERY_KEYS.detail(sheetId),
    queryFn: () => expensesApi.getSheet(sheetId),
    enabled: !!sheetId,
    ...options,
  });
}

export function useExpenseSheetByEmployee(
  employeeId: string | undefined,
  week: string | undefined,
  options?: Omit<UseQueryOptions<ExpenseSheet>, "queryKey" | "queryFn">
) {
  return useQuery<ExpenseSheet>({
    queryKey: [...QUERY_KEYS.all, "by-employee", employeeId, week] as const,
    queryFn: () => expensesApi.getByEmployee(employeeId!, week!),
    enabled: !!employeeId && !!week,
    ...options,
  });
}

export function useSaveExpenseEntries(
  options?: UseMutationOptions<
    ExpenseSheet,
    Error,
    { sheetId: string; entries: ExpenseLineUpsert[]; reimbursement_currency?: string }
  >
) {
  const queryClient = useQueryClient();
  return useMutation<
    ExpenseSheet,
    Error,
    { sheetId: string; entries: ExpenseLineUpsert[]; reimbursement_currency?: string }
  >({
    mutationFn: ({ sheetId, entries, reimbursement_currency }) =>
      expensesApi.saveEntries(sheetId, { entries, reimbursement_currency }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
    },
    ...options,
  });
}

export function useSubmitExpenseSheet(
  options?: UseMutationOptions<ExpenseSheet, Error, { sheetId: string }>
) {
  const queryClient = useQueryClient();
  return useMutation<ExpenseSheet, Error, { sheetId: string }>({
    mutationFn: ({ sheetId }) => expensesApi.submit(sheetId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
    },
    ...options,
  });
}

export function useApproveExpenseSheet(
  options?: UseMutationOptions<ExpenseSheet, Error, { sheetId: string }>
) {
  const queryClient = useQueryClient();
  return useMutation<ExpenseSheet, Error, { sheetId: string }>({
    mutationFn: ({ sheetId }) => expensesApi.approve(sheetId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
    },
    ...options,
  });
}

export function useRejectExpenseSheet(
  options?: UseMutationOptions<ExpenseSheet, Error, { sheetId: string; note: string }>
) {
  const queryClient = useQueryClient();
  return useMutation<ExpenseSheet, Error, { sheetId: string; note: string }>({
    mutationFn: ({ sheetId, note }) => expensesApi.reject(sheetId, note),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
    },
    ...options,
  });
}

export function useReopenExpenseSheet(
  options?: UseMutationOptions<ExpenseSheet, Error, { sheetId: string }>
) {
  const queryClient = useQueryClient();
  return useMutation<ExpenseSheet, Error, { sheetId: string }>({
    mutationFn: ({ sheetId }) => expensesApi.reopen(sheetId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
    },
    ...options,
  });
}

export function useApprovableExpenseSheets(
  params?: {
    status?: string;
    employee_id?: string;
    skip?: number;
    limit?: number;
  },
  options?: Omit<UseQueryOptions<ExpenseApprovalListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<ExpenseApprovalListResponse>({
    queryKey: [...QUERY_KEYS.all, "approvals", "list", params] as const,
    queryFn: () => expensesApi.listApprovable(params),
    ...options,
  });
}

export function useExpensePendingApprovals(
  params?: { skip?: number; limit?: number },
  options?: Omit<UseQueryOptions<ExpenseApprovalListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<ExpenseApprovalListResponse>({
    queryKey: QUERY_KEYS.pendingApprovals(params ?? {}),
    queryFn: () => expensesApi.listPending(params),
    ...options,
  });
}

export function useExpenseManageableEmployees(
  options?: Omit<UseQueryOptions<ManageableEmployeesResponse>, "queryKey" | "queryFn">
) {
  return useQuery<ManageableEmployeesResponse>({
    queryKey: [...QUERY_KEYS.all, "approvals", "employees"] as const,
    queryFn: () => expensesApi.listManageableEmployees(),
    ...options,
  });
}

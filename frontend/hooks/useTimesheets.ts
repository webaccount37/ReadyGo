/**
 * React Query hooks for timesheets.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from "@tanstack/react-query";
import { timesheetsApi } from "@/lib/api/timesheets";
import type {
  Timesheet,
  TimesheetEntryUpsert,
  TimesheetSubmitRequest,
  TimesheetApprovalListResponse,
} from "@/types/timesheet";

const QUERY_KEYS = {
  all: ["timesheets"] as const,
  my: (week?: string) => [...QUERY_KEYS.all, "me", week] as const,
  incompleteCount: () => [...QUERY_KEYS.all, "me", "incomplete-count"] as const,
  weekStatuses: (params?: Record<string, unknown>) =>
    [...QUERY_KEYS.all, "me", "week-statuses", params] as const,
  detail: (id: string) => [...QUERY_KEYS.all, "detail", id] as const,
  pendingApprovals: (params?: Record<string, unknown>) =>
    [...QUERY_KEYS.all, "approvals", "pending", params] as const,
};

/**
 * Get or create timesheet for current employee and week.
 */
export function useMyTimesheet(
  week?: string,
  options?: Omit<UseQueryOptions<Timesheet>, "queryKey" | "queryFn">
) {
  return useQuery<Timesheet>({
    queryKey: QUERY_KEYS.my(week),
    queryFn: () => timesheetsApi.getMyTimesheet(week),
    refetchOnMount: "always",
    ...options,
  });
}

/**
 * Get count of incomplete past weeks.
 */
export function useTimesheetIncompleteCount(
  options?: Omit<UseQueryOptions<{ count: number }>, "queryKey" | "queryFn">
) {
  return useQuery<{ count: number }>({
    queryKey: QUERY_KEYS.incompleteCount(),
    queryFn: () => timesheetsApi.getMyIncompleteCount(),
    ...options,
  });
}

/**
 * List incomplete past weeks (for backlog banner).
 */
export function useTimesheetIncompleteWeeks(
  options?: Omit<UseQueryOptions<{ count: number; weeks: string[] }>, "queryKey" | "queryFn">
) {
  return useQuery<{ count: number; weeks: string[] }>({
    queryKey: [...QUERY_KEYS.incompleteCount(), "weeks"] as const,
    queryFn: () => timesheetsApi.getMyIncompleteWeeks(52),
    ...options,
  });
}

/**
 * Get week statuses for carousel (Submitted, Approved, Invoiced, etc.).
 */
export function useWeekStatuses(
  params?: { past_weeks?: number; future_weeks?: number },
  options?: Omit<UseQueryOptions<Record<string, string>>, "queryKey" | "queryFn">
) {
  return useQuery<Record<string, string>>({
    queryKey: QUERY_KEYS.weekStatuses(params),
    queryFn: () => timesheetsApi.getMyWeekStatuses(params),
    ...options,
  });
}

/**
 * Get timesheet by ID.
 */
export function useTimesheet(
  timesheetId: string,
  options?: Omit<UseQueryOptions<Timesheet>, "queryKey" | "queryFn">
) {
  return useQuery<Timesheet>({
    queryKey: QUERY_KEYS.detail(timesheetId),
    queryFn: () => timesheetsApi.getTimesheet(timesheetId),
    enabled: !!timesheetId,
    ...options,
  });
}

/**
 * Get timesheet by employee and week (for approvers viewing another employee's timesheet).
 */
export function useTimesheetByEmployee(
  employeeId: string | undefined,
  week: string | undefined,
  options?: Omit<UseQueryOptions<Timesheet>, "queryKey" | "queryFn">
) {
  return useQuery<Timesheet>({
    queryKey: [...QUERY_KEYS.all, "by-employee", employeeId, week] as const,
    queryFn: () =>
      timesheetsApi.getTimesheetByEmployee(employeeId!, week!),
    enabled: !!employeeId && !!week,
    ...options,
  });
}

/**
 * Save timesheet entries.
 */
export function useSaveTimesheetEntries(
  options?: UseMutationOptions<
    Timesheet,
    Error,
    { timesheetId: string; entries: TimesheetEntryUpsert[] }
  >
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ timesheetId, entries }) =>
      timesheetsApi.saveEntries(timesheetId, entries),
    onSuccess: (_, { timesheetId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(timesheetId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
    },
    ...options,
  });
}

/**
 * Submit timesheet.
 */
export function useSubmitTimesheet(
  options?: UseMutationOptions<
    Timesheet,
    Error,
    { timesheetId: string; body?: TimesheetSubmitRequest }
  >
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ timesheetId, body }) =>
      timesheetsApi.submitTimesheet(timesheetId, body),
    onSuccess: (_, { timesheetId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(timesheetId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
      // Submission creates permanent lock - invalidate so Quote Unlock button hides
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
    ...options,
  });
}

/**
 * Approve timesheet.
 */
export function useApproveTimesheet(
  options?: UseMutationOptions<Timesheet, Error, string>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (timesheetId) => timesheetsApi.approveTimesheet(timesheetId),
    onSuccess: (_, timesheetId) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(timesheetId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pendingApprovals() });
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
    ...options,
  });
}

/**
 * Reject timesheet. Requires a note explaining the rejection.
 */
export function useRejectTimesheet(
  options?: UseMutationOptions<Timesheet, Error, { timesheetId: string; note: string }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ timesheetId, note }) =>
      timesheetsApi.rejectTimesheet(timesheetId, { note }),
    onSuccess: (_, { timesheetId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(timesheetId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pendingApprovals() });
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
    ...options,
  });
}

/**
 * Mass approve timesheets. Calls approve for each ID sequentially.
 */
export function useMassApproveTimesheets(
  options?: UseMutationOptions<void, Error, string[]>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (timesheetIds: string[]) => {
      for (const id of timesheetIds) {
        await timesheetsApi.approveTimesheet(id);
      }
    },
    onSuccess: (_, timesheetIds) => {
      timesheetIds.forEach((id) =>
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(id) })
      );
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pendingApprovals() });
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
    ...options,
  });
}

/**
 * Mass reject timesheets with the same note. Calls reject for each ID sequentially.
 */
export function useMassRejectTimesheets(
  options?: UseMutationOptions<void, Error, { timesheetIds: string[]; note: string }>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ timesheetIds, note }) => {
      for (const id of timesheetIds) {
        await timesheetsApi.rejectTimesheet(id, { note });
      }
    },
    onSuccess: (_, { timesheetIds }) => {
      timesheetIds.forEach((id) =>
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(id) })
      );
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pendingApprovals() });
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
    ...options,
  });
}

/**
 * Load defaults: reset timesheet to default state.
 */
export function useLoadDefaults(
  options?: UseMutationOptions<Timesheet, Error, string>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (timesheetId) => timesheetsApi.loadDefaults(timesheetId),
    onSuccess: (_, timesheetId) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(timesheetId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
    ...options,
  });
}

/**
 * Reopen timesheet.
 */
export function useReopenTimesheet(
  options?: UseMutationOptions<Timesheet, Error, string>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (timesheetId) => timesheetsApi.reopenTimesheet(timesheetId),
    onSuccess: (_, timesheetId) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(timesheetId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
    ...options,
  });
}

/**
 * List timesheets pending approval.
 */
export function useTimesheetPendingApprovals(
  params?: { skip?: number; limit?: number },
  options?: Omit<UseQueryOptions<TimesheetApprovalListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<TimesheetApprovalListResponse>({
    queryKey: QUERY_KEYS.pendingApprovals(params),
    queryFn: () => timesheetsApi.listPendingApprovals(params),
    ...options,
  });
}

/**
 * List timesheets the approver can manage, with optional status and employee filters.
 */
export function useApprovableTimesheets(
  params?: { status?: string; employee_id?: string; skip?: number; limit?: number },
  options?: Omit<UseQueryOptions<TimesheetApprovalListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<TimesheetApprovalListResponse>({
    queryKey: [...QUERY_KEYS.all, "approvals", "list", params] as const,
    queryFn: () => timesheetsApi.listApprovableTimesheets(params),
    ...options,
  });
}

/**
 * List employees the approver can manage.
 */
export function useManageableEmployees(
  options?: Omit<
    UseQueryOptions<{ items: { id: string; first_name: string; last_name: string; email: string }[]; total: number }>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery({
    queryKey: [...QUERY_KEYS.all, "approvals", "employees"] as const,
    queryFn: () => timesheetsApi.listManageableEmployees(),
    ...options,
  });
}

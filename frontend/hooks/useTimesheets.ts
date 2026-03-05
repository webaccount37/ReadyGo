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
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
    ...options,
  });
}

/**
 * Reject timesheet.
 */
export function useRejectTimesheet(
  options?: UseMutationOptions<Timesheet, Error, string>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (timesheetId) => timesheetsApi.rejectTimesheet(timesheetId),
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

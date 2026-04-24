/**
 * React Query hooks for engagements.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from "@tanstack/react-query";
import { engagementsApi } from "@/lib/api/engagements";
import type {
  Engagement,
  EngagementResponse,
  EngagementDetailResponse,
  EngagementUpdate,
  EngagementListResponse,
  EngagementLineItem,
  EngagementLineItemResponse,
  EngagementLineItemCreate,
  EngagementLineItemUpdate,
  EngagementWeeklyHoursCreate,
  EngagementPhase,
  EngagementPhaseCreate,
  EngagementPhaseUpdate,
  EngagementTimesheetApprover,
  EngagementExpenseApprover,
  EngagementExcelImportResponse,
  AutoFillRequest,
  ApprovedHoursByWeekResponse,
} from "@/types/engagement";

const QUERY_KEYS = {
  all: ["engagements"] as const,
  lists: () => [...QUERY_KEYS.all, "list"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...QUERY_KEYS.lists(), filters] as const,
  details: () => [...QUERY_KEYS.all, "detail"] as const,
  detail: (id: string) => [...QUERY_KEYS.details(), id] as const,
  phases: (engagementId: string) => [...QUERY_KEYS.all, "phases", engagementId] as const,
  approvedHoursByWeek: (engagementId: string) =>
    [...QUERY_KEYS.all, "approved-hours-by-week", engagementId] as const,
};

/**
 * Get all engagements with optional filters.
 */
export function useEngagements(
  params?: {
    skip?: number;
    limit?: number;
    opportunity_id?: string;
    quote_id?: string;
    employee_id?: string;
    week_start_date?: string;
    search?: string;
    sort_by?: string;
    sort_order?: "asc" | "desc";
  },
  options?: Omit<UseQueryOptions<EngagementListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<EngagementListResponse>({
    queryKey: QUERY_KEYS.list(params),
    queryFn: () => engagementsApi.getEngagements(params),
    ...options,
  });
}

/**
 * Get a single engagement by ID.
 */
export function useEngagement(
  engagementId: string,
  options?: Omit<UseQueryOptions<EngagementResponse>, "queryKey" | "queryFn">
) {
  return useQuery<EngagementResponse>({
    queryKey: QUERY_KEYS.detail(engagementId),
    queryFn: () => engagementsApi.getEngagement(engagementId),
    enabled: !!engagementId,
    ...options,
  });
}

/**
 * Get approved timesheet hours/revenue/cost per week for an engagement.
 */
export function useApprovedHoursByWeek(
  engagementId: string,
  options?: Omit<UseQueryOptions<ApprovedHoursByWeekResponse>, "queryKey" | "queryFn">
) {
  return useQuery<ApprovedHoursByWeekResponse>({
    queryKey: QUERY_KEYS.approvedHoursByWeek(engagementId),
    queryFn: () => engagementsApi.getApprovedHoursByWeek(engagementId),
    enabled: !!engagementId,
    ...options,
  });
}

/**
 * Get engagement detail with all line items and comparative summary.
 */
export function useEngagementDetail(
  engagementId: string,
  options?: Omit<UseQueryOptions<EngagementDetailResponse>, "queryKey" | "queryFn">
) {
  return useQuery<EngagementDetailResponse>({
    queryKey: QUERY_KEYS.detail(engagementId),
    queryFn: () => engagementsApi.getEngagementDetail(engagementId),
    enabled: !!engagementId,
    ...options,
  });
}

/**
 * Update an engagement.
 */
export function useUpdateEngagement(
  options?: UseMutationOptions<
    EngagementResponse,
    Error,
    { id: string; data: EngagementUpdate }
  >
) {
  const queryClient = useQueryClient();

  return useMutation<EngagementResponse, Error, { id: string; data: EngagementUpdate }>({
    mutationFn: ({ id, data }) => engagementsApi.updateEngagement(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    ...options,
  });
}

/**
 * Get phases for an engagement.
 */
export function usePhases(
  engagementId: string,
  options?: Omit<UseQueryOptions<EngagementPhase[]>, "queryKey" | "queryFn">
) {
  return useQuery<EngagementPhase[]>({
    queryKey: QUERY_KEYS.phases(engagementId),
    queryFn: () => engagementsApi.getPhases(engagementId),
    enabled: !!engagementId,
    ...options,
  });
}

/**
 * Create a new phase.
 */
export function useCreatePhase(
  options?: UseMutationOptions<
    EngagementPhase,
    Error,
    { engagementId: string; data: EngagementPhaseCreate }
  >
) {
  const queryClient = useQueryClient();

  return useMutation<EngagementPhase, Error, { engagementId: string; data: EngagementPhaseCreate }>({
    mutationFn: ({ engagementId, data }) => engagementsApi.createPhase(engagementId, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(variables.engagementId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.phases(variables.engagementId) });
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    ...options,
  });
}

/**
 * Update a phase.
 */
export function useUpdatePhase(
  options?: UseMutationOptions<
    EngagementPhase,
    Error,
    { engagementId: string; phaseId: string; data: EngagementPhaseUpdate }
  >
) {
  const queryClient = useQueryClient();

  return useMutation<
    EngagementPhase,
    Error,
    { engagementId: string; phaseId: string; data: EngagementPhaseUpdate }
  >({
    mutationFn: ({ engagementId, phaseId, data }) =>
      engagementsApi.updatePhase(engagementId, phaseId, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(variables.engagementId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.phases(variables.engagementId) });
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    ...options,
  });
}

/**
 * Delete a phase.
 */
export function useDeletePhase(
  options?: UseMutationOptions<void, Error, { engagementId: string; phaseId: string }>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { engagementId: string; phaseId: string }>({
    mutationFn: ({ engagementId, phaseId }) => engagementsApi.deletePhase(engagementId, phaseId),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(variables.engagementId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.phases(variables.engagementId) });
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    ...options,
  });
}

/**
 * Create a new line item.
 * Matches estimate useCreateLineItem: cancel in-flight detail query, cache-append with dedup by id, rollback on error.
 */
export function useCreateLineItem(
  options?: UseMutationOptions<
    EngagementLineItemResponse,
    Error,
    { engagementId: string; data: EngagementLineItemCreate },
    { previousDetail: EngagementDetailResponse | undefined }
  >
) {
  const queryClient = useQueryClient();

  return useMutation<
    EngagementLineItemResponse,
    Error,
    { engagementId: string; data: EngagementLineItemCreate },
    { previousDetail: EngagementDetailResponse | undefined }
  >({
    mutationFn: ({ engagementId, data }) => engagementsApi.createLineItem(engagementId, data),
    onMutate: async ({ engagementId }) => {
      await queryClient.cancelQueries({
        queryKey: QUERY_KEYS.detail(engagementId),
      });

      const previousDetail = queryClient.getQueryData<EngagementDetailResponse>(
        QUERY_KEYS.detail(engagementId)
      );

      return { previousDetail };
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData<EngagementDetailResponse>(
        QUERY_KEYS.detail(variables.engagementId),
        (old) => {
          if (!old) return old;
          // Merge by id (Map) so parallel onSuccess handlers cannot insert the same id twice.
          const merged = new Map(
            (old.line_items || []).map((item) => [item.id, item] as [string, EngagementLineItem])
          );
          merged.set(data.id, data);
          return {
            ...old,
            line_items: Array.from(merged.values()),
          };
        }
      );
      // Mark detail stale without immediate refetch — setQueryData above is authoritative for line_items; avoids racing draft reset.
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.detail(variables.engagementId),
        refetchType: "none",
      });
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    },
    onError: (err, variables, context) => {
      console.error("Create engagement line item error:", err);
      if (context?.previousDetail) {
        queryClient.setQueryData(
          QUERY_KEYS.detail(variables.engagementId),
          context.previousDetail
        );
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(variables.engagementId) });
    },
    ...options,
  });
}

/**
 * Update a line item.
 */
export function useUpdateLineItem(
  options?: UseMutationOptions<
    EngagementLineItemResponse,
    Error,
    { engagementId: string; lineItemId: string; data: EngagementLineItemUpdate }
  >
) {
  const queryClient = useQueryClient();

  return useMutation<
    EngagementLineItemResponse,
    Error,
    { engagementId: string; lineItemId: string; data: EngagementLineItemUpdate }
  >({
    mutationFn: ({ engagementId, lineItemId, data }) =>
      engagementsApi.updateLineItem(engagementId, lineItemId, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(variables.engagementId) });
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    ...options,
  });
}

/**
 * Delete a line item.
 */
export function useDeleteLineItem(
  options?: UseMutationOptions<void, Error, { engagementId: string; lineItemId: string }>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { engagementId: string; lineItemId: string }>({
    mutationFn: ({ engagementId, lineItemId }) =>
      engagementsApi.deleteLineItem(engagementId, lineItemId),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(variables.engagementId) });
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    },
    ...options,
  });
}

/**
 * Update weekly hours for a line item.
 */
export function useUpdateWeeklyHours(
  options?: UseMutationOptions<
    EngagementWeeklyHoursCreate[],
    Error,
    { engagementId: string; lineItemId: string; weeklyHours: EngagementWeeklyHoursCreate[] }
  >
) {
  const queryClient = useQueryClient();

  return useMutation<
    EngagementWeeklyHoursCreate[],
    Error,
    { engagementId: string; lineItemId: string; weeklyHours: EngagementWeeklyHoursCreate[] }
  >({
    mutationFn: ({ engagementId, lineItemId, weeklyHours }) =>
      engagementsApi.updateWeeklyHours(engagementId, lineItemId, weeklyHours),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(variables.engagementId) });
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    },
    ...options,
  });
}

/**
 * Export engagement Resource Plan to Excel.
 */
export function useExportEngagementExcel(
  options?: UseMutationOptions<Blob, Error, string>
) {
  return useMutation<Blob, Error, string>({
    mutationFn: (engagementId) => engagementsApi.exportToExcel(engagementId),
    ...options,
  });
}

/**
 * Import engagement Resource Plan from Excel.
 */
export function useImportEngagementExcel(
  options?: UseMutationOptions<
    EngagementExcelImportResponse,
    Error,
    { engagementId: string; file: File }
  >
) {
  const queryClient = useQueryClient();

  return useMutation<
    EngagementExcelImportResponse,
    Error,
    { engagementId: string; file: File }
  >({
    mutationFn: ({ engagementId, file }) => engagementsApi.importFromExcel(engagementId, file),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(variables.engagementId) });
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    },
    ...options,
  });
}

/**
 * Update timesheet approvers for an engagement.
 */
export function useUpdateTimesheetApprovers(
  options?: UseMutationOptions<
    EngagementTimesheetApprover[],
    Error,
    { engagementId: string; employeeIds: string[] }
  >
) {
  const queryClient = useQueryClient();

  return useMutation<
    EngagementTimesheetApprover[],
    Error,
    { engagementId: string; employeeIds: string[] }
  >({
    mutationFn: ({ engagementId, employeeIds }) =>
      engagementsApi.updateTimesheetApprovers(engagementId, employeeIds),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(variables.engagementId) });
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    ...options,
  });
}

/**
 * Update expense approvers for an engagement.
 */
export function useUpdateExpenseApprovers(
  options?: UseMutationOptions<
    EngagementExpenseApprover[],
    Error,
    { engagementId: string; employeeIds: string[] }
  >
) {
  const queryClient = useQueryClient();

  return useMutation<
    EngagementExpenseApprover[],
    Error,
    { engagementId: string; employeeIds: string[] }
  >({
    mutationFn: ({ engagementId, employeeIds }) =>
      engagementsApi.updateExpenseApprovers(engagementId, employeeIds),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(variables.engagementId) });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    ...options,
  });
}

/**
 * Auto-fill weekly hours for a line item.
 */
export function useAutoFillHours(
  options?: UseMutationOptions<
    EngagementLineItemResponse[],
    Error,
    { engagementId: string; lineItemId: string; data: AutoFillRequest }
  >
) {
  const queryClient = useQueryClient();

  return useMutation<
    EngagementLineItemResponse[],
    Error,
    { engagementId: string; lineItemId: string; data: AutoFillRequest }
  >({
    mutationFn: ({ engagementId, lineItemId, data }) =>
      engagementsApi.autoFillHours(engagementId, lineItemId, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(variables.engagementId) });
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    },
    ...options,
  });
}

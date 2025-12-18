/**
 * React Query hooks for engagements.
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
import { engagementsApi } from "@/lib/api/engagements";
import type {
  EngagementResponse,
  EngagementCreate,
  EngagementUpdate,
  EngagementListResponse,
} from "@/types/engagement";

const QUERY_KEYS = {
  all: ["engagements"] as const,
  lists: () => [...QUERY_KEYS.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...QUERY_KEYS.lists(), filters] as const,
  details: () => [...QUERY_KEYS.all, "detail"] as const,
  detail: (id: string, includeRelationships?: boolean) => [...QUERY_KEYS.details(), id, includeRelationships] as const,
};

/**
 * Get all engagements with optional filters.
 */
export function useEngagements(
  params?: {
    skip?: number;
    limit?: number;
    account_id?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
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
  includeRelationships = false,
  options?: Omit<UseQueryOptions<EngagementResponse>, "queryKey" | "queryFn">
) {
  return useQuery<EngagementResponse>({
    queryKey: QUERY_KEYS.detail(engagementId, includeRelationships),
    queryFn: () => engagementsApi.getEngagement(engagementId, includeRelationships),
    enabled: !!engagementId,
    ...options,
  });
}

/**
 * Create a new engagement.
 */
export function useCreateEngagement(
  options?: UseMutationOptions<EngagementResponse, Error, EngagementCreate>
) {
  const queryClient = useQueryClient();

  return useMutation<EngagementResponse, Error, EngagementCreate>({
    mutationFn: (data) => engagementsApi.createEngagement(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    ...options,
  });
}

/**
 * Update an engagement.
 */
export function useUpdateEngagement(
  options?: UseMutationOptions<EngagementResponse, Error, { id: string; data: EngagementUpdate }>
) {
  const queryClient = useQueryClient();

  return useMutation<EngagementResponse, Error, { id: string; data: EngagementUpdate }>({
    mutationFn: ({ id, data }) => engagementsApi.updateEngagement(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
    },
    ...options,
  });
}

/**
 * Delete an engagement.
 */
export function useDeleteEngagement(
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => engagementsApi.deleteEngagement(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.removeQueries({ queryKey: QUERY_KEYS.detail(id) });
    },
    ...options,
  });
}








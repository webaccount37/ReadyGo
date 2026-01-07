/**
 * React Query hooks for opportunities.
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
import { opportunitiesApi } from "@/lib/api/opportunities";
import type {
  OpportunityResponse,
  OpportunityCreate,
  OpportunityUpdate,
  OpportunityListResponse,
} from "@/types/opportunity";

const QUERY_KEYS = {
  all: ["opportunities"] as const,
  lists: () => [...QUERY_KEYS.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...QUERY_KEYS.lists(), filters] as const,
  details: () => [...QUERY_KEYS.all, "detail"] as const,
  detail: (id: string, includeRelationships?: boolean) => [...QUERY_KEYS.details(), id, includeRelationships] as const,
};

/**
 * Get all opportunities with optional filters.
 */
export function useOpportunities(
  params?: {
    skip?: number;
    limit?: number;
    account_id?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
  },
  options?: Omit<UseQueryOptions<OpportunityListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<OpportunityListResponse>({
    queryKey: QUERY_KEYS.list(params),
    queryFn: () => opportunitiesApi.getOpportunities(params),
    ...options,
  });
}

/**
 * Get a single opportunity by ID.
 */
export function useOpportunity(
  opportunityId: string,
  includeRelationships = false,
  options?: Omit<UseQueryOptions<OpportunityResponse>, "queryKey" | "queryFn">
) {
  return useQuery<OpportunityResponse>({
    queryKey: QUERY_KEYS.detail(opportunityId, includeRelationships),
    queryFn: () => opportunitiesApi.getOpportunity(opportunityId, includeRelationships),
    enabled: !!opportunityId,
    ...options,
  });
}

/**
 * Create a new opportunity.
 */
export function useCreateOpportunity(
  options?: UseMutationOptions<OpportunityResponse, Error, OpportunityCreate>
) {
  const queryClient = useQueryClient();

  return useMutation<OpportunityResponse, Error, OpportunityCreate>({
    mutationFn: (data) => opportunitiesApi.createOpportunity(data),
    onSuccess: () => {
      // Invalidate all opportunity queries
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
      // Invalidate accounts since new opportunity might affect account display
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    ...options,
  });
}

/**
 * Update an opportunity.
 */
export function useUpdateOpportunity(
  options?: UseMutationOptions<OpportunityResponse, Error, { id: string; data: OpportunityUpdate }>
) {
  const queryClient = useQueryClient();

  return useMutation<OpportunityResponse, Error, { id: string; data: OpportunityUpdate }>({
    mutationFn: ({ id, data }) => opportunitiesApi.updateOpportunity(id, data),
    onSuccess: (data) => {
      // Invalidate all opportunity queries
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
      // Invalidate related estimates and quotes
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      // Invalidate accounts since opportunity changes might affect account display
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    ...options,
  });
}

/**
 * Delete an opportunity.
 */
export function useDeleteOpportunity(
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => opportunitiesApi.deleteOpportunity(id),
    onSuccess: (_, id) => {
      // Invalidate all opportunity queries
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
      queryClient.removeQueries({ queryKey: QUERY_KEYS.detail(id) });
      // Invalidate related estimates and quotes
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      // Invalidate accounts
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    ...options,
  });
}



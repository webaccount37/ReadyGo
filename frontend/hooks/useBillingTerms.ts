/**
 * React Query hooks for billing terms.
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
import { billingTermsApi } from "@/lib/api/billing-terms";
import type {
  BillingTermResponse,
  BillingTermCreate,
  BillingTermUpdate,
  BillingTermListResponse,
} from "@/types/billing-term";

const QUERY_KEYS = {
  all: ["billingTerms"] as const,
  lists: () => [...QUERY_KEYS.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...QUERY_KEYS.lists(), filters] as const,
  details: () => [...QUERY_KEYS.all, "detail"] as const,
  detail: (id: string) => [...QUERY_KEYS.details(), id] as const,
};

/**
 * Get all billing terms.
 */
export function useBillingTerms(
  params?: {
    skip?: number;
    limit?: number;
    active_only?: boolean;
  },
  options?: Omit<UseQueryOptions<BillingTermListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<BillingTermListResponse>({
    queryKey: QUERY_KEYS.list(params),
    queryFn: () => billingTermsApi.getBillingTerms(params),
    ...options,
  });
}

/**
 * Get a single billing term by ID.
 */
export function useBillingTerm(
  billingTermId: string,
  options?: Omit<UseQueryOptions<BillingTermResponse>, "queryKey" | "queryFn">
) {
  return useQuery<BillingTermResponse>({
    queryKey: QUERY_KEYS.detail(billingTermId),
    queryFn: () => billingTermsApi.getBillingTerm(billingTermId),
    enabled: !!billingTermId,
    ...options,
  });
}

/**
 * Create a new billing term.
 */
export function useCreateBillingTerm(
  options?: UseMutationOptions<BillingTermResponse, Error, BillingTermCreate>
) {
  const queryClient = useQueryClient();

  return useMutation<BillingTermResponse, Error, BillingTermCreate>({
    mutationFn: (data) => billingTermsApi.createBillingTerm(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    ...options,
  });
}

/**
 * Update a billing term.
 */
export function useUpdateBillingTerm(
  options?: UseMutationOptions<BillingTermResponse, Error, { id: string; data: BillingTermUpdate }>
) {
  const queryClient = useQueryClient();

  return useMutation<BillingTermResponse, Error, { id: string; data: BillingTermUpdate }>({
    mutationFn: ({ id, data }) => billingTermsApi.updateBillingTerm(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
    },
    ...options,
  });
}

/**
 * Delete a billing term.
 */
export function useDeleteBillingTerm(
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => billingTermsApi.deleteBillingTerm(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.removeQueries({ queryKey: QUERY_KEYS.detail(id) });
    },
    ...options,
  });
}








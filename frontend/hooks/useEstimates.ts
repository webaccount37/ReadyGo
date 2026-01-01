/**
 * React Query hooks for estimates.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from "@tanstack/react-query";
import { estimatesApi } from "@/lib/api/estimates";
import type {
  EstimateResponse,
  EstimateDetailResponse,
  EstimateCreate,
  EstimateUpdate,
  EstimateListResponse,
  EstimateLineItemResponse,
  EstimateLineItemCreate,
  EstimateLineItemUpdate,
  AutoFillRequest,
  EstimateTotalsResponse,
  EstimatePhase,
} from "@/types/estimate";

const QUERY_KEYS = {
  all: ["estimates"] as const,
  lists: () => [...QUERY_KEYS.all, "list"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...QUERY_KEYS.lists(), filters] as const,
  details: () => [...QUERY_KEYS.all, "detail"] as const,
  detail: (id: string, includeDetails?: boolean) =>
    [...QUERY_KEYS.details(), id, includeDetails] as const,
  totals: (id: string) => [...QUERY_KEYS.all, "totals", id] as const,
  phases: (estimateId: string) => [...QUERY_KEYS.all, "phases", estimateId] as const,
};

/**
 * Get all estimates with optional filters.
 */
export function useEstimates(
  params?: {
    skip?: number;
    limit?: number;
    release_id?: string;
  },
  options?: Omit<UseQueryOptions<EstimateListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<EstimateListResponse>({
    queryKey: QUERY_KEYS.list(params),
    queryFn: () => estimatesApi.getEstimates(params),
    ...options,
  });
}

/**
 * Get a single estimate by ID.
 */
export function useEstimate(
  estimateId: string,
  includeDetails = false,
  options?: Omit<UseQueryOptions<EstimateResponse>, "queryKey" | "queryFn">
) {
  return useQuery<EstimateResponse>({
    queryKey: QUERY_KEYS.detail(estimateId, includeDetails),
    queryFn: () => estimatesApi.getEstimate(estimateId, includeDetails),
    enabled: !!estimateId,
    ...options,
  });
}

/**
 * Get estimate detail with all line items and weekly hours.
 */
export function useEstimateDetail(
  estimateId: string,
  options?: Omit<UseQueryOptions<EstimateDetailResponse>, "queryKey" | "queryFn">
) {
  return useQuery<EstimateDetailResponse>({
    queryKey: QUERY_KEYS.detail(estimateId, true),
    queryFn: () => estimatesApi.getEstimateDetail(estimateId),
    enabled: !!estimateId,
    ...options,
  });
}

/**
 * Create a new estimate.
 */
export function useCreateEstimate(
  options?: UseMutationOptions<EstimateResponse, Error, EstimateCreate>
) {
  const queryClient = useQueryClient();

  return useMutation<EstimateResponse, Error, EstimateCreate>({
    mutationFn: (data) => estimatesApi.createEstimate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    ...options,
  });
}

/**
 * Update an estimate.
 */
export function useUpdateEstimate(
  options?: UseMutationOptions<
    EstimateResponse,
    Error,
    { id: string; data: EstimateUpdate }
  >
) {
  const queryClient = useQueryClient();

  return useMutation<EstimateResponse, Error, { id: string; data: EstimateUpdate }>({
    mutationFn: ({ id, data }) => estimatesApi.updateEstimate(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
    },
    ...options,
  });
}

/**
 * Set an estimate as the active version.
 */
export function useSetActiveVersion(
  options?: UseMutationOptions<EstimateResponse, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation<EstimateResponse, Error, string>({
    mutationFn: (estimateId) => estimatesApi.setActiveVersion(estimateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    ...options,
  });
}

/**
 * Delete an estimate.
 */
export function useDeleteEstimate(
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => estimatesApi.deleteEstimate(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.removeQueries({ queryKey: QUERY_KEYS.detail(id) });
    },
    ...options,
  });
}

/**
 * Clone an estimate.
 */
export function useCloneEstimate(
  options?: UseMutationOptions<
    EstimateDetailResponse,
    Error,
    { estimateId: string; newName?: string }
  >
) {
  const queryClient = useQueryClient();

  return useMutation<
    EstimateDetailResponse,
    Error,
    { estimateId: string; newName?: string }
  >({
    mutationFn: ({ estimateId, newName }) => estimatesApi.cloneEstimate(estimateId, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    ...options,
  });
}

/**
 * Create a line item.
 */
export function useCreateLineItem(
  options?: UseMutationOptions<
    EstimateLineItemResponse,
    Error,
    { estimateId: string; data: EstimateLineItemCreate }
  >
) {
  const queryClient = useQueryClient();

  return useMutation<
    EstimateLineItemResponse,
    Error,
    { estimateId: string; data: EstimateLineItemCreate }
  >({
    mutationFn: ({ estimateId, data }) =>
      estimatesApi.createLineItem(estimateId, data),
    onSuccess: (data, variables) => {
      // Optimistically update the cache
      queryClient.setQueryData<EstimateDetailResponse>(
        QUERY_KEYS.detail(variables.estimateId, true),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            line_items: [...(old.line_items || []), data],
          };
        }
      );
      // Also invalidate to ensure consistency
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.detail(variables.estimateId, true),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.totals(variables.estimateId),
      });
    },
    ...options,
  });
}

/**
 * Update a line item.
 */
export function useUpdateLineItem(
  options?: UseMutationOptions<
    EstimateLineItemResponse,
    Error,
    { estimateId: string; lineItemId: string; data: EstimateLineItemUpdate }
  >
) {
  const queryClient = useQueryClient();

  return useMutation<
    EstimateLineItemResponse,
    Error,
    { estimateId: string; lineItemId: string; data: EstimateLineItemUpdate }
  >({
    mutationFn: ({ estimateId, lineItemId, data }) =>
      estimatesApi.updateLineItem(estimateId, lineItemId, data),
    onSuccess: (updatedLineItem, variables) => {
      // Optimistically update the cache for the specific line item only
      queryClient.setQueryData<EstimateDetailResponse>(
        QUERY_KEYS.detail(variables.estimateId, true),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            line_items: old.line_items?.map((item) =>
              item.id === variables.lineItemId ? updatedLineItem : item
            ) || [],
          };
        }
      );
      // Invalidate to ensure consistency, but use a small delay to batch updates
      setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.detail(variables.estimateId, true),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.totals(variables.estimateId),
        });
      }, 100);
    },
    ...options,
  });
}

/**
 * Delete a line item.
 */
export function useDeleteLineItem(
  options?: UseMutationOptions<
    void,
    Error,
    { estimateId: string; lineItemId: string },
    { previousEstimate: EstimateDetailResponse | undefined }
  >
) {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { estimateId: string; lineItemId: string },
    { previousEstimate: EstimateDetailResponse | undefined }
  >({
    mutationFn: async ({ estimateId, lineItemId }) => {
      console.log("Calling deleteLineItem API:", { estimateId, lineItemId });
      try {
        await estimatesApi.deleteLineItem(estimateId, lineItemId);
        console.log("Delete API call succeeded");
      } catch (error) {
        console.error("Delete API call failed:", error);
        throw error;
      }
    },
    onMutate: async ({ estimateId, lineItemId }) => {
      console.log("onMutate called:", { estimateId, lineItemId });
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: QUERY_KEYS.detail(estimateId, true),
      });

      // Snapshot the previous value for rollback
      const previousEstimate = queryClient.getQueryData<EstimateDetailResponse>(
        QUERY_KEYS.detail(estimateId, true)
      );

      console.log("Previous estimate line items count:", previousEstimate?.line_items?.length || 0);

      // Optimistically update to remove the line item
      // Use setQueryData with updater function to ensure we're working with the latest cache state
      // This prevents race conditions when multiple deletes happen simultaneously
      queryClient.setQueryData<EstimateDetailResponse>(
        QUERY_KEYS.detail(estimateId, true),
        (old) => {
          if (!old) return old;
          
          // Filter out the item being deleted
          const filteredItems = old.line_items?.filter(
            (item) => item.id !== lineItemId
          ) || [];
          
          console.log(`Removing ${lineItemId}, old count: ${old.line_items?.length || 0}, new count: ${filteredItems.length}`);
          
          return {
            ...old,
            line_items: filteredItems,
          };
        }
      );
      console.log("Optimistic update applied");

      return { previousEstimate };
    },
    onError: (err, variables, context) => {
      console.error("Delete mutation error:", err);
      // Rollback on error
      if (context?.previousEstimate) {
        console.log("Rolling back optimistic update");
        queryClient.setQueryData(
          QUERY_KEYS.detail(variables.estimateId, true),
          context.previousEstimate
        );
      }
    },
    onSuccess: (_, variables) => {
      console.log("Delete mutation succeeded for:", variables.lineItemId);
      // Ensure the item stays removed by explicitly updating the cache using updater function
      // This ensures we're working with the latest cache state, not a stale snapshot
      queryClient.setQueryData<EstimateDetailResponse>(
        QUERY_KEYS.detail(variables.estimateId, true),
        (old) => {
          if (!old) return old;
          
          // Double-check the item is removed (should already be from optimistic update)
          const filteredItems = old.line_items?.filter(
            (item) => item.id !== variables.lineItemId
          ) || [];
          
          console.log(`onSuccess: Ensuring ${variables.lineItemId} is removed, count: ${filteredItems.length}`);
          
          return {
            ...old,
            line_items: filteredItems,
          };
        }
      );
      
      // Invalidate totals since they need recalculation
      // Don't invalidate detail query - we've already updated it optimistically
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.totals(variables.estimateId),
      });
      
      // After a short delay, refetch to ensure consistency with backend
      setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.detail(variables.estimateId, true),
        });
      }, 1000); // 1 second delay to batch multiple deletes
    },
    ...options,
  });
}

/**
 * Auto-fill hours for a line item.
 */
export function useAutoFillHours(
  options?: UseMutationOptions<
    EstimateLineItemResponse[],
    Error,
    { estimateId: string; lineItemId: string; data: AutoFillRequest }
  >
) {
  const queryClient = useQueryClient();

  return useMutation<
    EstimateLineItemResponse[],
    Error,
    { estimateId: string; lineItemId: string; data: AutoFillRequest }
  >({
    mutationFn: ({ estimateId, lineItemId, data }) =>
      estimatesApi.autoFillHours(estimateId, lineItemId, data),
    onSuccess: (data, variables) => {
      console.log("Auto-fill success, response data:", data);
      // Update the cache directly with the returned data (like useUpdateLineItem does)
      if (data && data.length > 0) {
        const updatedLineItem = data[0];
        console.log("Updated line item:", updatedLineItem);
        console.log("Weekly hours in response:", updatedLineItem.weekly_hours);
        
        // Update cache with the response data
        queryClient.setQueryData<EstimateDetailResponse>(
          QUERY_KEYS.detail(variables.estimateId, true),
          (old) => {
            if (!old) {
              console.log("No old data in cache, invalidating instead");
              return old;
            }
            const updated = {
              ...old,
              line_items: old.line_items?.map((item) =>
                item.id === variables.lineItemId ? updatedLineItem : item
              ) || [],
            };
            console.log("Updated cache with line items:", updated.line_items?.length);
            const updatedItem = updated.line_items?.find(item => item.id === variables.lineItemId);
            console.log("Updated item weekly_hours count:", updatedItem?.weekly_hours?.length);
            console.log("Updated item weekly_hours sample:", updatedItem?.weekly_hours?.slice(0, 3));
            return updated;
          }
        );
        
        // Invalidate and refetch to ensure UI updates immediately
        // Use a small delay to batch updates if multiple mutations happen quickly
        setTimeout(() => {
          queryClient.invalidateQueries({
            queryKey: QUERY_KEYS.detail(variables.estimateId, true),
          });
          queryClient.invalidateQueries({
            queryKey: QUERY_KEYS.totals(variables.estimateId),
          });
        }, 100);
      } else {
        console.warn("No data returned from auto-fill mutation");
        // If no data, invalidate everything and refetch
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.detail(variables.estimateId, true),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.totals(variables.estimateId),
        });
      }
    },
    ...options,
  });
}

/**
 * Get estimate totals.
 */
export function useEstimateTotals(
  estimateId: string,
  options?: Omit<UseQueryOptions<EstimateTotalsResponse>, "queryKey" | "queryFn">
) {
  return useQuery<EstimateTotalsResponse>({
    queryKey: QUERY_KEYS.totals(estimateId),
    queryFn: () => estimatesApi.getEstimateTotals(estimateId),
    enabled: !!estimateId,
    ...options,
  });
}

/**
 * Phase management hooks
 */

/**
 * Get all phases for an estimate.
 */
export function usePhases(
  estimateId: string,
  options?: Omit<UseQueryOptions<EstimatePhase[]>, "queryKey" | "queryFn">
) {
  return useQuery<EstimatePhase[]>({
    queryKey: QUERY_KEYS.phases(estimateId),
    queryFn: () => estimatesApi.getPhases(estimateId),
    enabled: !!estimateId,
    ...options,
  });
}

/**
 * Create a new phase.
 */
export function useCreatePhase(
  options?: UseMutationOptions<
    EstimatePhase,
    Error,
    {
      estimateId: string;
      data: {
        name: string;
        start_date: string;
        end_date: string;
        color?: string;
        row_order?: number;
      };
    }
  >
) {
  const queryClient = useQueryClient();

  return useMutation<
    EstimatePhase,
    Error,
    {
      estimateId: string;
      data: {
        name: string;
        start_date: string;
        end_date: string;
        color?: string;
        row_order?: number;
      };
    }
  >({
    mutationFn: ({ estimateId, data }) => estimatesApi.createPhase(estimateId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.phases(variables.estimateId),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.detail(variables.estimateId, true),
      });
    },
    ...options,
  });
}

/**
 * Update a phase.
 */
export function useUpdatePhase(
  options?: UseMutationOptions<
    EstimatePhase,
    Error,
    {
      estimateId: string;
      phaseId: string;
      data: {
        name?: string;
        start_date?: string;
        end_date?: string;
        color?: string;
        row_order?: number;
      };
    }
  >
) {
  const queryClient = useQueryClient();

  return useMutation<
    EstimatePhase,
    Error,
    {
      estimateId: string;
      phaseId: string;
      data: {
        name?: string;
        start_date?: string;
        end_date?: string;
        color?: string;
        row_order?: number;
      };
    }
  >({
    mutationFn: ({ estimateId, phaseId, data }) =>
      estimatesApi.updatePhase(estimateId, phaseId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.phases(variables.estimateId),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.detail(variables.estimateId, true),
      });
    },
    ...options,
  });
}

/**
 * Delete a phase.
 */
export function useDeletePhase(
  options?: UseMutationOptions<
    void,
    Error,
    { estimateId: string; phaseId: string }
  >
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { estimateId: string; phaseId: string }>({
    mutationFn: ({ estimateId, phaseId }) =>
      estimatesApi.deletePhase(estimateId, phaseId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.phases(variables.estimateId),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.detail(variables.estimateId, true),
      });
    },
    ...options,
  });
}



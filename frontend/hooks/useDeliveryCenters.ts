/**
 * React Query hooks for delivery centers.
 */

import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import { deliveryCentersApi } from "@/lib/api/delivery-centers";
import type {
  DeliveryCenterListResponse,
} from "@/types/delivery-center";

const QUERY_KEYS = {
  all: ["delivery-centers"] as const,
  lists: () => [...QUERY_KEYS.all, "list"] as const,
};

/**
 * Get all delivery centers.
 */
export function useDeliveryCenters(
  options?: Omit<UseQueryOptions<DeliveryCenterListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<DeliveryCenterListResponse>({
    queryKey: QUERY_KEYS.lists(),
    queryFn: () => deliveryCentersApi.getDeliveryCenters(),
    ...options,
  });
}








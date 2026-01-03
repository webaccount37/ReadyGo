/**
 * React Query hooks for delivery centers.
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
import { deliveryCentersApi } from "@/lib/api/delivery-centers";
import type {
  DeliveryCenterResponse,
  DeliveryCenterCreate,
  DeliveryCenterUpdate,
  DeliveryCenterListResponse,
  DeliveryCenterApproverCreate,
  DeliveryCenterApproverResponse,
  DeliveryCenterApproverListResponse,
  EmployeeApproverSummary,
} from "@/types/delivery-center";

const QUERY_KEYS = {
  all: ["delivery-centers"] as const,
  lists: () => [...QUERY_KEYS.all, "list"] as const,
  details: () => [...QUERY_KEYS.all, "detail"] as const,
  detail: (id: string) => [...QUERY_KEYS.details(), id] as const,
};

/**
 * Get all delivery centers.
 */
export function useDeliveryCenters(
  includeApprovers?: boolean,
  options?: Omit<UseQueryOptions<DeliveryCenterListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<DeliveryCenterListResponse>({
    queryKey: [...QUERY_KEYS.lists(), includeApprovers],
    queryFn: () => deliveryCentersApi.getDeliveryCenters(includeApprovers),
    ...options,
  });
}

/**
 * Get a single delivery center by ID.
 */
export function useDeliveryCenter(
  deliveryCenterId: string,
  includeApprovers?: boolean,
  options?: Omit<UseQueryOptions<DeliveryCenterResponse>, "queryKey" | "queryFn">
) {
  return useQuery<DeliveryCenterResponse>({
    queryKey: [...QUERY_KEYS.detail(deliveryCenterId), includeApprovers],
    queryFn: () => deliveryCentersApi.getDeliveryCenter(deliveryCenterId, includeApprovers),
    enabled: !!deliveryCenterId,
    ...options,
  });
}

/**
 * Create a new delivery center.
 */
export function useCreateDeliveryCenter(
  options?: UseMutationOptions<DeliveryCenterResponse, Error, DeliveryCenterCreate>
) {
  const queryClient = useQueryClient();

  return useMutation<DeliveryCenterResponse, Error, DeliveryCenterCreate>({
    mutationFn: (data) => deliveryCentersApi.createDeliveryCenter(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    ...options,
  });
}

/**
 * Update a delivery center.
 */
export function useUpdateDeliveryCenter(
  options?: UseMutationOptions<DeliveryCenterResponse, Error, { id: string; data: DeliveryCenterUpdate }>
) {
  const queryClient = useQueryClient();

  return useMutation<DeliveryCenterResponse, Error, { id: string; data: DeliveryCenterUpdate }>({
    mutationFn: ({ id, data }) => deliveryCentersApi.updateDeliveryCenter(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
    },
    ...options,
  });
}

/**
 * Delete a delivery center.
 */
export function useDeleteDeliveryCenter(
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => deliveryCentersApi.deleteDeliveryCenter(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.removeQueries({ queryKey: QUERY_KEYS.detail(id) });
    },
    ...options,
  });
}

/**
 * Get approvers for a delivery center.
 */
export function useDeliveryCenterApprovers(
  deliveryCenterId: string,
  options?: Omit<UseQueryOptions<DeliveryCenterApproverListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<DeliveryCenterApproverListResponse>({
    queryKey: [...QUERY_KEYS.detail(deliveryCenterId), "approvers"],
    queryFn: () => deliveryCentersApi.getDeliveryCenterApprovers(deliveryCenterId),
    enabled: !!deliveryCenterId,
    ...options,
  });
}

/**
 * Get employees for a delivery center (for selecting approvers).
 */
export function useEmployeesForDeliveryCenter(
  deliveryCenterId: string,
  options?: Omit<UseQueryOptions<EmployeeApproverSummary[]>, "queryKey" | "queryFn">
) {
  return useQuery<EmployeeApproverSummary[]>({
    queryKey: [...QUERY_KEYS.detail(deliveryCenterId), "employees"],
    queryFn: () => deliveryCentersApi.getEmployeesForDeliveryCenter(deliveryCenterId),
    enabled: !!deliveryCenterId,
    ...options,
  });
}

/**
 * Add an approver to a delivery center.
 */
export function useAddDeliveryCenterApprover(
  options?: UseMutationOptions<DeliveryCenterApproverResponse, Error, { deliveryCenterId: string; data: DeliveryCenterApproverCreate }>
) {
  const queryClient = useQueryClient();

  return useMutation<DeliveryCenterApproverResponse, Error, { deliveryCenterId: string; data: DeliveryCenterApproverCreate }>({
    mutationFn: ({ deliveryCenterId, data }) => deliveryCentersApi.addDeliveryCenterApprover(deliveryCenterId, data),
    onSuccess: (_, { deliveryCenterId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(deliveryCenterId) });
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.detail(deliveryCenterId), "approvers"] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    ...options,
  });
}

/**
 * Remove an approver from a delivery center.
 */
export function useRemoveDeliveryCenterApprover(
  options?: UseMutationOptions<void, Error, { deliveryCenterId: string; employeeId: string }>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { deliveryCenterId: string; employeeId: string }>({
    mutationFn: ({ deliveryCenterId, employeeId }) => deliveryCentersApi.removeDeliveryCenterApprover(deliveryCenterId, employeeId),
    onSuccess: (_, { deliveryCenterId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(deliveryCenterId) });
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEYS.detail(deliveryCenterId), "approvers"] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    ...options,
  });
}










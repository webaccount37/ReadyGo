/**
 * React Query hooks for roles.
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
import { rolesApi } from "@/lib/api/roles";
import type {
  RoleResponse,
  RoleCreate,
  RoleUpdate,
  RoleListResponse,
} from "@/types/role";

const QUERY_KEYS = {
  all: ["roles"] as const,
  lists: () => [...QUERY_KEYS.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...QUERY_KEYS.lists(), filters] as const,
  details: () => [...QUERY_KEYS.all, "detail"] as const,
  detail: (id: string) => [...QUERY_KEYS.details(), id] as const,
};

/**
 * Get all roles with optional filters.
 */
export function useRoles(
  params?: {
    skip?: number;
    limit?: number;
    status?: string;
  },
  options?: Omit<UseQueryOptions<RoleListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<RoleListResponse>({
    queryKey: QUERY_KEYS.list(params),
    queryFn: () => rolesApi.getRoles(params),
    ...options,
  });
}

/**
 * Get a single role by ID.
 */
export function useRole(
  roleId: string,
  includeRelationships = false,
  options?: Omit<UseQueryOptions<RoleResponse>, "queryKey" | "queryFn">
) {
  return useQuery<RoleResponse>({
    queryKey: QUERY_KEYS.detail(roleId),
    queryFn: () => rolesApi.getRole(roleId, includeRelationships),
    enabled: !!roleId,
    ...options,
  });
}

/**
 * Create a new role.
 */
export function useCreateRole(
  options?: UseMutationOptions<RoleResponse, Error, RoleCreate>
) {
  const queryClient = useQueryClient();

  return useMutation<RoleResponse, Error, RoleCreate>({
    mutationFn: (data) => rolesApi.createRole(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    ...options,
  });
}

/**
 * Update a role.
 */
export function useUpdateRole(
  options?: UseMutationOptions<RoleResponse, Error, { id: string; data: RoleUpdate }>
) {
  const queryClient = useQueryClient();

  return useMutation<RoleResponse, Error, { id: string; data: RoleUpdate }>({
    mutationFn: ({ id, data }) => rolesApi.updateRole(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
    },
    ...options,
  });
}

/**
 * Delete a role.
 */
export function useDeleteRole(
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => rolesApi.deleteRole(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.removeQueries({ queryKey: QUERY_KEYS.detail(id) });
    },
    ...options,
  });
}












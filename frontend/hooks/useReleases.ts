/**
 * React Query hooks for releases.
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
import { releasesApi } from "@/lib/api/releases";
import type {
  ReleaseResponse,
  ReleaseCreate,
  ReleaseUpdate,
  ReleaseListResponse,
} from "@/types/release";

const QUERY_KEYS = {
  all: ["releases"] as const,
  lists: () => [...QUERY_KEYS.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...QUERY_KEYS.lists(), filters] as const,
  details: () => [...QUERY_KEYS.all, "detail"] as const,
  detail: (id: string, includeRelationships?: boolean) => [...QUERY_KEYS.details(), id, includeRelationships] as const,
};

/**
 * Get all releases with optional filters.
 */
export function useReleases(
  params?: {
    skip?: number;
    limit?: number;
    opportunity_id?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
  },
  options?: Omit<UseQueryOptions<ReleaseListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<ReleaseListResponse>({
    queryKey: QUERY_KEYS.list(params),
    queryFn: () => releasesApi.getReleases(params),
    ...options,
  });
}

/**
 * Get a single release by ID.
 */
export function useRelease(
  releaseId: string,
  includeRelationships = false,
  options?: Omit<UseQueryOptions<ReleaseResponse>, "queryKey" | "queryFn">
) {
  return useQuery<ReleaseResponse>({
    queryKey: QUERY_KEYS.detail(releaseId, includeRelationships),
    queryFn: () => releasesApi.getRelease(releaseId, includeRelationships),
    enabled: !!releaseId,
    ...options,
  });
}

/**
 * Create a new release.
 */
export function useCreateRelease(
  options?: UseMutationOptions<ReleaseResponse, Error, ReleaseCreate>
) {
  const queryClient = useQueryClient();

  return useMutation<ReleaseResponse, Error, ReleaseCreate>({
    mutationFn: (data) => releasesApi.createRelease(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    ...options,
  });
}

/**
 * Update a release.
 */
export function useUpdateRelease(
  options?: UseMutationOptions<ReleaseResponse, Error, { id: string; data: ReleaseUpdate }>
) {
  const queryClient = useQueryClient();

  return useMutation<ReleaseResponse, Error, { id: string; data: ReleaseUpdate }>({
    mutationFn: ({ id, data }) => releasesApi.updateRelease(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
    },
    ...options,
  });
}

/**
 * Delete a release.
 */
export function useDeleteRelease(
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => releasesApi.deleteRelease(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.removeQueries({ queryKey: QUERY_KEYS.detail(id) });
    },
    ...options,
  });
}

/**
 * Link roles to a release.
 */
export function useLinkRolesToRelease(
  options?: UseMutationOptions<void, Error, { releaseId: string; roleIds: string[] }>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { releaseId: string; roleIds: string[] }>({
    mutationFn: ({ releaseId, roleIds }) =>
      releasesApi.linkRolesToRelease(releaseId, roleIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
    },
    ...options,
  });
}

/**
 * Unlink roles from a release.
 */
export function useUnlinkRolesFromRelease(
  options?: UseMutationOptions<void, Error, { releaseId: string; roleIds: string[] }>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { releaseId: string; roleIds: string[] }>({
    mutationFn: ({ releaseId, roleIds }) =>
      releasesApi.unlinkRolesFromRelease(releaseId, roleIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
    },
    ...options,
  });
}




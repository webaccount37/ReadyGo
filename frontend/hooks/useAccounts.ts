/**
 * React Query hooks for accounts.
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
import { accountsApi } from "@/lib/api/accounts";
import type {
  AccountResponse,
  AccountCreate,
  AccountUpdate,
  AccountListResponse,
} from "@/types/account";

const QUERY_KEYS = {
  all: ["accounts"] as const,
  lists: () => [...QUERY_KEYS.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...QUERY_KEYS.lists(), filters] as const,
  details: () => [...QUERY_KEYS.all, "detail"] as const,
  detail: (id: string, includeProjects?: boolean) => [...QUERY_KEYS.details(), id, includeProjects] as const,
};

/**
 * Get all accounts with optional filters.
 */
export function useAccounts(
  params?: {
    skip?: number;
    limit?: number;
    status?: string;
    region?: string;
  },
  options?: Omit<UseQueryOptions<AccountListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<AccountListResponse>({
    queryKey: QUERY_KEYS.list(params),
    queryFn: () => accountsApi.getAccounts(params),
    ...options,
  });
}

/**
 * Get a single account by ID.
 */
export function useAccount(
  accountId: string,
  includeProjects = false,
  options?: Omit<UseQueryOptions<AccountResponse>, "queryKey" | "queryFn">
) {
  return useQuery<AccountResponse>({
    queryKey: QUERY_KEYS.detail(accountId, includeProjects),
    queryFn: () => accountsApi.getAccount(accountId, includeProjects),
    enabled: !!accountId,
    ...options,
  });
}

/**
 * Create a new account.
 */
export function useCreateAccount(
  options?: UseMutationOptions<AccountResponse, Error, AccountCreate>
) {
  const queryClient = useQueryClient();

  return useMutation<AccountResponse, Error, AccountCreate>({
    mutationFn: (data) => accountsApi.createAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    ...options,
  });
}

/**
 * Update an account.
 */
export function useUpdateAccount(
  options?: UseMutationOptions<AccountResponse, Error, { id: string; data: AccountUpdate }>
) {
  const queryClient = useQueryClient();

  return useMutation<AccountResponse, Error, { id: string; data: AccountUpdate }>({
    mutationFn: ({ id, data }) => accountsApi.updateAccount(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
    },
    ...options,
  });
}

/**
 * Delete an account.
 */
export function useDeleteAccount(
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => accountsApi.deleteAccount(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.removeQueries({ queryKey: QUERY_KEYS.detail(id) });
    },
    ...options,
  });
}










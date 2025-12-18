/**
 * React Query hooks for contacts.
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
import { contactsApi } from "@/lib/api/contacts";
import type {
  ContactResponse,
  ContactCreate,
  ContactUpdate,
  ContactListResponse,
} from "@/types/contact";

const QUERY_KEYS = {
  all: ["contacts"] as const,
  lists: () => [...QUERY_KEYS.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...QUERY_KEYS.lists(), filters] as const,
  listByAccount: (accountId: string, filters?: Record<string, unknown>) => [...QUERY_KEYS.lists(), "account", accountId, filters] as const,
  details: () => [...QUERY_KEYS.all, "detail"] as const,
  detail: (id: string) => [...QUERY_KEYS.details(), id] as const,
};

/**
 * Get all contacts with pagination.
 */
export function useContacts(
  params?: {
    skip?: number;
    limit?: number;
  },
  options?: Omit<UseQueryOptions<ContactListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<ContactListResponse>({
    queryKey: QUERY_KEYS.list(params),
    queryFn: () => contactsApi.getContacts(params),
    ...options,
  });
}

/**
 * Get all contacts for an account.
 */
export function useContactsByAccount(
  accountId: string,
  params?: {
    skip?: number;
    limit?: number;
  },
  options?: Omit<UseQueryOptions<ContactListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<ContactListResponse>({
    queryKey: QUERY_KEYS.listByAccount(accountId, params),
    queryFn: () => contactsApi.getContactsByAccount(accountId, params),
    enabled: !!accountId,
    ...options,
  });
}

/**
 * Get a single contact by ID.
 */
export function useContact(
  contactId: string,
  options?: Omit<UseQueryOptions<ContactResponse>, "queryKey" | "queryFn">
) {
  return useQuery<ContactResponse>({
    queryKey: QUERY_KEYS.detail(contactId),
    queryFn: () => contactsApi.getContact(contactId),
    enabled: !!contactId,
    ...options,
  });
}

/**
 * Create a new contact.
 */
export function useCreateContact(
  options?: UseMutationOptions<ContactResponse, Error, ContactCreate>
) {
  const queryClient = useQueryClient();

  return useMutation<ContactResponse, Error, ContactCreate>({
    mutationFn: (data) => contactsApi.createContact(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.listByAccount(data.account_id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    ...options,
  });
}

/**
 * Update a contact.
 */
export function useUpdateContact(
  options?: UseMutationOptions<ContactResponse, Error, { id: string; data: ContactUpdate }>
) {
  const queryClient = useQueryClient();

  return useMutation<ContactResponse, Error, { id: string; data: ContactUpdate }>({
    mutationFn: ({ id, data }) => contactsApi.updateContact(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.listByAccount(data.account_id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    ...options,
  });
}

/**
 * Delete a contact.
 */
export function useDeleteContact(
  options?: UseMutationOptions<void, Error, { contactId: string; accountId: string }>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { contactId: string; accountId: string }>({
    mutationFn: ({ contactId }) => contactsApi.deleteContact(contactId),
    onSuccess: (_, { accountId, contactId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.listByAccount(accountId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.removeQueries({ queryKey: QUERY_KEYS.detail(contactId) });
    },
    ...options,
  });
}


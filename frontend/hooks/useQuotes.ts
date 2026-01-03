/**
 * React Query hooks for quotes.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from "@tanstack/react-query";
import { quotesApi } from "@/lib/api/quotes";
import type {
  QuoteResponse,
  QuoteDetailResponse,
  QuoteCreate,
  QuoteStatusUpdate,
  QuoteListResponse,
} from "@/types/quote";

const QUERY_KEYS = {
  all: ["quotes"] as const,
  lists: () => [...QUERY_KEYS.all, "list"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...QUERY_KEYS.lists(), filters] as const,
  details: () => [...QUERY_KEYS.all, "detail"] as const,
  detail: (id: string) => [...QUERY_KEYS.details(), id] as const,
};

/**
 * Get all quotes with optional filters.
 */
export function useQuotes(
  params?: {
    skip?: number;
    limit?: number;
    engagement_id?: string;
  },
  options?: Omit<UseQueryOptions<QuoteListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<QuoteListResponse>({
    queryKey: QUERY_KEYS.list(params),
    queryFn: () => quotesApi.getQuotes(params),
    ...options,
  });
}

/**
 * Get a single quote by ID.
 */
export function useQuote(
  quoteId: string,
  options?: Omit<UseQueryOptions<QuoteResponse>, "queryKey" | "queryFn">
) {
  return useQuery<QuoteResponse>({
    queryKey: QUERY_KEYS.detail(quoteId),
    queryFn: () => quotesApi.getQuote(quoteId),
    enabled: !!quoteId,
    ...options,
  });
}

/**
 * Get quote detail with all line items and weekly hours.
 */
export function useQuoteDetail(
  quoteId: string,
  options?: Omit<UseQueryOptions<QuoteDetailResponse>, "queryKey" | "queryFn">
) {
  return useQuery<QuoteDetailResponse>({
    queryKey: [...QUERY_KEYS.detail(quoteId), "detail"],
    queryFn: () => quotesApi.getQuoteDetail(quoteId),
    enabled: !!quoteId,
    ...options,
  });
}

/**
 * Create a new quote.
 */
export function useCreateQuote(
  options?: UseMutationOptions<QuoteResponse, Error, QuoteCreate>
) {
  const queryClient = useQueryClient();

  return useMutation<QuoteResponse, Error, QuoteCreate>({
    mutationFn: (data) => quotesApi.createQuote(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
      // Also invalidate engagements and estimates since lock status changed
      queryClient.invalidateQueries({ queryKey: ["engagements"] });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
    },
    ...options,
  });
}

/**
 * Update quote status.
 */
export function useUpdateQuoteStatus(
  options?: UseMutationOptions<
    QuoteResponse,
    Error,
    { quoteId: string; status: QuoteStatusUpdate }
  >
) {
  const queryClient = useQueryClient();

  return useMutation<
    QuoteResponse,
    Error,
    { quoteId: string; status: QuoteStatusUpdate }
  >({
    mutationFn: ({ quoteId, status }) =>
      quotesApi.updateQuoteStatus(quoteId, status),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
    },
    ...options,
  });
}

/**
 * Deactivate quote and unlock engagement/estimates.
 */
export function useDeactivateQuote(
  options?: UseMutationOptions<QuoteResponse, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation<QuoteResponse, Error, string>({
    mutationFn: (quoteId) => quotesApi.deactivateQuote(quoteId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
      // Also invalidate engagements and estimates since lock status changed
      queryClient.invalidateQueries({ queryKey: ["engagements"] });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
    },
    ...options,
  });
}


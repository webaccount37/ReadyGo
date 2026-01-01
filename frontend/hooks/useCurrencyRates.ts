/**
 * React Query hooks for currency rates.
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
import { currencyRatesApi } from "@/lib/api/currency-rates";
import type {
  CurrencyRateResponse,
  CurrencyRateCreate,
  CurrencyRateUpdate,
  CurrencyRateListResponse,
} from "@/types/currency-rate";

const QUERY_KEYS = {
  all: ["currency-rates"] as const,
  lists: () => [...QUERY_KEYS.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...QUERY_KEYS.lists(), filters] as const,
  details: () => [...QUERY_KEYS.all, "detail"] as const,
  detail: (id: string) => [...QUERY_KEYS.details(), id] as const,
  byCode: (code: string) => [...QUERY_KEYS.details(), "code", code] as const,
};

/**
 * Get all currency rates with optional pagination.
 */
export function useCurrencyRates(
  params?: {
    skip?: number;
    limit?: number;
  },
  options?: Omit<UseQueryOptions<CurrencyRateListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<CurrencyRateListResponse>({
    queryKey: QUERY_KEYS.list(params),
    queryFn: () => currencyRatesApi.getCurrencyRates(params),
    ...options,
  });
}

/**
 * Get a single currency rate by ID.
 */
export function useCurrencyRate(
  currencyRateId: string,
  options?: Omit<UseQueryOptions<CurrencyRateResponse>, "queryKey" | "queryFn">
) {
  return useQuery<CurrencyRateResponse>({
    queryKey: QUERY_KEYS.detail(currencyRateId),
    queryFn: () => currencyRatesApi.getCurrencyRate(currencyRateId),
    enabled: !!currencyRateId,
    ...options,
  });
}

/**
 * Get a single currency rate by currency code.
 */
export function useCurrencyRateByCode(
  currencyCode: string,
  options?: Omit<UseQueryOptions<CurrencyRateResponse>, "queryKey" | "queryFn">
) {
  return useQuery<CurrencyRateResponse>({
    queryKey: QUERY_KEYS.byCode(currencyCode),
    queryFn: () => currencyRatesApi.getCurrencyRateByCode(currencyCode),
    enabled: !!currencyCode,
    ...options,
  });
}

/**
 * Create a new currency rate.
 */
export function useCreateCurrencyRate(
  options?: UseMutationOptions<CurrencyRateResponse, Error, CurrencyRateCreate>
) {
  const queryClient = useQueryClient();

  return useMutation<CurrencyRateResponse, Error, CurrencyRateCreate>({
    mutationFn: (data) => currencyRatesApi.createCurrencyRate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    ...options,
  });
}

/**
 * Update a currency rate by ID.
 */
export function useUpdateCurrencyRate(
  options?: UseMutationOptions<CurrencyRateResponse, Error, { id: string; data: CurrencyRateUpdate }>
) {
  const queryClient = useQueryClient();

  return useMutation<CurrencyRateResponse, Error, { id: string; data: CurrencyRateUpdate }>({
    mutationFn: ({ id, data }) => currencyRatesApi.updateCurrencyRate(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.byCode(data.currency_code) });
    },
    ...options,
  });
}

/**
 * Update a currency rate by currency code.
 */
export function useUpdateCurrencyRateByCode(
  options?: UseMutationOptions<CurrencyRateResponse, Error, { code: string; data: CurrencyRateUpdate }>
) {
  const queryClient = useQueryClient();

  return useMutation<CurrencyRateResponse, Error, { code: string; data: CurrencyRateUpdate }>({
    mutationFn: ({ code, data }) => currencyRatesApi.updateCurrencyRateByCode(code, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.byCode(data.currency_code) });
    },
    ...options,
  });
}

/**
 * Delete a currency rate.
 */
export function useDeleteCurrencyRate(
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => currencyRatesApi.deleteCurrencyRate(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.removeQueries({ queryKey: QUERY_KEYS.detail(id) });
    },
    ...options,
  });
}


/**
 * React Query hooks for expense categories (admin).
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from "@tanstack/react-query";
import { expenseCategoriesApi } from "@/lib/api/expenseCategories";
import type {
  ExpenseCategory,
  ExpenseCategoryCreate,
  ExpenseCategoryUpdate,
  ExpenseCategoryListResponse,
} from "@/types/expense-category";

const QUERY_KEYS = {
  all: ["expense-categories"] as const,
  list: (params?: { skip?: number; limit?: number }) => [...QUERY_KEYS.all, "list", params] as const,
};

export function useExpenseCategories(
  params?: { skip?: number; limit?: number },
  options?: Omit<UseQueryOptions<ExpenseCategoryListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<ExpenseCategoryListResponse>({
    queryKey: QUERY_KEYS.list(params),
    queryFn: () => expenseCategoriesApi.list(params),
    ...options,
  });
}

export function useCreateExpenseCategory(
  options?: UseMutationOptions<ExpenseCategory, Error, ExpenseCategoryCreate>
) {
  const queryClient = useQueryClient();
  return useMutation<ExpenseCategory, Error, ExpenseCategoryCreate>({
    mutationFn: (body) => expenseCategoriesApi.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
    },
    ...options,
  });
}

export function useUpdateExpenseCategory(
  options?: UseMutationOptions<ExpenseCategory, Error, { id: number; data: ExpenseCategoryUpdate }>
) {
  const queryClient = useQueryClient();
  return useMutation<ExpenseCategory, Error, { id: number; data: ExpenseCategoryUpdate }>({
    mutationFn: ({ id, data }) => expenseCategoriesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
    },
    ...options,
  });
}

export function useDeleteExpenseCategory(
  options?: UseMutationOptions<void, Error, number>
) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (id) => expenseCategoriesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.all });
    },
    ...options,
  });
}

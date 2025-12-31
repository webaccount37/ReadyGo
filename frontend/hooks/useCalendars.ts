/**
 * React Query hooks for calendars.
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
import { calendarsApi } from "@/lib/api/calendars";
import type {
  CalendarResponse,
  CalendarCreate,
  CalendarUpdate,
  CalendarListResponse,
} from "@/types/calendar";

const QUERY_KEYS = {
  all: ["calendars"] as const,
  lists: () => [...QUERY_KEYS.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...QUERY_KEYS.lists(), filters] as const,
  details: () => [...QUERY_KEYS.all, "detail"] as const,
  detail: (id: string) => [...QUERY_KEYS.details(), id] as const,
  date: (year: number, month: number, day: number) => [...QUERY_KEYS.all, "date", year, month, day] as const,
};

/**
 * Get all calendar entries with optional filters.
 */
export function useCalendars(
  params?: {
    skip?: number;
    limit?: number;
    year?: number;
    month?: number;
    is_holiday?: boolean;
    financial_period?: string;
  },
  options?: Omit<UseQueryOptions<CalendarListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<CalendarListResponse>({
    queryKey: QUERY_KEYS.list(params),
    queryFn: () => calendarsApi.getCalendars(params),
    ...options,
  });
}

/**
 * Get a single calendar entry by ID.
 */
export function useCalendar(
  calendarId: string,
  options?: Omit<UseQueryOptions<CalendarResponse>, "queryKey" | "queryFn">
) {
  return useQuery<CalendarResponse>({
    queryKey: QUERY_KEYS.detail(calendarId),
    queryFn: () => calendarsApi.getCalendar(calendarId),
    enabled: !!calendarId,
    ...options,
  });
}

/**
 * Get calendar entry by date.
 */
export function useCalendarByDate(
  year: number,
  month: number,
  day: number,
  options?: Omit<UseQueryOptions<CalendarResponse>, "queryKey" | "queryFn">
) {
  return useQuery<CalendarResponse>({
    queryKey: QUERY_KEYS.date(year, month, day),
    queryFn: () => calendarsApi.getCalendarByDate(year, month, day),
    ...options,
  });
}

/**
 * Create a new calendar entry.
 */
export function useCreateCalendar(
  options?: UseMutationOptions<CalendarResponse, Error, CalendarCreate>
) {
  const queryClient = useQueryClient();

  return useMutation<CalendarResponse, Error, CalendarCreate>({
    mutationFn: (data) => calendarsApi.createCalendar(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    ...options,
  });
}

/**
 * Update a calendar entry.
 */
export function useUpdateCalendar(
  options?: UseMutationOptions<CalendarResponse, Error, { id: string; data: CalendarUpdate }>
) {
  const queryClient = useQueryClient();

  return useMutation<CalendarResponse, Error, { id: string; data: CalendarUpdate }>({
    mutationFn: ({ id, data }) => calendarsApi.updateCalendar(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(data.id) });
    },
    ...options,
  });
}

/**
 * Delete a calendar entry.
 */
export function useDeleteCalendar(
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => calendarsApi.deleteCalendar(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
      queryClient.removeQueries({ queryKey: QUERY_KEYS.detail(id) });
    },
    ...options,
  });
}











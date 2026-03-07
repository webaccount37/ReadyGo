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
  ImportPublicHolidaysRequest,
} from "@/types/calendar";

const QUERY_KEYS = {
  all: ["calendars"] as const,
  lists: () => [...QUERY_KEYS.all, "list"] as const,
  list: (filters?: Record<string, unknown>) => [...QUERY_KEYS.lists(), filters] as const,
  details: () => [...QUERY_KEYS.all, "detail"] as const,
  detail: (id: string) => [...QUERY_KEYS.details(), id] as const,
};

/**
 * Get calendar entries for a year and delivery center.
 */
export function useCalendars(
  params: {
    year: number;
    delivery_center_id: string;
    skip?: number;
    limit?: number;
  },
  options?: Omit<UseQueryOptions<CalendarListResponse>, "queryKey" | "queryFn">
) {
  return useQuery<CalendarListResponse>({
    queryKey: QUERY_KEYS.list(params),
    queryFn: () => calendarsApi.getCalendars(params),
    enabled: !!params.year && !!params.delivery_center_id,
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

/**
 * Import public holidays from date.nager.at API.
 */
export function useImportPublicHolidays(
  options?: UseMutationOptions<{ imported: number }, Error, ImportPublicHolidaysRequest>
) {
  const queryClient = useQueryClient();

  return useMutation<{ imported: number }, Error, ImportPublicHolidaysRequest>({
    mutationFn: (data) => calendarsApi.importPublicHolidays(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
    ...options,
  });
}












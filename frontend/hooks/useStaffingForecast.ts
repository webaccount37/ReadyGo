/**
 * React Query hook for staffing forecast.
 */

import {
  useQuery,
  UseQueryOptions,
} from "@tanstack/react-query";
import { staffingForecastApi, type StaffingForecastResponse, type StaffingForecastParams } from "@/lib/api/staffing-forecast";

const QUERY_KEYS = {
  all: ["staffing-forecast"] as const,
  list: (params?: StaffingForecastParams) =>
    [...QUERY_KEYS.all, "list", params] as const,
};

/**
 * Get staffing forecast data with optional filters.
 */
export function useStaffingForecast(
  params?: StaffingForecastParams,
  options?: Omit<UseQueryOptions<StaffingForecastResponse>, "queryKey" | "queryFn">
) {
  return useQuery<StaffingForecastResponse>({
    queryKey: QUERY_KEYS.list(params),
    queryFn: () => staffingForecastApi.getStaffingForecast(params),
    ...options,
  });
}

"use client";

import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import { dashboardApi } from "@/lib/api/dashboard";
import type { DashboardOpportunityMetricsResponse } from "@/types/dashboard";

const QUERY_KEY = ["dashboard", "opportunities-metrics"] as const;

export function useDashboardOpportunityMetrics(
  options?: Omit<UseQueryOptions<DashboardOpportunityMetricsResponse>, "queryKey" | "queryFn">
) {
  return useQuery<DashboardOpportunityMetricsResponse>({
    queryKey: QUERY_KEY,
    queryFn: () => dashboardApi.getOpportunityMetrics(),
    staleTime: 120_000,
    ...options,
  });
}

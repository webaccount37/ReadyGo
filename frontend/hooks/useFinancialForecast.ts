"use client";

import { useQuery } from "@tanstack/react-query";
import { financialForecastApi, type FinancialForecastParams } from "@/lib/api/financial-forecast";

export function useFinancialForecast(params: FinancialForecastParams | null) {
  return useQuery({
    queryKey: ["financial-forecast", params],
    queryFn: () => financialForecastApi.getForecast(params!),
    enabled: !!params?.delivery_center_id && !!params?.start_week && !!params?.end_week,
  });
}

export function useFinancialForecastDefinition() {
  return useQuery({
    queryKey: ["financial-forecast", "definition"],
    queryFn: () => financialForecastApi.getDefinition(),
  });
}

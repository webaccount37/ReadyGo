/**
 * Dashboard opportunity metrics from GET /api/v1/dashboard/opportunities-metrics
 */

export interface YoYClosedUsdByYearDc {
  year: number;
  delivery_center_id: string;
  delivery_center_name: string;
  sum_usd: string;
}

export interface YoYClosedCountByYearDc {
  year: number;
  delivery_center_id: string;
  delivery_center_name: string;
  count: number;
}

export interface FunnelByStatusDc {
  status: string;
  delivery_center_id: string;
  delivery_center_name: string;
  sum_usd: string;
  count: number;
}

export interface WonCountByMonth {
  year_month: string;
  count: number;
}

export interface PipelineCountByStatus {
  status: string;
  count: number;
}

export interface DashboardOpportunityMetricsResponse {
  avg_days_to_close_won: string | null;
  avg_days_to_close_sample_size: number;
  avg_forecast_usd_won: string | null;
  avg_forecast_usd_won_sample_size: number;
  pipeline_forecast_usd: string;
  estimated_revenue_usd: string;
  yoy_closed_usd_by_year_dc: YoYClosedUsdByYearDc[];
  yoy_closed_count_by_year_dc: YoYClosedCountByYearDc[];
  funnel_by_status_dc: FunnelByStatusDc[];
  won_count_by_month: WonCountByMonth[];
  pipeline_count_by_status: PipelineCountByStatus[];
}

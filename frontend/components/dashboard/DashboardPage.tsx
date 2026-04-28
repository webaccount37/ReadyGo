"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight } from "lucide-react";
import { useDashboardOpportunityMetrics } from "@/hooks/useDashboard";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useEmployees } from "@/hooks/useEmployees";
import { financialForecastApi } from "@/lib/api/financial-forecast";
import { employeesApi } from "@/lib/api/employees";
import { getThisWeekSundayISO, getYearStartWeekSundayISO } from "@/lib/week-utils";
import {
  calendarYtdMonthKeys,
  sumRowAcrossMonths,
  ytdNetMarginPctFromCells,
} from "@/components/dashboard/financial-ytd";
import { navGroups } from "@/components/layout/nav-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { FinancialForecastResponse } from "@/lib/api/financial-forecast";

const DC_COLORS = ["#2563eb", "#16a34a", "#ca8a04", "#dc2626", "#9333ea", "#0891b2", "#ea580c", "#4f46e5"];

/** Open-pipeline funnel bars: X-axis order (matches opportunity pipeline stages). */
const FUNNEL_STATUS_ORDER = ["discovery", "qualified", "proposal", "negotiation"] as const;

/** Pipeline mix pie: all statuses, fixed colors per status. */
const PIPELINE_MIX_PIE_COLORS: Record<string, string> = {
  discovery: "#2563eb",
  qualified: "#0284c7",
  proposal: "#0d9488",
  negotiation: "#d97706",
  won: "#16a34a",
  lost: "#e11d48",
  cancelled: "#64748b",
};

function formatUsd0(value: string | number | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : Number(value ?? 0);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatMoney0(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.length === 3 ? currency : "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatPct1(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
}

export function DashboardPage() {
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useDashboardOpportunityMetrics();
  const { data: dcsData } = useDeliveryCenters();
  const { data: employeesData } = useEmployees({ limit: 1000 });

  const centers = useMemo(() => [...(dcsData?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [dcsData]);

  const range = useMemo(() => {
    const y = new Date().getFullYear();
    return { start_week: getYearStartWeekSundayISO(y), end_week: getThisWeekSundayISO() };
  }, []);

  const forecastQueries = useQueries({
    queries: centers.flatMap((dc) => [
      {
        queryKey: ["financial-forecast", "dashboard", dc.id, range.start_week, range.end_week, "actuals"],
        queryFn: () =>
          financialForecastApi.getForecast({
            delivery_center_id: dc.id,
            start_week: range.start_week,
            end_week: range.end_week,
            metric: "actuals",
          }),
        enabled: !!dc.id && !!range.start_week && !!range.end_week,
        staleTime: 120_000,
      },
      {
        queryKey: ["financial-forecast", "dashboard", dc.id, range.start_week, range.end_week, "forecast"],
        queryFn: () =>
          financialForecastApi.getForecast({
            delivery_center_id: dc.id,
            start_week: range.start_week,
            end_week: range.end_week,
            metric: "forecast",
          }),
        enabled: !!dc.id && !!range.start_week && !!range.end_week,
        staleTime: 120_000,
      },
    ]),
  });

  const utilQueries = useQueries({
    queries: centers.map((dc) => ({
      queryKey: ["employees", "utilization", "dashboard", dc.id, "calendar"],
      queryFn: () =>
        employeesApi.getEmployeeUtilization({ delivery_center_id: dc.id, ytd_mode: "calendar" }),
      enabled: !!dc.id,
      staleTime: 120_000,
    })),
  });

  const dcIdsOrdered = useMemo(() => centers.map((c) => c.id), [centers]);

  const yoyUsdChartData = useMemo(() => {
    if (!metrics?.yoy_closed_usd_by_year_dc?.length) return [];
    const years = [...new Set(metrics.yoy_closed_usd_by_year_dc.map((r) => r.year))].sort((a, b) => a - b);
    return years.map((year) => {
      const row: Record<string, string | number> = { label: String(year) };
      for (const id of dcIdsOrdered) {
        const found = metrics.yoy_closed_usd_by_year_dc.find((r) => r.year === year && r.delivery_center_id === id);
        row[id] = found ? Number(found.sum_usd) : 0;
      }
      return row;
    });
  }, [metrics, dcIdsOrdered]);

  const yoyCountChartData = useMemo(() => {
    if (!metrics?.yoy_closed_count_by_year_dc?.length) return [];
    const years = [...new Set(metrics.yoy_closed_count_by_year_dc.map((r) => r.year))].sort((a, b) => a - b);
    return years.map((year) => {
      const row: Record<string, string | number> = { label: String(year) };
      for (const id of dcIdsOrdered) {
        const found = metrics.yoy_closed_count_by_year_dc.find((r) => r.year === year && r.delivery_center_id === id);
        row[id] = found ? found.count : 0;
      }
      return row;
    });
  }, [metrics, dcIdsOrdered]);

  const funnelStatuses = useMemo(() => {
    if (!metrics?.funnel_by_status_dc?.length) return [];
    const present = new Set(metrics.funnel_by_status_dc.map((r) => r.status));
    const funnelOrderSet = new Set<string>(FUNNEL_STATUS_ORDER);
    const ordered = FUNNEL_STATUS_ORDER.filter((s) => present.has(s));
    const rest = [...present].filter((s) => !funnelOrderSet.has(s));
    rest.sort();
    return [...ordered, ...rest];
  }, [metrics]);

  const funnelUsdChartData = useMemo(() => {
    if (!metrics?.funnel_by_status_dc?.length) return [];
    return funnelStatuses.map((status) => {
      const row: Record<string, string | number> = { label: formatStatus(status) };
      for (const id of dcIdsOrdered) {
        const found = metrics.funnel_by_status_dc.find((r) => r.status === status && r.delivery_center_id === id);
        row[id] = found ? Number(found.sum_usd) : 0;
      }
      return row;
    });
  }, [metrics, funnelStatuses, dcIdsOrdered]);

  const funnelCountChartData = useMemo(() => {
    if (!metrics?.funnel_by_status_dc?.length) return [];
    return funnelStatuses.map((status) => {
      const row: Record<string, string | number> = { label: formatStatus(status) };
      for (const id of dcIdsOrdered) {
        const found = metrics.funnel_by_status_dc.find((r) => r.status === status && r.delivery_center_id === id);
        row[id] = found ? found.count : 0;
      }
      return row;
    });
  }, [metrics, funnelStatuses, dcIdsOrdered]);

  const wonByMonthData = useMemo(() => {
    const rows = metrics?.won_count_by_month ?? [];
    return [...rows].sort((a, b) => a.year_month.localeCompare(b.year_month)).map((r) => ({
      label: r.year_month,
      count: r.count,
    }));
  }, [metrics]);

  const pipelinePieSlices = useMemo(() => {
    const rows = metrics?.pipeline_count_by_status ?? [];
    return rows
      .filter((r) => r.count > 0)
      .map((r) => ({
        name: formatStatus(r.status),
        value: r.count,
        status: r.status,
      }));
  }, [metrics]);

  const pipelinePieTotal = useMemo(
    () => (metrics?.pipeline_count_by_status ?? []).reduce((s, r) => s + r.count, 0),
    [metrics]
  );

  const dcNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of centers) m.set(c.id, c.name);
    return m;
  }, [centers]);

  const employeesByDcCode = useMemo(() => {
    const items = employeesData?.items ?? [];
    const map = new Map<string, { id: string }[]>();
    for (const e of items) {
      const code = e.delivery_center;
      if (!code) continue;
      if (!map.has(code)) map.set(code, []);
      map.get(code)!.push({ id: e.id });
    }
    return map;
  }, [employeesData]);

  const dcTableRows = useMemo(() => {
    return centers.map((dc, i) => {
      const act = forecastQueries[i * 2]?.data as FinancialForecastResponse | undefined;
      const fc = forecastQueries[i * 2 + 1]?.data as FinancialForecastResponse | undefined;
      const actErr = forecastQueries[i * 2]?.error;
      const fcErr = forecastQueries[i * 2 + 1]?.error;
      const utilRes = utilQueries[i]?.data;
      const utilErr = utilQueries[i]?.error;

      const ytdKeysAct = act ? calendarYtdMonthKeys(act.months) : [];
      const ytdKeysFc = fc ? calendarYtdMonthKeys(fc.months) : [];

      let revAct: number | null = null;
      let marginAct: number | null = null;
      if (act && ytdKeysAct.length) {
        revAct = sumRowAcrossMonths("net_income", ytdKeysAct, act.cells);
        marginAct = ytdNetMarginPctFromCells(ytdKeysAct, act.cells);
      }
      let revFc: number | null = null;
      let marginFc: number | null = null;
      if (fc && ytdKeysFc.length) {
        revFc = sumRowAcrossMonths("net_income", ytdKeysFc, fc.cells);
        marginFc = ytdNetMarginPctFromCells(ytdKeysFc, fc.cells);
      }

      const emps = employeesByDcCode.get(dc.code) ?? [];
      const ytdVals = emps
        .map((e) => utilRes?.utilization[e.id]?.ytd_utilization_pct)
        .filter((v): v is number => v != null && !Number.isNaN(v));
      const avgUtil = ytdVals.length ? ytdVals.reduce((a, b) => a + b, 0) / ytdVals.length : null;

      return {
        dc,
        revAct,
        marginAct,
        revFc,
        marginFc,
        avgUtil,
        currency: act?.currency ?? fc?.currency ?? dc.default_currency ?? "USD",
        actErr,
        fcErr,
        utilErr,
        loadingForecast: forecastQueries[i * 2]?.isPending || forecastQueries[i * 2 + 1]?.isPending,
        loadingUtil: utilQueries[i]?.isPending,
      };
    });
  }, [centers, forecastQueries, utilQueries, employeesByDcCode]);

  const asOf = new Date().toLocaleString();

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base max-w-2xl">
            Central view of pipeline health, closed revenue, delivery-center performance, and quick access to every
            workspace.
          </p>
          <p className="text-xs text-gray-400 mt-2">Figures as of {asOf} (local time).</p>
        </div>
      </div>

      {metricsError && (
        <Alert variant="destructive">
          <AlertDescription>Could not load opportunity metrics. Refresh or try again later.</AlertDescription>
        </Alert>
      )}

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Opportunity KPIs (USD)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            accent="sky"
            title="Avg. time to close"
            subtitle="Won deals, create → close (days)"
            value={
              metricsLoading
                ? "…"
                : metrics?.avg_days_to_close_won != null
                  ? `${Number(metrics.avg_days_to_close_won).toFixed(1)} d`
                  : "—"
            }
            hint={
              metrics?.avg_days_to_close_sample_size != null
                ? `${metrics.avg_days_to_close_sample_size} opportunities`
                : undefined
            }
          />
          <KpiCard
            accent="violet"
            title="Avg. value (Won)"
            subtitle="Mean forecast value USD"
            value={metricsLoading ? "…" : formatUsd0(metrics?.avg_forecast_usd_won ?? null)}
            hint={
              metrics?.avg_forecast_usd_won_sample_size != null
                ? `${metrics.avg_forecast_usd_won_sample_size} opportunities`
                : undefined
            }
          />
          <KpiCard
            accent="emerald"
            title="Pipeline forecast"
            subtitle="Open pipeline, sum forecast USD"
            value={metricsLoading ? "…" : formatUsd0(metrics?.pipeline_forecast_usd)}
          />
          <KpiCard
            accent="amber"
            title="Estimated revenue (Won)"
            subtitle="Sum forecast USD, won"
            value={metricsLoading ? "…" : formatUsd0(metrics?.estimated_revenue_usd)}
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Delivery center YTD</h2>
        <p className="text-sm text-gray-600 mb-3">
          Financial window: week of Jan 1 through current week; amounts use each center&apos;s forecast currency.
          Utilization uses calendar YTD (Jan through current month), averaged across employees in the center.
        </p>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-700">
              <tr>
                <th className="p-3 font-semibold sticky left-0 bg-gray-50 z-10">Delivery center</th>
                <th className="p-3 font-semibold">Currency</th>
                <th className="p-3 font-semibold text-right">Net revenue (actuals)</th>
                <th className="p-3 font-semibold text-right">Net margin % (actuals)</th>
                <th className="p-3 font-semibold text-right">Net revenue (forecast)</th>
                <th className="p-3 font-semibold text-right">Net margin % (forecast)</th>
                <th className="p-3 font-semibold text-right">YTD util. (avg)</th>
              </tr>
            </thead>
            <tbody>
              {dcTableRows.map((row) => (
                <tr key={row.dc.id} className="border-t border-gray-100">
                  <td className="p-3 font-medium text-gray-900 sticky left-0 bg-white">{row.dc.name}</td>
                  <td className="p-3 text-gray-600">{row.currency}</td>
                  <td className="p-3 text-right">
                    {row.actErr ? "—" : row.revAct != null ? formatMoney0(row.revAct, row.currency) : row.loadingForecast ? "…" : "—"}
                  </td>
                  <td className="p-3 text-right">
                    {row.actErr ? "—" : formatPct1(row.marginAct)}
                  </td>
                  <td className="p-3 text-right">
                    {row.fcErr ? "—" : row.revFc != null ? formatMoney0(row.revFc, row.currency) : row.loadingForecast ? "…" : "—"}
                  </td>
                  <td className="p-3 text-right">
                    {row.fcErr ? "—" : formatPct1(row.marginFc)}
                  </td>
                  <td className="p-3 text-right">
                    {row.utilErr ? "—" : row.loadingUtil ? "…" : formatPct1(row.avgUtil)}
                  </td>
                </tr>
              ))}
              {!centers.length && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-gray-500">
                    No delivery centers configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-lg font-semibold text-gray-900">Charts</h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ChartCard title="YoY closed revenue (USD)" subtitle="Won opportunities, stacked by delivery center">
            <StackedByDc
              data={yoyUsdChartData}
              dcIds={dcIdsOrdered}
              dcNameById={dcNameById}
              formatTick={(v) => formatUsd0(v)}
            />
          </ChartCard>
          <ChartCard title="YoY closed count" subtitle="Won opportunities, stacked by delivery center">
            <StackedByDc
              data={yoyCountChartData}
              dcIds={dcIdsOrdered}
              dcNameById={dcNameById}
              formatTick={(v) => String(v)}
            />
          </ChartCard>
          <ChartCard title="Sales funnel (USD)" subtitle="Open pipeline by status, stacked by delivery center">
            <StackedByDc
              data={funnelUsdChartData}
              dcIds={dcIdsOrdered}
              dcNameById={dcNameById}
              formatTick={(v) => formatUsd0(v)}
            />
          </ChartCard>
          <ChartCard title="Sales funnel (count)" subtitle="Open pipeline by status, stacked by delivery center">
            <StackedByDc
              data={funnelCountChartData}
              dcIds={dcIdsOrdered}
              dcNameById={dcNameById}
              formatTick={(v) => String(v)}
            />
          </ChartCard>
          <ChartCard title="Won opportunities by month" subtitle="Count by close month (YYYY-MM)">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={wonByMonthData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [v, "Won"]} />
                <Bar dataKey="count" fill="#2563eb" name="Won count" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard
            title="Pipeline mix"
            subtitle="All opportunities by status (count) — no status filter"
          >
            {pipelinePieTotal === 0 ? (
              <p className="text-sm text-gray-500 py-8 text-center">No opportunities yet.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pipelinePieSlices}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    >
                      {pipelinePieSlices.map((d, i) => (
                        <Cell
                          key={`${d.status}-${i}`}
                          fill={PIPELINE_MIX_PIE_COLORS[d.status] ?? DC_COLORS[i % DC_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <p className="text-xs text-gray-500 text-center mt-3 px-2">
                  {(metrics?.pipeline_count_by_status ?? [])
                    .map((r) => `${formatStatus(r.status)}: ${r.count}`)
                    .join(" · ")}
                </p>
              </>
            )}
          </ChartCard>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Quick navigation</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {navGroups.map((group, gi) => (
            <Card key={gi} className="border-gray-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{group.title ?? "General"}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 text-sm",
                        "text-gray-800 hover:bg-gray-50 hover:border-gray-200 transition-colors"
                      )}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {Icon && <Icon className="w-4 h-4 shrink-0 text-gray-500" />}
                        <span className="truncate font-medium">{item.title}</span>
                      </span>
                      <ArrowRight className="w-4 h-4 shrink-0 text-gray-400" />
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

const KPI_ACCENTS: Record<
  "sky" | "violet" | "emerald" | "amber",
  { border: string; bg: string; value: string }
> = {
  sky: {
    border: "border-l-sky-500/90",
    bg: "bg-gradient-to-br from-sky-50/70 via-white to-white",
    value: "text-sky-950",
  },
  violet: {
    border: "border-l-violet-500/90",
    bg: "bg-gradient-to-br from-violet-50/70 via-white to-white",
    value: "text-violet-950",
  },
  emerald: {
    border: "border-l-emerald-500/90",
    bg: "bg-gradient-to-br from-emerald-50/70 via-white to-white",
    value: "text-emerald-950",
  },
  amber: {
    border: "border-l-amber-500/90",
    bg: "bg-gradient-to-br from-amber-50/70 via-white to-white",
    value: "text-amber-950",
  },
};

function KpiCard({
  accent = "sky",
  title,
  subtitle,
  value,
  hint,
}: {
  accent?: keyof typeof KPI_ACCENTS;
  title: string;
  subtitle: string;
  value: string;
  hint?: string;
}) {
  const a = KPI_ACCENTS[accent];
  return (
    <Card
      className={cn(
        "border border-gray-200/80 border-l-4 shadow-sm overflow-hidden",
        a.border,
        a.bg
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-900">{title}</CardTitle>
        <p className="text-xs text-gray-500 font-normal">{subtitle}</p>
      </CardHeader>
      <CardContent>
        <p className={cn("text-2xl font-bold tabular-nums", a.value)}>{value}</p>
        {hint && <p className="text-xs text-gray-500 mt-2">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-gray-200 shadow-sm">
      <CardHeader className="pb-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-gray-500 font-normal">{subtitle}</p>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

function StackedByDc({
  data,
  dcIds,
  dcNameById,
  formatTick,
}: {
  data: Record<string, string | number>[];
  dcIds: string[];
  dcNameById: Map<string, string>;
  formatTick: (v: number) => string;
}) {
  if (!data.length) {
    return <p className="text-sm text-gray-500 py-8 text-center">No data for this view.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v) => formatTick(Number(v))} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: number) => formatTick(Number(v))} />
        <Legend />
        {dcIds.map((id, idx) => (
          <Bar
            key={id}
            dataKey={id}
            stackId="a"
            fill={DC_COLORS[idx % DC_COLORS.length]}
            name={dcNameById.get(id) ?? id}
            radius={[0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useStaffingForecast } from "@/hooks/useStaffingForecast";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useEmployees } from "@/hooks/useEmployees";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const CHART_COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#0891b2",
  "#ea580c", "#be185d", "#047857", "#4f46e5", "#0d9488",
  "#c2410c", "#7c3aed", "#0369a1", "#b91c1c", "#15803d",
];

const HIDDEN_EMPLOYEES_KEY = "staffing-forecast-hidden-employees";

function getThisWeekSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split("T")[0];
}

function loadHiddenEmployeeIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(HIDDEN_EMPLOYEES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {}
  return [];
}

function saveHiddenEmployeeIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HIDDEN_EMPLOYEES_KEY, JSON.stringify(ids));
  } catch {}
}

export default function StaffingForecastsPage() {
  const [startWeek, setStartWeek] = useState(getThisWeekSunday());
  const [deliveryCenterId, setDeliveryCenterId] = useState<string>("");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [billable, setBillable] = useState<"true" | "false" | "both">("true");
  const [durationMonths, setDurationMonths] = useState<3 | 6 | 12>(6);
  const [metric, setMetric] = useState<"hours" | "margin">("hours");
  const [hiddenEmployeeIds, setHiddenEmployeeIds] = useState<string[]>(() => loadHiddenEmployeeIds());

  useEffect(() => {
    saveHiddenEmployeeIds(hiddenEmployeeIds);
  }, [hiddenEmployeeIds]);

  const params = useMemo(
    () => ({
      start_week: startWeek,
      delivery_center_id: deliveryCenterId || undefined,
      employee_id: employeeId || undefined,
      billable,
      duration_months: durationMonths,
    }),
    [startWeek, deliveryCenterId, employeeId, billable, durationMonths]
  );

  const { data, isLoading, error } = useStaffingForecast(params);
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: employeesData } = useEmployees({ limit: 1000 });

  const deliveryCenters = deliveryCentersData?.items ?? [];
  const employees = useMemo(() => {
    const items = employeesData?.items ?? [];
    if (deliveryCenterId && deliveryCenters.length) {
      const selectedDC = deliveryCenters.find((dc) => dc.id === deliveryCenterId);
      if (selectedDC) {
        return items.filter((e) => e.delivery_center === selectedDC.code);
      }
    }
    return items;
  }, [employeesData?.items, deliveryCenterId, deliveryCenters]);

  const hideEmployee = useCallback((id: string) => {
    setHiddenEmployeeIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const showEmployee = useCallback((id: string) => {
    setHiddenEmployeeIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const visibleRows = useMemo(() => {
    if (!data?.rows) return [];
    return data.rows.filter((row) => {
      const empId = row.employee_id;
      if (!empId) return true;
      return !hiddenEmployeeIds.includes(empId);
    });
  }, [data?.rows, hiddenEmployeeIds]);

  const deepRed = { bg: "from-red-800/95 to-red-900/95", border: "border-red-800/70", intensity: 1, lightText: true };
  const roseRed = { bg: "from-rose-500/70 to-rose-600/80", border: "border-rose-500/50", intensity: 0.8, lightText: true };
  const violetOver = { bg: "from-violet-500/70 to-violet-600/80", border: "border-violet-500/50", intensity: 0.8, lightText: true };

  const getCellColor = (
    value: number,
    isMargin: boolean
  ): { bg: string; border: string; intensity: number; lightText: boolean } => {
    if (isMargin) {
      if (value >= 35) return { bg: "from-emerald-500/80 to-emerald-600/90", border: "border-emerald-600/50", intensity: 1, lightText: false };
      if (value >= 20 && value <= 35) return { bg: "from-amber-500/70 to-amber-600/80", border: "border-amber-500/50", intensity: 0.8, lightText: false };
      if (value < 20 && value > 0) return { ...roseRed };
      if (value <= 0) return deepRed; // Zero or negative margin = very bad
      return { bg: "from-slate-400/40 to-slate-500/50", border: "border-slate-400/30", intensity: 0.5, lightText: false };
    } else {
      if (value >= 36 && value <= 44) return { bg: "from-emerald-500/80 to-emerald-600/90", border: "border-emerald-600/50", intensity: 1, lightText: false };
      if ((value >= 20 && value < 36) || (value > 44 && value <= 60))
        return { bg: "from-amber-500/70 to-amber-600/80", border: "border-amber-500/50", intensity: 0.8, lightText: false };
      if (value === 0) return deepRed; // Zero hours = very bad
      if (value < 20) return { ...roseRed };
      if (value > 60) return { ...violetOver };
      return { bg: "from-slate-400/40 to-slate-500/50", border: "border-slate-400/30", intensity: 0.5, lightText: false };
    }
  };

  const formatCellValue = (cell: { hours: number; margin_pct?: number } | null, isMargin: boolean): string => {
    if (!cell) return "0";
    if (isMargin && cell.margin_pct != null) return `${cell.margin_pct.toFixed(1)}%`;
    return cell.hours.toFixed(1);
  };

  const formatWeekHeader = (weekStart: string): { month: string; day: string } => {
    const d = new Date(weekStart + "T12:00:00");
    return {
      month: d.toLocaleDateString("en-US", { month: "short" }),
      day: d.getDate().toString(),
    };
  };

  const formatWeekLabel = (weekStart: string): string => {
    const { month, day } = formatWeekHeader(weekStart);
    return `${month} ${day}`;
  };

  const displayYear = data?.weeks?.[0] ? new Date(data.weeks[0].week_start + "T12:00:00").getFullYear() : "";

  const chartData = useMemo(() => {
    if (!data?.weeks?.length || !data?.cells) return [];
    const isHours = metric === "hours";
    const atZeroThreshold = (v: number) => (isHours ? v === 0 : v <= 0);

    return data.weeks.map((w) => {
      const point: Record<string, string | number | null> = { week: formatWeekLabel(w.week_start) };
      let atZeroCount = 0;
      visibleRows.forEach((row) => {
        const cell = data.cells[row.row_key]?.[w.week_start];
        const raw = cell
          ? (isHours ? cell.hours : (cell.margin_pct ?? null))
          : (isHours ? 0 : null);
        const clamped = raw === null ? null : Math.max(0, Math.min(100, raw));
        point[row.row_key] = clamped;
        if (raw !== null && atZeroThreshold(raw)) atZeroCount++;
      });
      point.atZeroCount = atZeroCount;
      return point;
    });
  }, [data?.weeks, data?.cells, visibleRows, metric]);

  const chartSeries = useMemo(
    () => visibleRows.map((r) => ({
      key: r.row_key,
      name: `${r.delivery_center_name || "—"} · ${r.employee_name || r.role_name || "Unassigned"}`,
    })),
    [visibleRows]
  );

  const maxAtZero = useMemo(() => {
    if (!chartData.length) return 1;
    const max = Math.max(
      ...chartData.map((d) => (typeof d.atZeroCount === "number" ? d.atZeroCount : 0))
    );
    return Math.max(max, 1);
  }, [chartData]);

  const hiddenEmployeesDetail = useMemo(() => {
    const items = employeesData?.items ?? [];
    return hiddenEmployeeIds
      .map((id) => {
        const emp = items.find((e) => e.id === id);
        return emp ? { id, name: `${emp.first_name} ${emp.last_name}` } : null;
      })
      .filter(Boolean) as { id: string; name: string }[];
  }, [hiddenEmployeeIds, employeesData?.items]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Staffing Forecasts
        </h1>
        <p className="text-gray-600 mt-1 text-sm sm:text-base">
          360° view of employee commitments — identify understaffed or overstaffed periods
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="start-week" className="text-xs">Starting Week</Label>
            <input
              id="start-week"
              type="date"
              value={startWeek}
              onChange={(e) => setStartWeek(e.target.value)}
              className="h-9 rounded-md border border-gray-300 px-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dc" className="text-xs">Delivery Center</Label>
            <select
              id="dc"
              value={deliveryCenterId}
              onChange={(e) => {
                setDeliveryCenterId(e.target.value);
                setEmployeeId("");
              }}
              className="h-9 rounded-md border border-gray-300 px-2 text-sm min-w-[160px]"
            >
              <option value="">All</option>
              {deliveryCenters.map((dc) => (
                <option key={dc.id} value={dc.id}>
                  {dc.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="emp" className="text-xs">Employee</Label>
            <select
              id="emp"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="h-9 rounded-md border border-gray-300 px-2 text-sm min-w-[180px]"
            >
              <option value="">All</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Metric</Label>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={metric === "hours" ? "default" : "outline"}
                onClick={() => setMetric("hours")}
                className="h-9 text-xs"
              >
                Hours
              </Button>
              <Button
                size="sm"
                variant={metric === "margin" ? "default" : "outline"}
                onClick={() => setMetric("margin")}
                className="h-9 text-xs"
              >
                Margin
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Billable</Label>
            <div className="flex gap-1">
              {(["both", "true", "false"] as const).map((b) => (
                <Button
                  key={b}
                  size="sm"
                  variant={billable === b ? "default" : "outline"}
                  onClick={() => setBillable(b)}
                  className="h-9 text-xs capitalize"
                >
                  {b === "both" ? "Both" : b === "true" ? "Yes" : "No"}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Duration</Label>
            <div className="flex gap-1">
              {([3, 6, 12] as const).map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={durationMonths === d ? "default" : "outline"}
                  onClick={() => setDurationMonths(d)}
                  className="h-9 text-xs"
                >
                  {d} Mo
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grid */}
      <Card>
        <CardContent className="p-0">
          {isLoading && (
            <div className="p-8 text-center text-gray-500">Loading forecast...</div>
          )}
          {error && (
            <div className="p-8 text-center text-red-600">
              Error: {error instanceof Error ? error.message : String(error)}
            </div>
          )}
          {!isLoading && !error && data && (
            <div className="overflow-y-auto overflow-x-hidden max-h-[70vh] w-full">
              <div
                className="grid text-[9px] border-collapse w-full min-w-0"
                style={{
                  gridTemplateColumns: `minmax(100px, 1fr) minmax(120px, 1fr) repeat(${data.weeks.length}, minmax(0, 1fr))`,
                  gridTemplateRows: `auto auto ${hiddenEmployeesDetail.length > 0 ? "auto " : ""}repeat(${visibleRows.length}, auto)`,
                }}
              >
                <div className="row-span-2 p-2 font-semibold border-b border-r bg-gray-100 sticky top-0 z-10 flex items-center">
                  Delivery Center
                </div>
                <div className="row-span-2 p-2 font-semibold border-b border-r bg-gray-100 sticky top-0 z-10 flex items-center">
                  Resource
                </div>
                <div
                  className="p-1.5 font-semibold border-b text-center bg-gray-50 text-gray-600 sticky top-0 z-10"
                  style={{ gridColumn: `3 / ${3 + data.weeks.length}` }}
                >
                  {displayYear}
                </div>
                {data.weeks.map((w, i) => {
                  const { month, day } = formatWeekHeader(w.week_start);
                  return (
                    <div
                      key={w.week_start}
                      className="p-1 font-semibold border-b text-center bg-gray-100 sticky top-0 z-10 text-[8px] flex flex-col"
                      style={{ gridRow: 2, gridColumn: i + 3 }}
                    >
                      <span className="text-[7px] text-gray-500 leading-tight">{month}</span>
                      <span>{day}</span>
                    </div>
                  );
                })}
                {hiddenEmployeesDetail.length > 0 && (
                  <div
                    className="px-2 py-1 border-b border-r bg-gray-50 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9px]"
                    style={{ gridColumn: "1 / -1" }}
                  >
                    <span className="text-gray-500">Hidden:</span>
                    {hiddenEmployeesDetail.map(({ id, name }, idx) => (
                      <span key={id} className="inline-flex items-center gap-1">
                        {idx > 0 && <span className="text-gray-300">·</span>}
                        <button
                          type="button"
                          onClick={() => showEmployee(id)}
                          className="text-gray-600 hover:text-gray-900 hover:underline"
                        >
                          {name}
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {visibleRows.map((row) => (
                  <React.Fragment key={row.row_key}>
                    <div className="p-2 font-medium border-b border-r bg-white flex items-center hover:bg-gray-50/50">
                      {row.delivery_center_name || "—"}
                    </div>
                    <div className="p-2 font-medium border-b border-r bg-white flex items-center justify-between gap-1 group hover:bg-gray-50/50 min-w-0">
                      <span className="truncate">
                        {row.employee_name || row.role_name || "Unassigned"}
                      </span>
                      {row.employee_id && (
                        <button
                          type="button"
                          onClick={() => hideEmployee(row.employee_id!)}
                          className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 opacity-60 group-hover:opacity-100 transition-opacity"
                          title="Hide from forecast"
                          aria-label={`Hide ${row.employee_name || row.role_name}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        </button>
                      )}
                    </div>
                    {data.weeks.map((w) => {
                      const cell = data.cells[row.row_key]?.[w.week_start];
                      const isHours = metric === "hours";
                      const effectiveValue = cell
                        ? (isHours ? cell.hours : (cell.margin_pct ?? 0))
                        : (isHours ? 0 : null);
                      const displayValue = cell
                        ? formatCellValue(cell, !isHours)
                        : isHours
                        ? "0"
                        : "—";
                      const colorInfo =
                        effectiveValue !== null
                          ? getCellColor(effectiveValue, !isHours)
                          : { bg: "bg-slate-100", border: "border-slate-200", lightText: false };
                      const { bg, border, lightText } = colorInfo;

                      return (
                        <div
                          key={w.week_start}
                          className={cn(
                            "p-1 text-center border-b border-r flex items-center justify-center min-w-0",
                            effectiveValue !== null && `bg-gradient-to-br ${bg} ${border} border shadow-sm`
                          )}
                        >
                          <span
                            className={cn(
                              "cursor-help font-medium block",
                              effectiveValue !== null
                                ? lightText
                                  ? "text-white"
                                  : "text-gray-900"
                                : "text-gray-400"
                            )}
                            title={
                              cell
                                ? (isHours
                                    ? `Hours: ${cell.hours.toFixed(1)}\n\n`
                                    : `Margin: ${cell.margin_pct?.toFixed(1) ?? "—"}%\n\n`) +
                                  (cell.sources?.length
                                    ? "Sources:\n" +
                                      cell.sources
                                        .map(
                                          (s) =>
                                            `${s.source_type === "estimate" ? "Estimate" : "Engagement"}: ${s.opportunity_name} – ${s.hours.toFixed(1)}h (${s.label})`
                                        )
                                        .join("\n")
                                    : "")
                                : isHours
                                ? "Hours: 0 (no assignments)"
                                : ""
                            }
                          >
                            {displayValue}
                          </span>
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
          {!isLoading && !error && data && visibleRows.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              {data.rows.length === 0
                ? "No forecast data for the selected filters."
                : "All employees are hidden. Use Filters to show employees again."}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chart Visualization */}
      {!isLoading && !error && data && visibleRows.length > 0 && chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Forecast Trend — {metric === "hours" ? "Hours" : "Margin %"} (0–100, target {metric === "hours" ? "40" : "35"})
            </CardTitle>
            <p className="text-sm text-gray-500 mt-0.5">
              Gray bars show how many employees are at 0 — taller bars = more urgent understaffing
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 5, right: 45, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="hours"
                    domain={[0, 100]}
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="atZero"
                    orientation="right"
                    domain={[0, maxAtZero]}
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    allowDecimals={false}
                    label={{ value: "Employees at 0", angle: -90, position: "insideRight", fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={(value: number, name: string) => {
                      if (name === "Employees at 0" || name === "atZeroCount") return [value, "Employees at 0"];
                      return value != null ? `${value.toFixed(1)}${metric === "hours" ? "h" : "%"}` : "—";
                    }}
                    labelFormatter={(label) => `Week: ${label}`}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    iconType="line"
                    iconSize={12}
                  />
                  <ReferenceLine
                    yAxisId="hours"
                    y={metric === "hours" ? 40 : 35}
                    stroke="#6b7280"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                  />
                  <Bar
                    yAxisId="atZero"
                    dataKey="atZeroCount"
                    name="Employees at 0"
                    fill="#94a3b8"
                    fillOpacity={0.6}
                    radius={[2, 2, 0, 0]}
                    legendType="none"
                  />
                  {chartSeries.map(({ key, name }, idx) => (
                    <Line
                      key={key}
                      yAxisId="hours"
                      name={name}
                      type="monotone"
                      dataKey={key}
                      stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                      strokeWidth={2}
                      strokeOpacity={0.85}
                      strokeDasharray={idx % 3 === 0 ? undefined : idx % 3 === 1 ? "5 5" : "2 2"}
                      dot={{ r: 2 }}
                      activeDot={{ r: 4 }}
                      connectNulls
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

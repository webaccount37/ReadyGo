"use client";

import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { EngagementDetailResponse, ApprovedHoursByWeekResponse } from "@/types/engagement";

interface BudgetBurndownChartProps {
  engagement: EngagementDetailResponse;
  currency: string;
  approvedHoursByWeek?: ApprovedHoursByWeekResponse | null;
}

function parseLocalDate(dateStr: string): Date {
  const datePart = dateStr.split("T")[0];
  const [year, month, day] = datePart.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getSundayOfWeek(d: Date): Date {
  const dayOfWeek = d.getDay();
  const result = new Date(d);
  result.setDate(result.getDate() - dayOfWeek);
  return result;
}

export function BudgetBurndownChart({
  engagement,
  currency,
  approvedHoursByWeek,
}: BudgetBurndownChartProps) {
  const { chartData, lastActualWeekIndex } = useMemo(() => {
    const lineItems = engagement.line_items || [];
    if (lineItems.length === 0) {
      return { chartData: [], lastActualWeekIndex: -1 };
    }

    // Generate weeks (same logic as ResourcePlan)
    const weekDatesSet = new Set<string>();
    lineItems.forEach((item) => {
      if (item.weekly_hours) {
        item.weekly_hours.forEach((wh) => {
          weekDatesSet.add(wh.week_start_date);
        });
      }
    });

    const weeksFromHours: Date[] = [];
    weekDatesSet.forEach((weekDateStr) => {
      const parsedDate = parseLocalDate(weekDateStr);
      const weekDate = new Date(
        parsedDate.getFullYear(),
        parsedDate.getMonth(),
        parsedDate.getDate()
      );
      weeksFromHours.push(weekDate);
    });

    const dates = lineItems.flatMap((li) => [li.start_date, li.end_date]).filter(Boolean);
    const weeksList: Date[] = [];

    if (dates.length > 0) {
      const minDate = new Date(Math.min(...dates.map((d) => new Date(d).getTime())));
      const maxDate = new Date(Math.max(...dates.map((d) => new Date(d).getTime())));
      let current = getSundayOfWeek(minDate);
      const endWeekStart = getSundayOfWeek(maxDate);

      while (current <= endWeekStart) {
        weeksList.push(new Date(current));
        current = new Date(current);
        current.setDate(current.getDate() + 7);
      }
    }

    const allWeeksMap = new Map<string, Date>();
    weeksFromHours.forEach((week) => {
      const weekKey = formatDateKey(week);
      allWeeksMap.set(weekKey, week);
    });
    weeksList.forEach((week) => {
      const weekKey = formatDateKey(week);
      if (!allWeeksMap.has(weekKey)) {
        allWeeksMap.set(weekKey, week);
      }
    });

    const weeks = Array.from(allWeeksMap.values()).sort((a, b) => a.getTime() - b.getTime());

    // Compute plan revenue per week
    const planRevenueByWeek: Record<string, number> = {};
    weeks.forEach((week) => {
      const weekKey = formatDateKey(week);
      let revenue = 0;
      lineItems.forEach((item) => {
        const weekDate = week;
        const startDate = parseLocalDate(item.start_date);
        const endDate = parseLocalDate(item.end_date);
        const weekEnd = new Date(weekDate);
        weekEnd.setDate(weekEnd.getDate() + 6);

        if (weekDate <= endDate && weekEnd >= startDate) {
          const weeklyHour = item.weekly_hours?.find((wh) => {
            const whDate = parseLocalDate(wh.week_start_date);
            return formatDateKey(whDate) === weekKey;
          });
          const hours = parseFloat(weeklyHour?.hours || "0");
          const rate = parseFloat(item.rate || "0");
          revenue += item.billable ? hours * rate : 0;
        }
      });
      planRevenueByWeek[weekKey] = revenue;
    });

    // Compute actuals revenue per week from approvedHoursByWeek
    const actualsRevenueByWeek: Record<string, number> = {};
    if (approvedHoursByWeek?.by_week) {
      Object.entries(approvedHoursByWeek.by_week).forEach(([weekKey, data]) => {
        actualsRevenueByWeek[weekKey] = parseFloat(data.revenue || "0");
      });
    }

    // Build chart data with cumulative values
    let cumulativePlan = 0;
    let cumulativeActuals = 0;
    let lastActualIdx = -1;

    const data = weeks.map((week, index) => {
      const weekKey = formatDateKey(week);
      const planRev = planRevenueByWeek[weekKey] ?? 0;
      const actualsRev = actualsRevenueByWeek[weekKey] ?? 0;

      cumulativePlan += planRev;
      cumulativeActuals += actualsRev;
      if (actualsRev > 0) {
        lastActualIdx = index;
      }

      return {
        week: week.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }),
        weekKey,
        planCumulative: Math.round(cumulativePlan * 100) / 100,
        actualsCumulative: cumulativeActuals > 0 ? Math.round(cumulativeActuals * 100) / 100 : null,
        planWeekly: planRev,
        actualsWeekly: actualsRev,
      };
    });

    // Forecast: for weeks after last actual, extend actuals with plan
    let forecastCumulative = 0;
    const dataWithForecast = data.map((row, index) => {
      if (index <= lastActualIdx) {
        forecastCumulative = row.actualsCumulative ?? 0;
      } else {
        forecastCumulative += row.planWeekly;
      }
      return {
        ...row,
        forecastCumulative: Math.round(forecastCumulative * 100) / 100,
      };
    });

    return { chartData: dataWithForecast, lastActualWeekIndex: lastActualIdx };
  }, [engagement.line_items, approvedHoursByWeek]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  if (chartData.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-4">
        No budget data available. Add line items with weekly hours to see the chart.
      </div>
    );
  }

  return (
    <div className="w-full h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v) => formatCurrency(v)}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            labelFormatter={(_, payload) =>
              payload?.[0]?.payload?.week ? `Week: ${payload[0].payload.week}` : ""
            }
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="planCumulative"
            name="Plan (Budget)"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="actualsCumulative"
            name="Actuals (Invoice)"
            stroke="#22C55E"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="forecastCumulative"
            name="Forecast"
            stroke="#94A3B8"
            strokeWidth={1.5}
            strokeDasharray="5 5"
            dot={false}
          />
          {lastActualWeekIndex >= 0 && lastActualWeekIndex < chartData.length - 1 && chartData[lastActualWeekIndex]?.week && (
            <ReferenceLine
              x={chartData[lastActualWeekIndex].week}
              stroke="#64748B"
              strokeDasharray="3 3"
              label={{ value: "Last actuals", position: "top" }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-500 mt-2">
        Plan: cumulative budget by week. Actuals: cumulative invoice amount from approved timesheets.
        Forecast: actuals extended with plan for future weeks.
      </p>
    </div>
  );
}

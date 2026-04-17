/**
 * Period totals for Financial Forecast dashboard (matches Financial Forecasts page logic).
 */

import type { FinancialForecastMonth } from "@/lib/api/financial-forecast";

export function calendarYtdMonthKeys(months: FinancialForecastMonth[], today = new Date()): string[] {
  const y = today.getFullYear();
  const maxM = today.getMonth() + 1;
  return months.filter((m) => m.year === y && m.month >= 1 && m.month <= maxM).map((m) => m.month_key);
}

export function sumRowAcrossMonths(
  rowKey: string,
  monthKeys: string[],
  cells: Record<string, Record<string, { value?: number }>>
): number {
  let sum = 0;
  for (const mk of monthKeys) {
    sum += Number(cells[rowKey]?.[mk]?.value ?? 0);
  }
  return sum;
}

/** Net margin % as Σ(net_income) / Σ(total_income) over months. */
export function ytdNetMarginPctFromCells(
  monthKeys: string[],
  cells: Record<string, Record<string, { value?: number }>>
): number | null {
  const ni = sumRowAcrossMonths("net_income", monthKeys, cells);
  const ti = sumRowAcrossMonths("total_income", monthKeys, cells);
  if (!ti) return null;
  return Math.round((ni / ti) * 1000) / 10;
}

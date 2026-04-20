"use client";

import React, { useMemo } from "react";
import type { Quote, QuoteLineItem } from "@/types/quote";
import {
  computeScopedLineMoney,
  opportunityWeeksFromStrings,
  type LineItemLike,
} from "@/lib/planning-week-totals";

interface QuoteReadonlyTableProps {
  quote: Quote;
  /** Prefer live opportunity dates; snapshot is used when these are missing. */
  opportunityStartDate?: string | null;
  opportunityEndDate?: string | null;
}

export function QuoteReadonlyTable({
  quote,
  opportunityStartDate,
  opportunityEndDate,
}: QuoteReadonlyTableProps) {
  const snapStart =
    typeof quote.snapshot_data?.start_date === "string" ? quote.snapshot_data.start_date : null;
  const snapEnd =
    typeof quote.snapshot_data?.end_date === "string" ? quote.snapshot_data.end_date : null;

  const scopedWeeks = useMemo(() => {
    const startEff = opportunityStartDate ?? snapStart;
    const endEff = opportunityEndDate ?? snapEnd;
    return opportunityWeeksFromStrings(startEff, endEff);
  }, [opportunityStartDate, opportunityEndDate, snapStart, snapEnd]);

  const totals = useMemo(() => {
    let totalCost = 0;
    let totalRevenue = 0;
    let totalHours = 0;

    (quote.line_items ?? []).forEach((item) => {
      const { hours, cost, revenue } = computeScopedLineMoney(item as LineItemLike, scopedWeeks);
      totalHours += hours;
      totalCost += cost;
      totalRevenue += revenue;
    });

    return { totalHours, totalCost, totalRevenue, margin: totalRevenue - totalCost };
  }, [quote.line_items, scopedWeeks]);

  if (!quote.line_items || quote.line_items.length === 0) {
    return <p className="text-gray-500 text-sm">No line items in this quote.</p>;
  }

  // Calculate weeks from all line items (column headers)
  const allWeeks = new Set<string>();
  quote.line_items.forEach((item) => {
    if (item.weekly_hours) {
      item.weekly_hours.forEach((wh) => {
        allWeeks.add(wh.week_start_date);
      });
    }
  });

  const sortedWeeks = Array.from(allWeeks).sort();

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getHoursForWeek = (lineItem: QuoteLineItem, weekStartDate: string): string => {
    const weeklyHour = lineItem.weekly_hours?.find((wh) => wh.week_start_date === weekStartDate);
    return weeklyHour ? parseFloat(weeklyHour.hours).toFixed(2) : "0.00";
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse border border-gray-300 text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="border border-gray-300 px-2 py-1 text-left font-semibold sticky left-0 bg-gray-50 z-10">
              Role
            </th>
            <th className="border border-gray-300 px-2 py-1 text-left font-semibold">Delivery Center</th>
            <th className="border border-gray-300 px-2 py-1 text-left font-semibold">Payable Center</th>
            <th className="border border-gray-300 px-2 py-1 text-left font-semibold">Employee</th>
            <th className="border border-gray-300 px-2 py-1 text-right font-semibold">Cost</th>
            <th className="border border-gray-300 px-2 py-1 text-right font-semibold">Rate</th>
            <th className="border border-gray-300 px-2 py-1 text-left font-semibold">Currency</th>
            <th className="border border-gray-300 px-2 py-1 text-left font-semibold">Start Date</th>
            <th className="border border-gray-300 px-2 py-1 text-left font-semibold">End Date</th>
            <th className="border border-gray-300 px-2 py-1 text-center font-semibold">Billable</th>
            {sortedWeeks.map((week) => (
              <th key={week} className="border border-gray-300 px-1 py-1 text-center font-semibold min-w-[60px]">
                {formatDate(week)}
              </th>
            ))}
            <th className="border border-gray-300 px-2 py-1 text-right font-semibold bg-gray-100">Total Hours</th>
            <th className="border border-gray-300 px-2 py-1 text-right font-semibold bg-gray-100">Total Cost</th>
            <th className="border border-gray-300 px-2 py-1 text-right font-semibold bg-gray-100">Total Revenue</th>
          </tr>
        </thead>
        <tbody>
          {quote.line_items
            .sort((a, b) => a.row_order - b.row_order)
            .map((item) => {
              const { hours: itemHours, cost: itemCost, revenue: itemRevenue } = computeScopedLineMoney(
                item as LineItemLike,
                scopedWeeks,
              );

              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="border border-gray-300 px-2 py-1 sticky left-0 bg-white z-10">
                    {item.role_name || "N/A"}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {item.delivery_center_name || "N/A"}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {item.payable_center_name || "N/A"}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {item.employee_name || "N/A"}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-right">
                    {parseFloat(item.cost || "0").toFixed(2)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-right">
                    {parseFloat(item.rate || "0").toFixed(2)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {item.currency}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {new Date(item.start_date).toLocaleDateString()}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {new Date(item.end_date).toLocaleDateString()}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-center">
                    {item.billable ? "Yes" : "No"}
                  </td>
                  {sortedWeeks.map((week) => (
                    <td key={week} className="border border-gray-300 px-1 py-1 text-center">
                      {getHoursForWeek(item, week)}
                    </td>
                  ))}
                  <td className="border border-gray-300 px-2 py-1 text-right bg-gray-50 font-semibold">
                    {itemHours.toFixed(2)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-right bg-gray-50 font-semibold">
                    {itemCost.toFixed(2)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-right bg-gray-50 font-semibold">
                    {itemRevenue.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          <tr className="bg-gray-100 font-bold">
            <td colSpan={10 + sortedWeeks.length} className="border border-gray-300 px-2 py-1 text-right">
              TOTALS
            </td>
            <td className="border border-gray-300 px-2 py-1 text-right">
              {totals.totalHours.toFixed(2)}
            </td>
            <td className="border border-gray-300 px-2 py-1 text-right">
              {totals.totalCost.toFixed(2)}
            </td>
            <td className="border border-gray-300 px-2 py-1 text-right">
              {totals.totalRevenue.toFixed(2)}
            </td>
          </tr>
          <tr className="bg-gray-100 font-bold">
            <td colSpan={10 + sortedWeeks.length} className="border border-gray-300 px-2 py-1 text-right">
              MARGIN
            </td>
            <td colSpan={2} className="border border-gray-300 px-2 py-1 text-right">
              {totals.margin.toFixed(2)}
            </td>
            <td className="border border-gray-300 px-2 py-1 text-right">
              {totals.totalRevenue > 0 ? ((totals.margin / totals.totalRevenue) * 100).toFixed(2) + "%" : "0.00%"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

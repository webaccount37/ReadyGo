"use client";

import type { EstimateLineItem } from "@/types/estimate";

interface EstimateTotalsRowProps {
  lineItems: EstimateLineItem[];
  weeks: Date[];
  currency: string;
}

export function EstimateTotalsRow({
  lineItems,
  weeks,
  currency,
}: EstimateTotalsRowProps) {
  // Calculate weekly totals
  const weeklyTotals = weeks.map((week) => {
    const weekKey = week.toISOString().split("T")[0];
    let totalHours = 0;
    let totalCost = 0;
    let totalRevenue = 0;

    lineItems.forEach((item) => {
      const weekDate = new Date(week);
      const startDate = new Date(item.start_date);
      const endDate = new Date(item.end_date);

      if (weekDate >= startDate && weekDate <= endDate) {
        const weeklyHour = item.weekly_hours?.find(
          (wh) => new Date(wh.week_start_date).toISOString().split("T")[0] === weekKey
        );
        const hours = parseFloat(weeklyHour?.hours || "0");
        const rate = parseFloat(item.rate || "0");
        const costRate = parseFloat(item.cost || "0");

        totalHours += hours;
        totalCost += hours * costRate;
        totalRevenue += hours * rate;
      }
    });

    return { totalHours, totalCost, totalRevenue };
  });

  // Calculate overall totals
  const overallTotalHours = weeklyTotals.reduce(
    (sum, week) => sum + week.totalHours,
    0
  );
  const overallTotalCost = weeklyTotals.reduce(
    (sum, week) => sum + week.totalCost,
    0
  );
  const overallTotalRevenue = weeklyTotals.reduce(
    (sum, week) => sum + week.totalRevenue,
    0
  );

  return (
    <tr className="bg-gray-100 font-semibold">
      <td
        colSpan={7}
        className="bg-gray-100 border border-gray-300 px-2 py-2 text-xs"
      >
        TOTALS
      </td>
      {weeklyTotals.map((week, index) => (
        <td
          key={index}
          className="border border-gray-300 px-1 py-2 text-xs text-center"
        >
          {week.totalHours > 0 ? week.totalHours.toFixed(1) : "-"}
        </td>
      ))}
      <td className="sticky right-[200px] z-10 bg-gray-100 border border-gray-300 px-2 py-2 text-xs">
        {overallTotalHours.toFixed(1)}
      </td>
      <td className="sticky right-[100px] z-10 bg-gray-100 border border-gray-300 px-2 py-2 text-xs">
        {currency} {overallTotalCost.toFixed(2)}
      </td>
      <td className="sticky right-0 z-10 bg-gray-100 border border-gray-300 px-2 py-2 text-xs">
        {currency} {overallTotalRevenue.toFixed(2)}
      </td>
      <td className="border border-gray-300 px-2 py-2"></td>
    </tr>
  );
}


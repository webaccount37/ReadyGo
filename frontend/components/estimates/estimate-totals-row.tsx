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
  // Helper function to format date as YYYY-MM-DD string (local date, no timezone conversion)
  const formatDateKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Helper function to parse date string as local date
  const parseLocalDate = (dateStr: string): Date => {
    const datePart = dateStr.split("T")[0];
    const [year, month, day] = datePart.split("-").map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed in JS
  };

  // Calculate weekly totals
  const weeklyTotals = weeks.map((week) => {
    const weekKey = formatDateKey(week);
    let totalHours = 0;
    let totalCost = 0;
    let totalRevenue = 0;

    lineItems.forEach((item) => {
      const weekDate = week; // week is already a Date object
      const startDate = parseLocalDate(item.start_date);
      const endDate = parseLocalDate(item.end_date);

      // Check if week overlaps with item date range (week starts Sunday, ends Saturday)
      const weekEnd = new Date(weekDate);
      weekEnd.setDate(weekEnd.getDate() + 6); // End of week (Saturday)

      if (weekDate <= endDate && weekEnd >= startDate) {
        const weeklyHour = item.weekly_hours?.find((wh) => {
          const whDate = parseLocalDate(wh.week_start_date);
          return formatDateKey(whDate) === weekKey;
        });
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
  
  // Calculate billable expense totals
  let overallBillableExpenseAmount = 0;
  lineItems.forEach((item) => {
    const billableExpensePercentage = parseFloat(item.billable_expense_percentage || "0");
    // Calculate total revenue for this item
    let itemTotalRevenue = 0;
    weeklyTotals.forEach((week, weekIndex) => {
      const weekKey = formatDateKey(weeks[weekIndex]);
      const weekDate = weeks[weekIndex];
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
        itemTotalRevenue += hours * rate;
      }
    });
    overallBillableExpenseAmount += (billableExpensePercentage / 100) * itemTotalRevenue;
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
  const overallMarginAmount = overallTotalRevenue - overallTotalCost;
  // Margin % with expenses: (revenue - cost) / (revenue + expenses)
  const overallMarginPercentageWithExpenses = (overallTotalRevenue + overallBillableExpenseAmount) > 0 
    ? (overallMarginAmount / (overallTotalRevenue + overallBillableExpenseAmount)) * 100 
    : 0;
  // Margin % without expenses: (revenue - cost) / revenue
  const overallMarginPercentageWithoutExpenses = overallTotalRevenue > 0 
    ? (overallMarginAmount / overallTotalRevenue) * 100 
    : 0;

  return (
    <tr className="bg-gray-100 font-semibold">
      <td
        colSpan={12}
        className="bg-gray-100 border border-gray-300 px-2 py-2 text-xs"
      >
        TOTALS
      </td>
      {weeklyTotals.map((week, index) => (
        <td
          key={index}
          className="border border-gray-300 px-1 py-2 text-xs text-center"
          style={{ width: '120px', minWidth: '120px' }}
        >
          {week.totalHours > 0 ? week.totalHours.toFixed(1) : "-"}
        </td>
      ))}
      <td className="sticky right-0 z-10 bg-gray-100 border border-gray-300 px-2 py-2 text-xs">
        {overallTotalHours.toFixed(1)}
      </td>
      <td className="border border-gray-300 px-2 py-2 text-xs">
        {currency} {overallTotalCost.toFixed(2)}
      </td>
      <td className="border border-gray-300 px-2 py-2 text-xs">
        {currency} {overallTotalRevenue.toFixed(2)}
      </td>
      <td className="border border-gray-300 px-2 py-2 text-xs bg-gray-50">
        {currency} {overallBillableExpenseAmount.toFixed(2)}
      </td>
      <td className="border border-gray-300 px-2 py-2 text-xs">
        {currency} {overallMarginAmount.toFixed(2)}
      </td>
      <td className="border border-gray-300 px-2 py-2 text-xs">
        {overallMarginPercentageWithoutExpenses.toFixed(1)}%
      </td>
      <td className="border border-gray-300 px-2 py-2 text-xs">
        {overallMarginPercentageWithExpenses.toFixed(1)}%
      </td>
      <td className="border border-gray-300 px-2 py-2"></td>
    </tr>
  );
}


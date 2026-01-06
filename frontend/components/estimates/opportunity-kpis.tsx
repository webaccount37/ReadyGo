"use client";

import { useMemo } from "react";
import { useEstimateDetail } from "@/hooks/useEstimates";
import { useOpportunity } from "@/hooks/useOpportunities";
import { Card } from "@/components/ui/card";
import type { Estimate, EstimateDetailResponse } from "@/types/estimate";

interface OpportunityKPIsProps {
  estimates: Estimate[];
}

export function OpportunityKPIs({ estimates }: OpportunityKPIsProps) {
  // Find the active version estimate
  const activeEstimate = useMemo(() => {
    return estimates.find((est) => est.active_version === true);
  }, [estimates]);

  // Only fetch detail data for the active version estimate
  const { data: estimateDetail, isLoading: isLoadingEstimate } = useEstimateDetail(
    activeEstimate?.id || "",
    { enabled: !!activeEstimate?.id }
  );

  // Fetch opportunity to get the correct currency
  const { data: opportunity, isLoading: isLoadingOpportunity } = useOpportunity(
    activeEstimate?.opportunity_id || "",
    false, // includeRelationships
    { enabled: !!activeEstimate?.opportunity_id }
  );

  // Calculate KPIs from fetched data (only for active version)
  const kpis = useMemo(() => {
    if (!estimateDetail || !estimateDetail.line_items || estimateDetail.line_items.length === 0) {
      return null;
    }

    const parseLocalDate = (dateStr: string): Date => {
      const datePart = dateStr.split("T")[0];
      const [year, month, day] = datePart.split("-").map(Number);
      return new Date(year, month - 1, day);
    };

    const formatDateKey = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    let totalCost = 0;
    let totalRevenue = 0;

    // Get date range from phases or line items
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (estimateDetail.phases && estimateDetail.phases.length > 0) {
      const phaseDates = estimateDetail.phases.map((p) => ({
        start: parseLocalDate(p.start_date),
        end: parseLocalDate(p.end_date),
      }));
      startDate = new Date(Math.min(...phaseDates.map((p) => p.start.getTime())));
      endDate = new Date(Math.max(...phaseDates.map((p) => p.end.getTime())));
    } else if (estimateDetail.line_items.length > 0) {
      const itemDates = estimateDetail.line_items.map((item) => ({
        start: parseLocalDate(item.start_date),
        end: parseLocalDate(item.end_date),
      }));
      startDate = new Date(Math.min(...itemDates.map((d) => d.start.getTime())));
      endDate = new Date(Math.max(...itemDates.map((d) => d.end.getTime())));
    }

    if (!startDate || !endDate) {
      return null;
    }

    // Generate weeks
    const weeks: Date[] = [];
    const current = new Date(startDate);
    const dayOfWeek = current.getDay();
    const diff = current.getDate() - dayOfWeek;
    current.setDate(diff);

    while (current <= endDate) {
      const weekStart = new Date(current);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      if (weekStart <= endDate && weekEnd >= startDate) {
        weeks.push(new Date(weekStart));
      }
      current.setDate(current.getDate() + 7);
    }

    // Calculate totals for the active estimate
    estimateDetail.line_items.forEach((item) => {
      const itemHours = weeks.reduce((hoursSum, week) => {
        const weekKey = formatDateKey(week);
        const weekDate = week;
        const itemStartDate = parseLocalDate(item.start_date);
        const itemEndDate = parseLocalDate(item.end_date);
        const weekEnd = new Date(weekDate);
        weekEnd.setDate(weekEnd.getDate() + 6);

        if (weekDate <= itemEndDate && weekEnd >= itemStartDate) {
          const weeklyHour = item.weekly_hours?.find((wh) => {
            const whDate = parseLocalDate(wh.week_start_date);
            return formatDateKey(whDate) === weekKey;
          });
          return hoursSum + parseFloat(weeklyHour?.hours || "0");
        }
        return hoursSum;
      }, 0);

      const itemCost = itemHours * parseFloat(item.cost || "0");
      const itemRevenue = itemHours * parseFloat(item.rate || "0");

      totalCost += itemCost;
      totalRevenue += itemRevenue;
    });

    const marginAmount = totalRevenue - totalCost;
    const marginPercentage = totalRevenue > 0 ? (marginAmount / totalRevenue) * 100 : 0;

    // Use opportunity's default_currency as the correct currency (same as estimate detail page)
    const currency = opportunity?.default_currency || estimateDetail.currency || "USD";

    return {
      totalCost,
      totalRevenue,
      marginAmount,
      marginPercentage,
      currency,
    };
  }, [estimateDetail, opportunity]);

  if (isLoadingEstimate || isLoadingOpportunity) {
    return (
      <div className="text-sm text-gray-500">Loading KPIs...</div>
    );
  }

  if (!activeEstimate) {
    return (
      <div className="text-sm text-gray-500">No active version</div>
    );
  }

  if (!kpis) {
    return (
      <div className="text-sm text-gray-500">No data available</div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Card className="p-2">
          <div className="text-xs text-gray-600">Total Cost</div>
          <div className="text-sm font-bold">
            {kpis.currency} {kpis.totalCost.toFixed(2)}
          </div>
        </Card>
        <Card className="p-2">
          <div className="text-xs text-gray-600">Total Revenue</div>
          <div className="text-sm font-bold">
            {kpis.currency} {kpis.totalRevenue.toFixed(2)}
          </div>
        </Card>
        <Card className="p-2">
          <div className="text-xs text-gray-600">Margin Amount</div>
          <div className="text-sm font-bold">
            {kpis.currency} {kpis.marginAmount.toFixed(2)}
          </div>
        </Card>
        <Card className="p-2">
          <div className="text-xs text-gray-600">Margin %</div>
          <div className="text-sm font-bold">
            {kpis.marginPercentage.toFixed(1)}%
          </div>
        </Card>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useMemo } from "react";
import type { EstimateDetailResponse } from "@/types/estimate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type GanttTimeRange = "1m" | "6m" | "1y" | "2y";

interface EstimateGanttViewProps {
  estimate: EstimateDetailResponse;
}

export function EstimateGanttView({ estimate }: EstimateGanttViewProps) {
  const [timeRange, setTimeRange] = useState<GanttTimeRange>("1y");

  // Calculate the full timeline from earliest start to latest end date
  const timelineBounds = useMemo(() => {
    if (!estimate.line_items || estimate.line_items.length === 0) {
      // Default to current year if no line items
      const today = new Date();
      return {
        start: new Date(today.getFullYear(), 0, 1), // Jan 1 of current year
        end: new Date(today.getFullYear() + 1, 0, 1), // Jan 1 of next year
      };
    }

    let earliestStart = new Date(estimate.line_items[0].start_date);
    let latestEnd = new Date(estimate.line_items[0].end_date);

    estimate.line_items.forEach((item) => {
      const startDate = new Date(item.start_date);
      const endDate = new Date(item.end_date);
      if (startDate < earliestStart) earliestStart = startDate;
      if (endDate > latestEnd) latestEnd = endDate;
    });

    // Add some padding (1 month before, 1 month after)
    earliestStart.setMonth(earliestStart.getMonth() - 1);
    latestEnd.setMonth(latestEnd.getMonth() + 1);

    return { start: earliestStart, end: latestEnd };
  }, [estimate.line_items]);

  // Generate time periods based on time range granularity
  const timePeriods = useMemo(() => {
    const { start, end } = timelineBounds;
    const periods: Date[] = [];
    const current = new Date(start);

    // Set to first of the period based on granularity
    if (timeRange === "1m") {
      // Monthly columns
      current.setDate(1);
      while (current <= end) {
        periods.push(new Date(current));
        current.setMonth(current.getMonth() + 1);
      }
    } else if (timeRange === "6m") {
      // Half-yearly columns (every 6 months)
      current.setDate(1);
      current.setMonth(Math.floor(current.getMonth() / 6) * 6); // Round down to nearest half-year
      while (current <= end) {
        periods.push(new Date(current));
        current.setMonth(current.getMonth() + 6);
      }
    } else {
      // Yearly columns (1Y or 2Y)
      current.setDate(1);
      current.setMonth(0); // January
      while (current <= end) {
        periods.push(new Date(current));
        current.setFullYear(current.getFullYear() + 1);
      }
    }

    return periods;
  }, [timeRange, timelineBounds]);


  // Calculate phase loadings per period (merged/aggregated)
  const calculatePhaseLoadings = useMemo(() => {
    const loadings: Map<string, Map<string, number>> = new Map(); // phase -> period -> total hours
    
    // Determine if we have any phases - phases are now time-based overlays, not assigned to line items
    // Group all line items under "All Loadings" since phases are visual overlays
    const defaultPhaseName = "All Loadings";
    
    estimate.line_items?.forEach((item) => {
      const phase = defaultPhaseName;
      
      if (!loadings.has(phase)) {
        loadings.set(phase, new Map());
      }
      
      const phaseLoadings = loadings.get(phase)!;
      const startDate = new Date(item.start_date);
      const endDate = new Date(item.end_date);
      
      timePeriods.forEach((period) => {
        // Calculate period boundaries based on granularity
        const periodStart = new Date(period);
        const periodEnd = new Date(period);
        
        if (timeRange === "1m") {
          periodEnd.setMonth(periodEnd.getMonth() + 1);
        } else if (timeRange === "6m") {
          periodEnd.setMonth(periodEnd.getMonth() + 6);
        } else {
          // Yearly
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        }
        
        // Check if line item overlaps with this period
        if (startDate < periodEnd && endDate >= periodStart) {
          // Use period start date as key
          const periodKey = period.toISOString().split("T")[0];
          const currentHours = phaseLoadings.get(periodKey) || 0;
          
          // Calculate hours for this period from weekly_hours
          // Only count if weekly_hours exist and have actual hours > 0
          let periodHours = 0;
          if (item.weekly_hours && item.weekly_hours.length > 0) {
            // Sum hours for weeks that fall within this period
            item.weekly_hours.forEach((wh) => {
              const weekDate = new Date(wh.week_start_date);
              if (weekDate >= periodStart && weekDate < periodEnd) {
                const hours = parseFloat(wh.hours || "0");
                if (hours > 0) {
                  periodHours += hours;
                }
              }
            });
          }
          // Don't add anything if no weekly_hours exist or all are 0
          
          if (periodHours > 0) {
            phaseLoadings.set(periodKey, currentHours + periodHours);
          }
        }
      });
    });
    
    return loadings;
  }, [estimate.line_items, timePeriods, timeRange]);

  // Find min and max loadings for color scaling (across all phases)
  const { minLoading, maxLoading } = useMemo(() => {
    let min = Infinity;
    let max = 0;
    
    calculatePhaseLoadings.forEach((phaseLoadings) => {
      phaseLoadings.forEach((hours) => {
        if (hours > max) max = hours;
        if (hours < min) min = hours;
      });
    });
    
    return {
      minLoading: min === Infinity ? 0 : min,
      maxLoading: max,
    };
  }, [calculatePhaseLoadings]);

  // Get color based on loading (gradient from light blue to dark blue)
  const getLoadingColor = (hours: number) => {
    if (maxLoading === 0) return "bg-blue-50";
    
    const ratio = (hours - minLoading) / (maxLoading - minLoading || 1);
    const intensity = Math.min(1, Math.max(0, ratio));
    
    // Gradient from light blue (50) to dark blue (700)
    if (intensity < 0.25) return "bg-blue-50";
    if (intensity < 0.5) return "bg-blue-100";
    if (intensity < 0.75) return "bg-blue-300";
    return "bg-blue-500";
  };

  // Get phases sorted (Default/Unassigned last if exists)
  const phases = useMemo(() => {
    const phaseSet = new Set<string>();
    // Phases are now time-based overlays, not assigned to line items
    const hasPhases = false;
    const defaultPhaseName = hasPhases ? "Unassigned" : "Default";
    
    estimate.line_items?.forEach((_item) => {
      phaseSet.add(defaultPhaseName);
    });
    const phaseList = Array.from(phaseSet);
    // Sort: Default/Unassigned last, others alphabetically
    return phaseList.sort((a, b) => {
      if (a === "Default" || a === "Unassigned") return 1;
      if (b === "Default" || b === "Unassigned") return -1;
      return a.localeCompare(b);
    });
  }, [estimate.line_items]);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Gantt View - Employee Loadings</CardTitle>
          <div className="flex gap-2">
            <Button
              variant={timeRange === "1m" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeRange("1m")}
            >
              1M
            </Button>
            <Button
              variant={timeRange === "6m" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeRange("6m")}
            >
              6M
            </Button>
            <Button
              variant={timeRange === "1y" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeRange("1y")}
            >
              1Y
            </Button>
            <Button
              variant={timeRange === "2y" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeRange("2y")}
            >
              2Y
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-hidden">
        <div className="overflow-x-auto" style={{ maxWidth: "calc(100vw - 2rem)" }}>
          <div className="inline-block min-w-full">
            <table className="border-collapse text-sm" style={{ minWidth: "max-content" }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-white border border-gray-300 px-4 py-3 text-left text-sm font-semibold w-[200px]">
                    Phase
                  </th>
                  {timePeriods.map((period) => {
                    let label = "";
                    let title = "";
                    
                    if (timeRange === "1m") {
                      label = period.toLocaleDateString("en-US", {
                        month: "short",
                        year: "numeric",
                      });
                      title = period.toLocaleDateString("en-US", { month: "long", year: "numeric" });
                    } else if (timeRange === "6m") {
                      const endPeriod = new Date(period);
                      endPeriod.setMonth(endPeriod.getMonth() + 6);
                      label = `${period.toLocaleDateString("en-US", { month: "short", year: "numeric" })} - ${endPeriod.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
                      title = `${period.toLocaleDateString("en-US", { month: "long", year: "numeric" })} to ${endPeriod.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
                    } else {
                      label = period.toLocaleDateString("en-US", { year: "numeric" });
                      title = `${period.getFullYear()}`;
                    }
                    
                    return (
                      <th
                        key={period.toISOString()}
                        className="border border-gray-300 px-3 py-3 text-sm font-semibold w-[120px] text-center"
                        title={title}
                      >
                        {label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {phases.length === 0 ? (
                  // No phases - show one big group with all loadings
                  <tr className="hover:bg-gray-50">
                    <td className="sticky left-0 z-10 bg-white border border-gray-300 px-4 py-4 text-sm font-semibold">
                      All Loadings
                    </td>
                    {timePeriods.map((period) => {
                      // const periodKey = period.toISOString().split("T")[0];
                      // Calculate period boundaries based on granularity
                      const periodStart = new Date(period);
                      const periodEnd = new Date(period);
                      
                      if (timeRange === "1m") {
                        periodEnd.setMonth(periodEnd.getMonth() + 1);
                      } else if (timeRange === "6m") {
                        periodEnd.setMonth(periodEnd.getMonth() + 6);
                      } else {
                        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
                      }
                      
                      // Sum all line items for this period
                      let totalHours = 0;
                      estimate.line_items?.forEach((item) => {
                        const startDate = new Date(item.start_date);
                        const endDate = new Date(item.end_date);
                        
                        if (startDate < periodEnd && endDate >= periodStart) {
                          if (item.weekly_hours && item.weekly_hours.length > 0) {
                            item.weekly_hours.forEach((wh) => {
                              const weekDate = new Date(wh.week_start_date);
                              if (weekDate >= periodStart && weekDate < periodEnd) {
                                const hours = parseFloat(wh.hours || "0");
                                if (hours > 0) {
                                  totalHours += hours;
                                }
                              }
                            });
                          }
                        }
                      });
                      
                      return (
                        <td
                          key={period.toISOString()}
                          className={`border border-gray-300 px-3 py-4 text-sm text-center font-medium ${
                            totalHours > 0
                              ? getLoadingColor(totalHours)
                              : "bg-gray-50"
                          }`}
                          title={totalHours > 0 ? `${totalHours.toFixed(1)} hours` : ""}
                        >
                          {totalHours > 0 ? totalHours.toFixed(1) : "-"}
                        </td>
                      );
                    })}
                  </tr>
                ) : (
                  // Show one row per phase with merged loadings
                  phases.map((phase) => {
                    const phaseLoadings = calculatePhaseLoadings.get(phase) || new Map();
                    
                    return (
                      <tr key={phase} className="hover:bg-gray-50">
                        <td className="sticky left-0 z-10 bg-white border border-gray-300 px-4 py-4 text-sm font-semibold">
                          {phase}
                        </td>
                        {timePeriods.map((period) => {
                          const periodKey = period.toISOString().split("T")[0];
                          const hours = phaseLoadings.get(periodKey) || 0;
                          
                          return (
                            <td
                              key={period.toISOString()}
                              className={`border border-gray-300 px-3 py-4 text-sm text-center font-medium ${
                                hours > 0
                                  ? getLoadingColor(hours)
                                  : "bg-gray-50"
                              }`}
                              title={hours > 0 ? `${hours.toFixed(1)} hours` : ""}
                            >
                              {hours > 0 ? hours.toFixed(1) : "-"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


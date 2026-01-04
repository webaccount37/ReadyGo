"use client";

import React, { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { estimatesApi } from "@/lib/api/estimates";
import { useEngagements } from "@/hooks/useEngagements";
import type { EstimateDetailResponse } from "@/types/estimate";

interface MultiEstimateGanttViewProps {
  estimateIds: string[];
}

interface EstimateRow {
  estimate: EstimateDetailResponse;
  engagementId: string;
  engagementName: string;
  engagementStartDate?: Date;
  engagementEndDate?: Date;
  estimateIndex: number; // Index within the engagement for color assignment
}

// Convert HSL to hex color
const hslToHex = (h: number, s: number, l: number): string => {
  h = h % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  
  let r = 0, g = 0, b = 0;
  
  if (h < 60) {
    r = c; g = x; b = 0;
  } else if (h < 120) {
    r = x; g = c; b = 0;
  } else if (h < 180) {
    r = 0; g = c; b = x;
  } else if (h < 240) {
    r = 0; g = x; b = c;
  } else if (h < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }
  
  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);
  
  const toHex = (n: number) => {
    const hex = n.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// Generate progressive grayish/purple slate colors for engagements
// Creates a smooth, natural progression that doesn't imply grouping
// Returns both base color and gradient colors for the bar
const generateEngagementColor = (index: number, totalCount: number): { base: string; gradient: string } => {
  // Base HSL values for grayish/purple slate
  const baseHue = 250; // Purple hue
  const baseSaturation = 15; // Low saturation for muted look
  const baseLightness = 55; // Medium lightness
  
  // Create smooth linear progression across the range
  // Normalize index to 0-1 range for smooth transitions
  const progress = totalCount > 1 ? index / (totalCount - 1) : 0;
  
  // Smooth progression parameters
  // Hue: gradually shift through purple tones (±20 degrees)
  const hueShift = progress * 20 - 10; // -10 to +10 degrees
  const hue = (baseHue + hueShift) % 360;
  
  // Saturation: subtle variation (±5%)
  const saturationShift = Math.sin(progress * Math.PI * 2) * 3; // Smooth wave, ±3%
  const saturation = Math.max(10, Math.min(22, baseSaturation + saturationShift));
  
  // Lightness: gradual shift for depth (±8%)
  const lightnessShift = progress * 8 - 4; // -4 to +4%
  const baseLightnessValue = Math.max(50, Math.min(60, baseLightness + lightnessShift));
  
  // Base color (slightly darker)
  const baseColor = hslToHex(hue, saturation, baseLightnessValue - 2);
  
  // Gradient end color (slightly lighter, with subtle hue shift)
  const gradientHue = (hue + 3) % 360; // Slight hue shift for gradient
  const gradientSaturation = Math.max(8, Math.min(20, saturation - 2));
  const gradientLightness = Math.max(52, Math.min(62, baseLightnessValue + 2));
  const gradientColor = hslToHex(gradientHue, gradientSaturation, gradientLightness);
  
  return {
    base: baseColor,
    gradient: gradientColor,
  };
};

export function MultiEstimateGanttView({ estimateIds }: MultiEstimateGanttViewProps) {
  // Fetch all estimate details using useQueries to handle multiple queries
  const estimateQueries = useQueries({
    queries: estimateIds.map((id) => ({
      queryKey: ["estimates", "detail", id, true],
      queryFn: () => estimatesApi.getEstimateDetail(id),
      enabled: !!id,
    })),
  });
  
  const isLoading = estimateQueries.some((q) => q.isLoading);
  const estimates = estimateQueries
    .map((q) => q.data)
    .filter((e): e is EstimateDetailResponse => e !== undefined);

  // Fetch engagements to get engagement dates
  const { data: engagementsData } = useEngagements({ limit: 1000 });

  // Create separate rows for each estimate, grouped by engagement
  const estimateRows = useMemo(() => {
    if (!estimates.length || !engagementsData?.items) return [];

    const rows: EstimateRow[] = [];
    const engagementEstimateCounts = new Map<string, number>();

    estimates.forEach((estimate) => {
      const engagementId = estimate.engagement_id;
      const engagement = engagementsData.items.find((e) => e.id === engagementId);
      
      // Track how many estimates we've seen for this engagement (for color assignment)
      const count = engagementEstimateCounts.get(engagementId) || 0;
      engagementEstimateCounts.set(engagementId, count + 1);

      rows.push({
        estimate,
        engagementId,
        engagementName: engagement?.name || estimate.engagement_name || "Unknown Engagement",
        engagementStartDate: engagement?.start_date ? new Date(engagement.start_date) : undefined,
        engagementEndDate: engagement?.end_date ? new Date(engagement.end_date) : undefined,
        estimateIndex: count,
      });
    });

    // Sort by earliest date first, then by name
    return rows.sort((a, b) => {
      // Get earliest start date for each row (from engagement dates or phases)
      const getEarliestStart = (row: EstimateRow): Date | null => {
        let earliest: Date | null = row.engagementStartDate || null;
        
        if (row.estimate.phases && row.estimate.phases.length > 0) {
          row.estimate.phases.forEach((phase) => {
            const phaseStart = new Date(phase.start_date);
            if (!earliest || phaseStart < earliest) {
              earliest = phaseStart;
            }
          });
        }
        
        return earliest;
      };
      
      const aStart = getEarliestStart(a);
      const bStart = getEarliestStart(b);
      
      // Sort by date first
      if (!aStart && !bStart) {
        // Both have no dates, sort by name
        return a.engagementName.localeCompare(b.engagementName) || a.estimate.name.localeCompare(b.estimate.name);
      }
      if (!aStart) return 1;
      if (!bStart) return -1;
      
      const dateCompare = aStart.getTime() - bStart.getTime();
      if (dateCompare !== 0) return dateCompare;
      
      // Same date, sort by engagement name, then estimate name
      const engagementCompare = a.engagementName.localeCompare(b.engagementName);
      if (engagementCompare !== 0) return engagementCompare;
      
      return a.estimate.name.localeCompare(b.estimate.name);
    });
  }, [estimates, engagementsData]);

  // Calculate timeline bounds from all estimates and phases
  const timelineBounds = useMemo(() => {
    if (estimateRows.length === 0) {
      const today = new Date();
      return {
        start: new Date(today.getFullYear(), 0, 1),
        end: new Date(today.getFullYear() + 1, 0, 1),
      };
    }

    let earliestStart: Date | null = null;
    let latestEnd: Date | null = null;

    estimateRows.forEach((row) => {
      // Check engagement dates
      if (row.engagementStartDate) {
        if (!earliestStart || row.engagementStartDate < earliestStart) {
          earliestStart = row.engagementStartDate;
        }
      }
      if (row.engagementEndDate) {
        if (!latestEnd || row.engagementEndDate > latestEnd) {
          latestEnd = row.engagementEndDate;
        }
      }

      // Check estimate phases
      if (row.estimate.phases && row.estimate.phases.length > 0) {
        row.estimate.phases.forEach((phase) => {
          const phaseStart = new Date(phase.start_date);
          const phaseEnd = new Date(phase.end_date);
          if (!earliestStart || phaseStart < earliestStart) {
            earliestStart = phaseStart;
          }
          if (!latestEnd || phaseEnd > latestEnd) {
            latestEnd = phaseEnd;
          }
        });
      } else if (row.estimate.line_items && row.estimate.line_items.length > 0) {
        // Fallback to line item dates if no phases
        row.estimate.line_items.forEach((item) => {
          const itemStart = new Date(item.start_date);
          const itemEnd = new Date(item.end_date);
          if (!earliestStart || itemStart < earliestStart) {
            earliestStart = itemStart;
          }
          if (!latestEnd || itemEnd > latestEnd) {
            latestEnd = itemEnd;
          }
        });
      }
    });

    if (!earliestStart || !latestEnd) {
      const today = new Date();
      return {
        start: new Date(today.getFullYear(), 0, 1),
        end: new Date(today.getFullYear() + 1, 0, 1),
      };
    }

    // Add padding (2 weeks before and after)
    earliestStart = new Date(earliestStart);
    earliestStart.setDate(earliestStart.getDate() - 14);
    latestEnd = new Date(latestEnd);
    latestEnd.setDate(latestEnd.getDate() + 14);

    return { start: earliestStart, end: latestEnd };
  }, [estimateRows]);

  // Generate weekly columns (Monday start)
  const weeks = useMemo(() => {
    const weekStarts: Date[] = [];
    const current = new Date(timelineBounds.start);

    // Find the Monday of the week containing the start date
    const dayOfWeek = current.getDay();
    const diff = current.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust for Monday
    current.setDate(diff);

    while (current <= timelineBounds.end) {
      weekStarts.push(new Date(current));
      current.setDate(current.getDate() + 7);
    }

    return weekStarts;
  }, [timelineBounds]);

  // Get color for engagement/phase
  // Returns color object for engagements, or string for phases
  const getColor = (engagementIndex: number, totalCount: number, phaseColor?: string): { base: string; gradient: string } | string => {
    if (phaseColor) return phaseColor;
    return generateEngagementColor(engagementIndex, totalCount);
  };

  // Get year range for header (must be before early returns)
  const yearRange = useMemo(() => {
    if (weeks.length === 0) return "";
    const years = new Set(weeks.map(w => w.getFullYear()));
    const sortedYears = Array.from(years).sort();
    if (sortedYears.length === 1) {
      return String(sortedYears[0]);
    }
    return `${sortedYears[0]} - ${sortedYears[sortedYears.length - 1]}`;
  }, [weeks]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-gray-500">Loading timeline data...</p>
      </div>
    );
  }

  if (estimateRows.length === 0) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-gray-500">No estimates found.</p>
      </div>
    );
  }

  // Calculate column width to fit at least 52 weeks (1 year) on screen
  // Use fixed pixel width for better compression
  const weekColumnWidth = 35; // Reduced from 50px to fit more weeks
  const totalTableWidth = weeks.length * weekColumnWidth;

  return (
    <div className="bg-white rounded-lg border border-gray-300 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <table className="border-collapse text-xs w-full bg-white" style={{ minWidth: `${totalTableWidth}px` }}>
            <thead>
              {/* Year header row */}
              <tr className="bg-gray-50 border-b border-gray-300">
                <th className="sticky left-0 z-20 bg-gray-50 border-r border-gray-300 px-1.5 py-0.5"></th>
                <th colSpan={weeks.length} className="text-center text-[9px] font-medium text-gray-600 py-0.5">
                  {yearRange}
                </th>
              </tr>
              {/* Week headers row */}
              <tr className="bg-gray-50 border-b border-gray-300">
                <th className="sticky left-0 z-20 bg-gray-50 border-r border-gray-300 px-1.5 py-1 text-left text-[9px] font-medium w-[180px]">
                  Engagement / Phase
                </th>
                {weeks.map((week, index) => {
                  const weekEnd = new Date(week.getTime() + 6 * 24 * 60 * 60 * 1000);
                  return (
                    <th
                      key={index}
                      className="border-l border-gray-200 px-0 py-0.5 text-center text-[9px] font-medium bg-white"
                      style={{ width: `${weekColumnWidth}px`, minWidth: `${weekColumnWidth}px` }}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900 leading-tight">
                          {week.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                        <span className="text-gray-500 text-[8px] font-normal leading-tight">
                          {weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="bg-white">
              {estimateRows.map((row, rowIndex) => {
                // Get phases for this specific estimate, sorted by start date first, then by name
                const estimatePhases = (row.estimate.phases || [])
                  .map((phase) => ({
                    ...phase,
                    estimateName: row.estimate.name,
                  }))
                  .sort((a, b) => {
                    const aStart = new Date(a.start_date).getTime();
                    const bStart = new Date(b.start_date).getTime();
                    if (aStart !== bStart) return aStart - bStart;
                    return a.name.localeCompare(b.name);
                  });

                // Use engagement index for color with progressive gradient
                const engagementColorData = getColor(rowIndex, estimateRows.length);
                const engagementColor = typeof engagementColorData === 'string' 
                  ? engagementColorData 
                  : engagementColorData.base;
                const engagementGradient = typeof engagementColorData === 'string'
                  ? null
                  : `linear-gradient(to right, ${engagementColorData.base}, ${engagementColorData.gradient})`;

                return (
                  <React.Fragment key={row.estimate.id}>
                    {/* Estimate row - shows engagement name and estimate name */}
                    <tr className="border-b border-gray-200 hover:bg-gray-50 bg-white">
                      <td className="sticky left-0 z-10 bg-white border-r border-gray-300 px-1.5 py-0.5 shadow-sm relative">
                        <div className="flex flex-col leading-tight">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-medium text-gray-900">
                              {row.engagementName}
                            </span>
                          </div>
                          <span className="text-[9px] text-gray-600 mt-0">
                            {row.estimate.name}
                          </span>
                          {row.engagementStartDate && row.engagementEndDate && (
                            <span className="text-[9px] text-gray-500 mt-0">
                              {row.engagementStartDate.toLocaleDateString()} -{" "}
                              {row.engagementEndDate.toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {row.estimate.active_version && (
                          <span className="absolute bottom-0 right-1 text-[7px] px-1 py-0 bg-green-100 text-green-800 rounded font-semibold">
                            ACTIVE
                          </span>
                        )}
                      </td>
                      {weeks.map((week, weekIndex) => {
                        const weekEnd = new Date(week.getTime() + 6 * 24 * 60 * 60 * 1000);
                        const hasEngagementBar =
                          row.engagementStartDate &&
                          row.engagementEndDate &&
                          row.engagementStartDate <= weekEnd &&
                          row.engagementEndDate >= week;
                        const isStartWeek = row.engagementStartDate! >= week && row.engagementStartDate! < weekEnd;
                        const isEndWeek = row.engagementEndDate! >= week && row.engagementEndDate! < weekEnd;

                        return (
                          <td
                            key={weekIndex}
                            className="border-l border-gray-200 px-0 py-0 relative h-7 bg-white"
                            style={{ width: `${weekColumnWidth}px` }}
                          >
                            {hasEngagementBar && estimatePhases.length === 0 && (
                              <div
                                className="absolute top-0.5 bottom-0.5 rounded shadow-sm"
                                style={{
                                  ...(engagementGradient 
                                    ? { backgroundImage: engagementGradient }
                                    : { backgroundColor: engagementColor }),
                                  left: isStartWeek ? `${Math.max(0, ((row.engagementStartDate!.getTime() - week.getTime()) / (7 * 24 * 60 * 60 * 1000)) * 100)}%` : "1px",
                                  right: isEndWeek ? `${Math.max(0, ((weekEnd.getTime() - row.engagementEndDate!.getTime()) / (7 * 24 * 60 * 60 * 1000)) * 100)}%` : "1px",
                                }}
                                title={`${row.engagementName} - ${row.estimate.name}: ${row.engagementStartDate!.toLocaleDateString()} - ${row.engagementEndDate!.toLocaleDateString()}`}
                              />
                            )}
                            {hasEngagementBar && estimatePhases.length > 0 && (
                              <div
                                className="absolute top-0.5 bottom-0.5 rounded shadow-sm opacity-60"
                                style={{
                                  ...(engagementGradient 
                                    ? { backgroundImage: engagementGradient }
                                    : { backgroundColor: engagementColor }),
                                  left: isStartWeek ? `${Math.max(0, ((row.engagementStartDate!.getTime() - week.getTime()) / (7 * 24 * 60 * 60 * 1000)) * 100)}%` : "1px",
                                  right: isEndWeek ? `${Math.max(0, ((weekEnd.getTime() - row.engagementEndDate!.getTime()) / (7 * 24 * 60 * 60 * 1000)) * 100)}%` : "1px",
                                }}
                                title={`${row.engagementName} - ${row.estimate.name}: ${row.engagementStartDate!.toLocaleDateString()} - ${row.engagementEndDate!.toLocaleDateString()}`}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {/* Phase rows - only show if phases exist */}
                    {estimatePhases.map((phase) => {
                      const phaseStart = new Date(phase.start_date);
                      const phaseEnd = new Date(phase.end_date);
                      // Phases use their own color if available, otherwise fallback to engagement base color
                      const phaseColorResult = phase.color || getColor(rowIndex, estimateRows.length);
                      const phaseColorValue = typeof phaseColorResult === 'string' ? phaseColorResult : phaseColorResult.base;

                      return (
                        <tr key={phase.id} className="border-b border-gray-200 hover:bg-gray-50 bg-white">
                          <td className="sticky left-0 z-10 bg-white border-r border-gray-300 px-1.5 py-0.5 pl-5 shadow-sm h-7">
                            <div className="flex items-center gap-1 leading-tight h-full">
                              <div
                                className="w-2.5 h-2.5 rounded flex-shrink-0"
                                style={{ backgroundColor: phaseColorValue }}
                              />
                              <span className="text-[9px] font-medium text-gray-700">{phase.name}</span>
                              <span className="text-[8px] text-gray-500 italic">
                                ({phase.estimateName})
                              </span>
                            </div>
                          </td>
                          {weeks.map((week, weekIndex) => {
                            const weekEnd = new Date(week.getTime() + 6 * 24 * 60 * 60 * 1000);
                            const isInRange = phaseStart <= weekEnd && phaseEnd >= week;
                            const isStartWeek = phaseStart >= week && phaseStart < weekEnd;
                            const isEndWeek = phaseEnd >= week && phaseEnd < weekEnd;

                            return (
                              <td
                                key={weekIndex}
                                className="border-l border-gray-200 px-0 py-0 relative h-7 bg-white"
                                style={{ width: `${weekColumnWidth}px` }}
                              >
                                {isInRange && (
                                  <div
                                    className="absolute top-0.5 bottom-0.5 rounded shadow-sm"
                                    style={{
                                      backgroundColor: phaseColorValue,
                                      left: isStartWeek ? `${Math.max(0, ((phaseStart.getTime() - week.getTime()) / (7 * 24 * 60 * 60 * 1000)) * 100)}%` : "1px",
                                      right: isEndWeek ? `${Math.max(0, ((weekEnd.getTime() - phaseEnd.getTime()) / (7 * 24 * 60 * 60 * 1000)) * 100)}%` : "1px",
                                    }}
                                    title={`${phase.name}: ${phaseStart.toLocaleDateString()} - ${phaseEnd.toLocaleDateString()}`}
                                  />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

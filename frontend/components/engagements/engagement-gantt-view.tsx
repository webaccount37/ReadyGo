"use client";

import React, { useMemo } from "react";
import type { EngagementDetailResponse, EngagementPhase } from "@/types/engagement";

interface EngagementGanttViewProps {
  engagement: EngagementDetailResponse;
  opportunityStartDate?: string;
  opportunityEndDate?: string;
}

// Convert HSL to hex color (matches MultiEstimateGanttView)
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
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const generateOpportunityColor = (): { base: string; gradient: string } => {
  const baseHue = 250;
  const baseSaturation = 15;
  const baseLightness = 55;
  const baseColor = hslToHex(baseHue, baseSaturation, baseLightness - 2);
  const gradientColor = hslToHex(baseHue + 3, Math.max(8, baseSaturation - 2), baseLightness + 2);
  return { base: baseColor, gradient: gradientColor };
};

export function EngagementGanttView({
  engagement,
  opportunityStartDate,
  opportunityEndDate,
}: EngagementGanttViewProps) {
  const opportunityStart = opportunityStartDate ? new Date(opportunityStartDate) : undefined;
  const opportunityEnd = opportunityEndDate ? new Date(opportunityEndDate) : undefined;

  // Calculate timeline bounds from opportunity dates and phases
  const timelineBounds = useMemo(() => {
    let earliestStart: Date | null = opportunityStart || null;
    let latestEnd: Date | null = opportunityEnd || null;

    const phases = engagement.phases || [];
    phases.forEach((phase) => {
      const phaseStart = new Date(phase.start_date);
      const phaseEnd = new Date(phase.end_date);
      if (!earliestStart || phaseStart < earliestStart) {
        earliestStart = phaseStart;
      }
      if (!latestEnd || phaseEnd > latestEnd) {
        latestEnd = phaseEnd;
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
  }, [engagement.phases, opportunityStart, opportunityEnd]);

  // Generate weekly columns (Monday start)
  const weeks = useMemo(() => {
    const weekStarts: Date[] = [];
    const current = new Date(timelineBounds.start);

    const dayOfWeek = current.getDay();
    const diff = current.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    current.setDate(diff);

    while (current <= timelineBounds.end) {
      weekStarts.push(new Date(current));
      current.setDate(current.getDate() + 7);
    }

    return weekStarts;
  }, [timelineBounds]);

  const yearRange = useMemo(() => {
    if (weeks.length === 0) return "";
    const years = new Set(weeks.map((w) => w.getFullYear()));
    const sortedYears = Array.from(years).sort();
    if (sortedYears.length === 1) {
      return String(sortedYears[0]);
    }
    return `${sortedYears[0]} - ${sortedYears[sortedYears.length - 1]}`;
  }, [weeks]);

  const opportunityColor = generateOpportunityColor();
  const engagementName = engagement.opportunity_name || engagement.opportunity_id;

  // Phases sorted by start date, then name
  const phases = useMemo(() => {
    return (engagement.phases || []).slice().sort((a, b) => {
      const aStart = new Date(a.start_date).getTime();
      const bStart = new Date(b.start_date).getTime();
      if (aStart !== bStart) return aStart - bStart;
      return a.name.localeCompare(b.name);
    });
  }, [engagement.phases]);

  const weekColumnWidth = 35;
  const totalTableWidth = weeks.length * weekColumnWidth;

  return (
    <div className="bg-white rounded-lg border border-gray-300 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <table
            className="border-collapse text-xs w-full bg-white"
            style={{ minWidth: `${totalTableWidth}px` }}
          >
            <thead>
              <tr className="bg-gray-50 border-b border-gray-300">
                <th className="sticky left-0 z-20 bg-gray-50 border-r border-gray-300 px-1.5 py-0.5"></th>
                <th
                  colSpan={weeks.length}
                  className="text-center text-[9px] font-medium text-gray-600 py-0.5"
                >
                  {yearRange}
                </th>
              </tr>
              <tr className="bg-gray-50 border-b border-gray-300">
                <th className="sticky left-0 z-20 bg-gray-50 border-r border-gray-300 px-1.5 py-1 text-left text-[9px] font-medium w-[180px]">
                  Opportunity / Phase
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
                          {week.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        <span className="text-gray-500 text-[8px] font-normal leading-tight">
                          {weekEnd.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="bg-white">
              {/* Engagement / Opportunity row */}
              <tr className="border-b border-gray-200 hover:bg-gray-50 bg-white">
                <td className="sticky left-0 z-10 bg-white border-r border-gray-300 px-1.5 py-0.5 shadow-sm relative">
                  <div className="flex flex-col leading-tight">
                    <span className="text-[10px] font-medium text-gray-900">
                      {engagementName}
                    </span>
                    <span className="text-[9px] text-gray-600 mt-0">
                      {engagement.quote_display_name || engagement.quote_number || "Engagement"}
                    </span>
                    {opportunityStart && opportunityEnd && (
                      <span className="text-[9px] text-gray-500 mt-0">
                        {opportunityStart.toLocaleDateString()} -{" "}
                        {opportunityEnd.toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </td>
                {weeks.map((week, weekIndex) => {
                  const weekEnd = new Date(week.getTime() + 6 * 24 * 60 * 60 * 1000);
                  const hasOpportunityBar =
                    opportunityStart &&
                    opportunityEnd &&
                    opportunityStart <= weekEnd &&
                    opportunityEnd >= week;
                  const isStartWeek =
                    opportunityStart! >= week && opportunityStart! < weekEnd;
                  const isEndWeek =
                    opportunityEnd! >= week && opportunityEnd! < weekEnd;

                  return (
                    <td
                      key={weekIndex}
                      className="border-l border-gray-200 px-0 py-0 relative h-7 bg-white"
                      style={{ width: `${weekColumnWidth}px` }}
                    >
                      {hasOpportunityBar && phases.length === 0 && (
                        <div
                          className="absolute top-0.5 bottom-0.5 rounded shadow-sm"
                          style={{
                            backgroundImage: `linear-gradient(to right, ${opportunityColor.base}, ${opportunityColor.gradient})`,
                            left: isStartWeek
                              ? `${Math.max(
                                  0,
                                  ((opportunityStart!.getTime() - week.getTime()) /
                                    (7 * 24 * 60 * 60 * 1000)) *
                                    100
                                )}%`
                              : "1px",
                            right: isEndWeek
                              ? `${Math.max(
                                  0,
                                  ((weekEnd.getTime() -
                                    opportunityEnd!.getTime()) /
                                    (7 * 24 * 60 * 60 * 1000)) *
                                    100
                                )}%`
                              : "1px",
                          }}
                          title={`${engagementName}: ${opportunityStart!.toLocaleDateString()} - ${opportunityEnd!.toLocaleDateString()}`}
                        />
                      )}
                      {hasOpportunityBar && phases.length > 0 && (
                        <div
                          className="absolute top-0.5 bottom-0.5 rounded shadow-sm opacity-60"
                          style={{
                            backgroundImage: `linear-gradient(to right, ${opportunityColor.base}, ${opportunityColor.gradient})`,
                            left: isStartWeek
                              ? `${Math.max(
                                  0,
                                  ((opportunityStart!.getTime() - week.getTime()) /
                                    (7 * 24 * 60 * 60 * 1000)) *
                                    100
                                )}%`
                              : "1px",
                            right: isEndWeek
                              ? `${Math.max(
                                  0,
                                  ((weekEnd.getTime() -
                                    opportunityEnd!.getTime()) /
                                    (7 * 24 * 60 * 60 * 1000)) *
                                    100
                                )}%`
                              : "1px",
                          }}
                          title={`${engagementName}: ${opportunityStart!.toLocaleDateString()} - ${opportunityEnd!.toLocaleDateString()}`}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
              {/* Phase rows */}
              {phases.map((phase: EngagementPhase) => {
                const phaseStart = new Date(phase.start_date);
                const phaseEnd = new Date(phase.end_date);
                const phaseColor = phase.color || opportunityColor.base;

                return (
                  <tr
                    key={phase.id}
                    className="border-b border-gray-200 hover:bg-gray-50 bg-white"
                  >
                    <td className="sticky left-0 z-10 bg-white border-r border-gray-300 px-1.5 py-0.5 pl-5 shadow-sm h-7">
                      <div className="flex items-center gap-1 leading-tight h-full">
                        <div
                          className="w-2.5 h-2.5 rounded flex-shrink-0"
                          style={{ backgroundColor: phaseColor }}
                        />
                        <span className="text-[9px] font-medium text-gray-700">
                          {phase.name}
                        </span>
                      </div>
                    </td>
                    {weeks.map((week, weekIndex) => {
                      const weekEnd = new Date(
                        week.getTime() + 6 * 24 * 60 * 60 * 1000
                      );
                      const isInRange = phaseStart <= weekEnd && phaseEnd >= week;
                      const isStartWeek =
                        phaseStart >= week && phaseStart < weekEnd;
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
                                backgroundColor: phaseColor,
                                left: isStartWeek
                                  ? `${Math.max(
                                      0,
                                      ((phaseStart.getTime() -
                                        week.getTime()) /
                                        (7 * 24 * 60 * 60 * 1000)) *
                                        100
                                    )}%`
                                  : "1px",
                                right: isEndWeek
                                  ? `${Math.max(
                                      0,
                                      ((weekEnd.getTime() -
                                        phaseEnd.getTime()) /
                                        (7 * 24 * 60 * 60 * 1000)) *
                                        100
                                    )}%`
                                  : "1px",
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

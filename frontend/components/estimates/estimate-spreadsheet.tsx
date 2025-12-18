"use client";

import React, { useState, useMemo } from "react";
import type { EstimateDetailResponse, EstimatePhase } from "@/types/estimate";
import { EstimateLineItemRow } from "./estimate-line-item-row";
import { EstimateTotalsRow } from "./estimate-totals-row";
import { EstimateEmptyRow } from "./estimate-empty-row";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EstimateSpreadsheetProps {
  estimate: EstimateDetailResponse;
}

export function EstimateSpreadsheet({ estimate }: EstimateSpreadsheetProps) {
  const [zoomLevel, setZoomLevel] = useState(100); // Percentage zoom
  const [emptyRowsCount, setEmptyRowsCount] = useState(20); // Dynamic empty rows count
  const [emptyRowIds] = useState<Set<string>>(() => {
    // Generate stable IDs for empty rows that persist across refetches
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(`empty-row-${i}`);
    }
    return ids;
  });
  // Context menu state reserved for future functionality
  const [, setContextMenu] = useState<{
    x: number;
    y: number;
    rowIndex: number;
  } | null>(null);
  
  // Always show at least the specified number of empty rows
  const existingLineItems = estimate.line_items || [];
  const emptyRowsNeeded = Math.max(0, emptyRowsCount - existingLineItems.length);
  
  const handleContextMenu = (e: React.MouseEvent, rowIndex: number) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      rowIndex,
    });
  };
  
  // Note: handleAddRowAbove and handleAddRowBelow are reserved for future context menu functionality

  // Generate weeks - default to 1 year view
  const weeks = useMemo(() => {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setMonth(startDate.getMonth() - 1); // Start 1 month ago
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 12); // 1 year forward

    const weekStarts: Date[] = [];
    const current = new Date(startDate);
    // Get Monday of the week
    const dayOfWeek = current.getDay();
    const diff = current.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    current.setDate(diff);

    while (current <= endDate) {
      weekStarts.push(new Date(current));
      current.setDate(current.getDate() + 7);
    }

    return weekStarts;
  }, []);

  // Calculate which phases overlap each week
  const weekPhaseOverlaps = useMemo(() => {
    const overlaps: Map<number, Array<{ phase: EstimatePhase; color: string }>> = new Map();
    
    if (!estimate.phases || estimate.phases.length === 0) {
      return overlaps;
    }

    weeks.forEach((week: Date, weekIndex: number) => {
      const weekDate = new Date(week);
      const weekEnd = new Date(weekDate);
      weekEnd.setDate(weekEnd.getDate() + 6); // End of week (Sunday)

      const overlappingPhases: Array<{ phase: typeof estimate.phases[0]; color: string }> = [];
      
      (estimate.phases || []).forEach((phase) => {
        const phaseStart = new Date(phase.start_date);
        const phaseEnd = new Date(phase.end_date);
        
        // Check if week overlaps with phase
        if (weekDate <= phaseEnd && weekEnd >= phaseStart) {
          overlappingPhases.push({
            phase,
            color: phase.color,
          });
        }
      });

      if (overlappingPhases.length > 0) {
        overlaps.set(weekIndex, overlappingPhases);
      }
    });

    return overlaps;
  }, [weeks, estimate]);

  // Generate background style for a week column based on overlapping phases
  const getWeekBackgroundStyle = (weekIndex: number): React.CSSProperties | undefined => {
    const overlaps = weekPhaseOverlaps.get(weekIndex);
    if (!overlaps || overlaps.length === 0) {
      return {};
    }

    if (overlaps.length === 1) {
      // Single phase - use solid color with opacity
      return {
        backgroundColor: overlaps[0].color + "33", // Add 33 hex for ~20% opacity
      };
    }

    // Multiple phases - blend colors using gradients
    const gradientStops = overlaps.map((overlap: { phase: EstimatePhase; color: string }, idx: number) => {
      const percentage = (idx / overlaps.length) * 100;
      const nextPercentage = ((idx + 1) / overlaps.length) * 100;
      return `${overlap.color}33 ${percentage}%, ${overlap.color}33 ${nextPercentage}%`;
    }).join(", ");

    return {
      background: `linear-gradient(to right, ${gradientStops})`,
    };
  };



  return (
    <Card className="w-full max-w-full overflow-hidden">
      <CardHeader>
          <div className="flex justify-between items-center">
          <CardTitle>Estimate Spreadsheet</CardTitle>
          <div className="flex gap-2 items-center">
            <div className="flex items-center gap-2 border border-gray-300 rounded-md px-2">
              <button
                onClick={() => setZoomLevel(Math.max(25, zoomLevel - 25))}
                className="px-2 py-1 text-sm hover:bg-gray-100"
                title="Zoom Out"
              >
                −
              </button>
              <span className="text-sm w-12 text-center">{zoomLevel}%</span>
              <button
                onClick={() => setZoomLevel(Math.min(200, zoomLevel + 25))}
                className="px-2 py-1 text-sm hover:bg-gray-100"
                title="Zoom In"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-hidden">
        <div 
          className="overflow-x-auto overflow-y-auto" 
          style={{ 
            maxHeight: "calc(100vh - 400px)",
            maxWidth: "100%",
            zoom: `${zoomLevel}%`
          }}
        >
          <div className="inline-block min-w-full">
            <table className="border-collapse text-sm" style={{ minWidth: "max-content" }}>
              <thead>
                {/* Phase header row */}
                {estimate.phases && estimate.phases.length > 0 && (
                  <tr>
                    <th colSpan={7} className="border border-gray-300 px-2 py-1 text-xs font-semibold bg-gray-50 sticky left-0 z-30">
                      Phases
                    </th>
                    {weeks.map((week: Date, weekIndex: number) => {
                      const overlaps = weekPhaseOverlaps.get(weekIndex);
                      const style = getWeekBackgroundStyle(weekIndex);
                      const phaseNames = overlaps?.map((o: { phase: EstimatePhase; color: string }) => o.phase.name).join(", ") || "";
                      
                      return (
                        <th
                          key={week.toISOString()}
                          className="border border-gray-300 px-1 py-1 text-xs font-semibold text-center min-w-[60px]"
                          style={style}
                          title={phaseNames || week.toLocaleDateString()}
                        >
                          {overlaps && overlaps.length > 0 && (
                            <div className="flex flex-col gap-0.5">
                              {overlaps.map((overlap: { phase: EstimatePhase; color: string }, idx: number) => (
                                <div
                                  key={idx}
                                  className="text-[10px] font-medium truncate"
                                  style={{ color: overlap.color }}
                                >
                                  {overlap.phase.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </th>
                      );
                    })}
                    <th colSpan={4} className="border border-gray-300 px-2 py-1 text-xs font-semibold bg-gray-50"></th>
                  </tr>
                )}
                {/* Main header row */}
                <tr>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[120px]">
                    Delivery Center
                  </th>
                  <th className="sticky left-0 z-20 bg-white border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[120px]">
                    Role
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[120px]">
                    Employee
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[80px]">
                    Cost
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[80px]">
                    Rate
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[100px]">
                    Start Date
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[100px]">
                    End Date
                  </th>
                  {weeks.map((week: Date, weekIndex: number) => {
                    const style = getWeekBackgroundStyle(weekIndex);
                    return (
                      <th
                        key={week.toISOString()}
                        className="border border-gray-300 px-1 py-2 text-xs font-semibold min-w-[60px] text-center"
                        style={style}
                        title={week.toLocaleDateString()}
                      >
                        {week.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </th>
                    );
                  })}
                  <th className="sticky right-[200px] z-20 bg-white border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[90px]">
                    Total Hours
                  </th>
                  <th className="sticky right-[100px] z-20 bg-white border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[90px]">
                    Total Cost
                  </th>
                  <th className="sticky right-0 z-20 bg-white border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[90px]">
                    Total Revenue
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[70px]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {existingLineItems.map((lineItem, index) => (
                  <EstimateLineItemRow
                    key={lineItem.id}
                    lineItem={lineItem}
                    weeks={weeks}
                    currency={estimate.currency}
                    estimateId={estimate.id}
                    onContextMenu={(e) => handleContextMenu(e, index)}
                  />
                ))}
                {Array.from({ length: emptyRowsNeeded }).map((_, index) => {
                  // Use stable ID from the set to prevent remounting on refetch
                  const stableIdArray = Array.from(emptyRowIds);
                  const stableId = stableIdArray[index] || `empty-row-${index}`;
                  return (
                    <EstimateEmptyRow
                      key={stableId}
                      estimateId={estimate.id}
                      weeks={weeks}
                      currency={estimate.currency}
                      rowIndex={existingLineItems.length + index}
                      stableId={stableId}
                      onContextMenu={(e) =>
                        handleContextMenu(e, existingLineItems.length + index)
                      }
                    />
                  );
                })}
                {existingLineItems.length > 0 && (
                  <EstimateTotalsRow
                    lineItems={existingLineItems}
                    weeks={weeks}
                    currency={estimate.currency}
                  />
                )}
                {/* Add Row button */}
                <tr>
                  <td colSpan={7 + weeks.length + 4} className="border border-gray-300 px-2 py-2 text-center">
                    <button
                      onClick={() => setEmptyRowsCount(emptyRowsCount + 1)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      + Add Row
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


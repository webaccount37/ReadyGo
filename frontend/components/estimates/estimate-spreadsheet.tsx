"use client";

import React, { useState, useMemo, useRef } from "react";
import type { EstimateDetailResponse, EstimatePhase } from "@/types/estimate";
import { EstimateLineItemRow } from "./estimate-line-item-row";
import { EstimateTotalsRow } from "./estimate-totals-row";
import { EstimateEmptyRow } from "./estimate-empty-row";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useExportEstimateExcel, useImportEstimateExcel, useEstimateDetail } from "@/hooks/useEstimates";

interface EstimateSpreadsheetProps {
  estimate: EstimateDetailResponse;
  startDate?: string;
  endDate?: string;
  engagementDeliveryCenterId?: string; // Engagement Invoice Center (delivery_center_id)
  engagementCurrency?: string; // Engagement default_currency
  readOnly?: boolean;
}

export function EstimateSpreadsheet({ 
  estimate, 
  startDate, 
  endDate,
  engagementDeliveryCenterId,
  engagementCurrency,
  readOnly = false
}: EstimateSpreadsheetProps) {
  const [zoomLevel, setZoomLevel] = useState(100); // Percentage zoom
  const [emptyRowsCount, setEmptyRowsCount] = useState(20); // Dynamic empty rows count
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportExcel = useExportEstimateExcel({
    onSuccess: (blob) => {
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `estimate_${estimate.name.replace(/\s+/g, "_")}_${estimate.id}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onError: (error) => {
      alert(`Failed to export estimate: ${error.message}`);
    },
  });
  const importExcel = useImportEstimateExcel({
    onSuccess: async (result) => {
      const message = `Import completed: ${result.created} created, ${result.updated} updated${
        result.errors.length > 0 ? `, ${result.errors.length} errors` : ""
      }`;
      if (result.errors.length > 0) {
        alert(`${message}\n\nErrors:\n${result.errors.join("\n")}`);
      } else {
        alert(message);
      }
      // Refetch estimate data to show updated values
      await refetch();
    },
    onError: (error) => {
      alert(`Failed to import estimate: ${error.message}`);
    },
  });
  const { refetch } = useEstimateDetail(estimate.id);
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
  const existingLineItems = useMemo(() => estimate.line_items || [], [estimate.line_items]);
  // Calculate empty rows needed - maintain a minimum number of empty rows
  // When items are created, we don't want to immediately add a new empty row
  // So we show empty rows based on the initial count, not dynamically adding more
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

  // Helper function to parse date string as local date (avoid timezone conversion)
  const parseLocalDate = (dateStr: string): Date => {
    const datePart = dateStr.split("T")[0];
    const [year, month, day] = datePart.split("-").map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed in JS
  };

  // Generate weeks based on startDate and endDate from Estimate Details (Release dates)
  // Only show weeks where Start or End Date is ON or BETWEEN Sunday through Saturday
  const weeks = useMemo(() => {
    let estimateStartDate: Date | null = null;
    let estimateEndDate: Date | null = null;
    
    if (startDate) {
      estimateStartDate = parseLocalDate(startDate);
    }
    if (endDate) {
      estimateEndDate = parseLocalDate(endDate);
    }

    // If no dates provided, show default range
    if (!estimateStartDate && !estimateEndDate) {
      const today = new Date();
      estimateStartDate = new Date(today);
      estimateStartDate.setMonth(estimateStartDate.getMonth() - 1);
      estimateEndDate = new Date(estimateStartDate);
      estimateEndDate.setMonth(estimateEndDate.getMonth() + 12);
    } else if (estimateStartDate && !estimateEndDate) {
      // Only start date - show 1 year forward
      estimateEndDate = new Date(estimateStartDate);
      estimateEndDate.setFullYear(estimateEndDate.getFullYear() + 1);
    } else if (!estimateStartDate && estimateEndDate) {
      // Only end date - show 1 year backward
      estimateStartDate = new Date(estimateEndDate);
      estimateStartDate.setFullYear(estimateStartDate.getFullYear() - 1);
    }

    // Generate all potential weeks in a wide range
    const weekStarts: Date[] = [];
    const rangeStart = estimateStartDate ? new Date(estimateStartDate) : new Date();
    const rangeEnd = estimateEndDate ? new Date(estimateEndDate) : new Date();
    
    // Expand range to ensure we capture all relevant weeks
    rangeStart.setDate(rangeStart.getDate() - 7); // Go back one week
    rangeEnd.setDate(rangeEnd.getDate() + 7); // Go forward one week
    
    const current = new Date(rangeStart);
    // Get Sunday of the week (0 = Sunday)
    const dayOfWeek = current.getDay();
    const diff = current.getDate() - dayOfWeek; // Subtract days to get to Sunday
    current.setDate(diff);

    // Generate weeks and filter to only those that overlap with the date range
    while (current <= rangeEnd) {
      const weekStart = new Date(current);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6); // End of week (Saturday)
      
      // Include week if it overlaps with the estimate date range
      // A week overlaps if: weekStart <= estimateEndDate AND weekEnd >= estimateStartDate
      if (!estimateStartDate || !estimateEndDate || 
          (weekStart <= estimateEndDate && weekEnd >= estimateStartDate)) {
        weekStarts.push(new Date(weekStart));
      }
      
      current.setDate(current.getDate() + 7);
    }

    return weekStarts;
  }, [startDate, endDate]);

  const handleExportClick = () => {
    exportExcel.mutate(estimate.id);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importExcel.mutate({ estimateId: estimate.id, file });
      // Reset input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Calculate which phases overlap each week
  const weekPhaseOverlaps = useMemo(() => {
    const overlaps: Map<number, Array<{ phase: EstimatePhase; color: string }>> = new Map();
    
    if (!estimate.phases || estimate.phases.length === 0) {
      return overlaps;
    }

    weeks.forEach((week: Date, weekIndex: number) => {
      const weekDate = new Date(week);
      const weekEnd = new Date(weekDate);
      weekEnd.setDate(weekEnd.getDate() + 6); // End of week (Saturday)

      const overlappingPhases: Array<{ phase: typeof estimate.phases[0]; color: string }> = [];
      
      (estimate.phases || []).forEach((phase) => {
        // Parse phase dates as local dates to avoid timezone offset issues
        const phaseStart = parseLocalDate(phase.start_date);
        const phaseEnd = parseLocalDate(phase.end_date);
        
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

  // Calculate summary totals for Estimate Summary section
  const summaryTotals = useMemo(() => {
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
    let billableExpenseAmount = 0;

    existingLineItems.forEach((item) => {
      const itemHours = weeks.reduce((hoursSum, week) => {
        const weekKey = formatDateKey(week);
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
          return hoursSum + parseFloat(weeklyHour?.hours || "0");
        }
        return hoursSum;
      }, 0);

      const itemCost = itemHours * parseFloat(item.cost || "0");
      const itemRevenue = itemHours * parseFloat(item.rate || "0");
      const billableExpensePercentage = parseFloat(item.billable_expense_percentage || "0");

      totalCost += itemCost;
      totalRevenue += itemRevenue;
      billableExpenseAmount += (billableExpensePercentage / 100) * itemRevenue;
    });

    const marginAmount = totalRevenue - totalCost;
    const marginPercentageWithoutExpenses = totalRevenue > 0 
      ? (marginAmount / totalRevenue) * 100 
      : 0;
    const marginPercentageWithExpenses = (totalRevenue + billableExpenseAmount) > 0 
      ? (marginAmount / (totalRevenue + billableExpenseAmount)) * 100 
      : 0;

    return {
      totalCost,
      totalRevenue,
      marginAmount,
      marginPercentageWithoutExpenses,
      marginPercentageWithExpenses,
    };
  }, [existingLineItems, weeks]);

  return (
    <Card className="w-full max-w-full overflow-hidden">
      <CardHeader>
          <div className="flex justify-between items-center">
          <CardTitle>Estimate Spreadsheet</CardTitle>
          <div className="flex gap-2 items-center">
            <Button
              onClick={handleExportClick}
              disabled={exportExcel.isPending || readOnly}
              variant="outline"
              size="sm"
            >
              {exportExcel.isPending ? "Exporting..." : "Export to Excel"}
            </Button>
            {!readOnly && (
              <Button
                onClick={handleImportClick}
                disabled={importExcel.isPending}
                variant="outline"
                size="sm"
              >
                {importExcel.isPending ? "Importing..." : "Import from Excel"}
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
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
      {/* Estimate Summary Section */}
      {existingLineItems.length > 0 && (
        <CardContent className="px-6 pt-4 pb-4 border-b">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Cost Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Total Cost</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {engagementCurrency || estimate.currency || "USD"} {summaryTotals.totalCost.toFixed(2)}
                </div>
              </CardContent>
            </Card>

            {/* Total Revenue Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {engagementCurrency || estimate.currency || "USD"} {summaryTotals.totalRevenue.toFixed(2)}
                </div>
              </CardContent>
            </Card>

            {/* Margin Amount Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Margin Amount</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {engagementCurrency || estimate.currency || "USD"} {summaryTotals.marginAmount.toFixed(2)}
                </div>
              </CardContent>
            </Card>

            {/* Margin % Without Expenses Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Margin % (Without Expenses)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summaryTotals.marginPercentageWithoutExpenses.toFixed(1)}%
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      )}
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
                    <th colSpan={10} className="border border-gray-300 px-2 py-1 text-xs font-semibold bg-gray-50">
                      Phases
                    </th>
                    {weeks.map((week: Date, weekIndex: number) => {
                      const overlaps = weekPhaseOverlaps.get(weekIndex);
                      const style = getWeekBackgroundStyle(weekIndex);
                      const phaseNames = overlaps?.map((o: { phase: EstimatePhase; color: string }) => o.phase.name).join(", ") || "";
                      // Show year when it changes or at the start of each year
                      const showYear = weekIndex === 0 || week.getFullYear() !== weeks[weekIndex - 1].getFullYear();
                      
                      return (
                        <th
                          key={week.toISOString()}
                          className="border border-gray-300 px-1 py-1 text-xs font-semibold text-center"
                          style={{ ...style, width: '120px', minWidth: '120px' }}
                          title={phaseNames || week.toLocaleDateString()}
                        >
                          <div className="flex flex-col gap-0.5">
                            {showYear && (
                              <div className="text-[10px] font-bold text-gray-600">
                                {week.getFullYear()}
                              </div>
                            )}
                            {overlaps && overlaps.length > 0 && (
                              <>
                                {overlaps.map((overlap: { phase: EstimatePhase; color: string }, idx: number) => (
                                  <div
                                    key={idx}
                                    className="text-[10px] font-medium truncate"
                                    style={{ color: overlap.color }}
                                  >
                                    {overlap.phase.name}
                                  </div>
                                ))}
                              </>
                            )}
                          </div>
                        </th>
                      );
                    })}
                    <th colSpan={6} className="border border-gray-300 px-2 py-1 text-xs font-semibold bg-gray-50"></th>
                  </tr>
                )}
                {/* Main header row */}
                <tr>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[120px]">
                    Payable Center
                  </th>
                  <th className="sticky left-0 z-20 bg-white border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[120px]">
                    Role
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[120px]">
                    Employee
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold" style={{ width: '120px', minWidth: '120px' }}>
                    Cost ({engagementCurrency || estimate.currency || "USD"})
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold" style={{ width: '120px', minWidth: '120px' }}>
                    Rate ({engagementCurrency || estimate.currency || "USD"})
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[100px]">
                    Start Date
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[100px]">
                    End Date
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[70px]">
                    Actions
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[80px]">
                    Billable
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[120px]">
                    Billable Expense %
                  </th>
                  {weeks.map((week: Date, weekIndex: number) => {
                    const style = getWeekBackgroundStyle(weekIndex);
                    // Show year when it changes or at the start of each year
                    const showYear = weekIndex === 0 || week.getFullYear() !== weeks[weekIndex - 1].getFullYear();
                    return (
                      <th
                        key={week.toISOString()}
                        className="border border-gray-300 px-1 py-2 text-xs font-semibold text-center"
                        style={{ ...style, width: '120px', minWidth: '120px' }}
                        title={week.toLocaleDateString()}
                      >
                        <div className="flex flex-col">
                          {showYear && (
                            <div className="text-[10px] font-bold text-gray-600">
                              {week.getFullYear()}
                            </div>
                          )}
                          <div>
                            {week.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                        </div>
                      </th>
                    );
                  })}
                  <th className="sticky right-0 z-20 bg-white border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[90px]">
                    Total Hours
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[90px]">
                    Total Cost
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[90px]">
                    Total Revenue
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[90px]">
                    Billable Expense Amount
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[90px]">
                    Margin Amount
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[90px]">
                    Margin % (Without Expenses)
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-xs font-semibold min-w-[90px]">
                    Margin % (With Expenses)
                  </th>
                </tr>
              </thead>
              <tbody>
                {existingLineItems.map((lineItem, index) => (
                  <EstimateLineItemRow
                    key={lineItem.id}
                    lineItem={lineItem}
                    weeks={weeks}
                    currency={engagementCurrency || estimate.currency || "USD"}
                    estimateId={estimate.id}
                    engagementDeliveryCenterId={engagementDeliveryCenterId}
                    onContextMenu={(e) => handleContextMenu(e, index)}
                    readOnly={readOnly}
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
                      currency={engagementCurrency || estimate.currency || "USD"}
                      rowIndex={existingLineItems.length + index}
                      stableId={stableId}
                      engagementDeliveryCenterId={engagementDeliveryCenterId}
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
                    currency={engagementCurrency || estimate.currency || "USD"}
                  />
                )}
                {/* Add Row button */}
                <tr>
                  <td colSpan={10 + weeks.length + 5} className="border border-gray-300 px-2 py-2 text-center">
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


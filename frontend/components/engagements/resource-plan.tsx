"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import type { EngagementDetailResponse, EngagementPhase } from "@/types/engagement";
import { EngagementLineItemRow } from "./engagement-line-item-row";
import { EngagementTotalsRow } from "./engagement-totals-row";
import { EngagementEmptyRow } from "./engagement-empty-row";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useCreateLineItem,
  useUpdateLineItem,
  useExportEngagementExcel,
  useImportEngagementExcel,
  useApprovedHoursByWeek,
} from "@/hooks/useEngagements";
import { useCurrencyRates } from "@/hooks/useCurrencyRates";
import { setCurrencyRates } from "@/lib/utils/currency";
import { logResourcePlanServerCall } from "@/lib/engagement-resource-plan-server-log";
import {
  DEFAULT_DRAFT_ROW_COUNT,
  spreadsheetDraftRowStableId,
} from "@/lib/utils/spreadsheet-draft-rows";

interface ResourcePlanProps {
  engagement: EngagementDetailResponse;
  opportunityDeliveryCenterId?: string; // Opportunity Invoice Center (delivery_center_id)
  opportunityCurrency?: string; // Opportunity Invoice Currency (default_currency)
  invoiceCustomer?: boolean;
  billableExpenses?: boolean;
  onRefetch?: () => Promise<unknown>; // Callback to refetch engagement data
}

export function ResourcePlan({ 
  engagement, 
  opportunityDeliveryCenterId,
  opportunityCurrency,
  invoiceCustomer = true,
  billableExpenses = true,
  onRefetch
}: ResourcePlanProps) {
  const { data: currencyRatesData } = useCurrencyRates({ limit: 1000 });
  useEffect(() => {
    if (!currencyRatesData?.items?.length) return;
    const rates: Record<string, number> = {};
    for (const rate of currencyRatesData.items) {
      rates[rate.currency_code.toUpperCase()] = rate.rate_to_usd;
    }
    setCurrencyRates(rates);
  }, [currencyRatesData]);

  const [zoomLevel, setZoomLevel] = useState(100);
  const [draftRowCount, setDraftRowCount] = useState(DEFAULT_DRAFT_ROW_COUNT);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportExcel = useExportEngagementExcel({
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `engagement_${engagement.name.replace(/\s+/g, "_")}_${engagement.id}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onError: (error) => {
      alert(`Failed to export resource plan: ${error.message}`);
    },
  });
  const importExcel = useImportEngagementExcel({
    onSuccess: async (result) => {
      const message = `Import completed: ${result.created} created, ${result.updated} updated${
        result.errors.length > 0 ? `, ${result.errors.length} errors` : ""
      }`;
      if (result.errors.length > 0) {
        alert(`${message}\n\nErrors:\n${result.errors.join("\n")}`);
      } else {
        alert(message);
      }
      if (onRefetch) {
        await onRefetch();
      }
    },
    onError: (error) => {
      alert(`Failed to import resource plan: ${error.message}`);
    },
  });
  const [emptyRowIds] = useState<Set<string>>(new Set());
  const { data: approvedHoursData } = useApprovedHoursByWeek(engagement.id);
  const createLineItem = useCreateLineItem();
  const updateLineItem = useUpdateLineItem();

  // Helper functions (must be defined before useMemo that uses them)
  const parseLocalDate = (dateStr: string): Date => {
    const datePart = dateStr.split("T")[0];
    const [year, month, day] = datePart.split("-").map(Number);
    return new Date(year, month - 1, day);
  };

  const getWeekStart = (d: Date): Date => {
    const daysSinceSunday = (d.getDay() + 1) % 7;
    const result = new Date(d);
    result.setDate(result.getDate() - daysSinceSunday);
    return result;
  };

  const generateWeeksFromDates = (startDate: Date, endDate: Date): Date[] => {
    const weeks: Date[] = [];
    let current = getWeekStart(startDate);
    const endWeekStart = getWeekStart(endDate);

    while (current <= endWeekStart) {
      weeks.push(new Date(current));
      current = new Date(current);
      current.setDate(current.getDate() + 7);
    }

    return weeks;
  };

  // Generate weeks from line items (flexible dates - not tied to Opportunity)
  const weeks = useMemo(() => {
    if (!engagement.line_items || engagement.line_items.length === 0) {
      // Default to 1 year from today if no line items
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const end = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
      return generateWeeksFromDates(start, end);
    }

    // CRITICAL: Generate weeks primarily from weekly_hours week_start_date values
    // This ensures all weeks with hours are included, regardless of line item dates
    const weekDatesSet = new Set<string>();
    engagement.line_items.forEach((item) => {
      if (item.weekly_hours) {
        item.weekly_hours.forEach((wh) => {
          weekDatesSet.add(wh.week_start_date);
        });
      }
    });

    // Convert week_start_date strings to Date objects
    // CRITICAL: week_start_date values are already Sundays, so use them directly
    const weeksFromHours: Date[] = [];
    weekDatesSet.forEach((weekDateStr) => {
      const parsedDate = parseLocalDate(weekDateStr);
      // week_start_date is already a Sunday (dayOfWeek === 0), use it directly
      // Only normalize to ensure it's at midnight
      const weekDate = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
      weeksFromHours.push(weekDate);
    });

    // Also consider start/end dates to ensure coverage for weeks without hours yet
    const dates = engagement.line_items.flatMap(li => [li.start_date, li.end_date]).filter(Boolean);
    const weeksList: Date[] = [];
    
    if (dates.length > 0) {
      const minDate = new Date(Math.min(...dates.map(d => new Date(d).getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => new Date(d).getTime())));

      // Generate weeks between min and max dates
      // CRITICAL: Fix getWeekStart bug - it shifts Sundays incorrectly
      // For a date, find the Sunday of that week properly
      const getSundayOfWeek = (d: Date): Date => {
        const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const result = new Date(d);
        result.setDate(result.getDate() - dayOfWeek); // Subtract days to get to Sunday
        return result;
      };
      
      let current = getSundayOfWeek(minDate);
      const endWeekStart = getSundayOfWeek(maxDate);

      while (current <= endWeekStart) {
        weeksList.push(new Date(current));
        current = new Date(current);
        current.setDate(current.getDate() + 7);
      }
    }

    // CRITICAL: Merge weeks, prioritizing weeks from hours (they're the source of truth)
    const allWeeksMap = new Map<string, Date>();
    
    // Add weeks from hours first (these are the source of truth)
    weeksFromHours.forEach(week => {
      const weekKey = `${week.getFullYear()}-${String(week.getMonth() + 1).padStart(2, '0')}-${String(week.getDate()).padStart(2, '0')}`;
      allWeeksMap.set(weekKey, week);
    });
    
    // Add weeks from dates only if they don't already exist from hours
    weeksList.forEach(week => {
      const weekKey = `${week.getFullYear()}-${String(week.getMonth() + 1).padStart(2, '0')}-${String(week.getDate()).padStart(2, '0')}`;
      // Only add if not already present from hours
      if (!allWeeksMap.has(weekKey)) {
        allWeeksMap.set(weekKey, week);
      }
    });

    const finalWeeks = Array.from(allWeeksMap.values()).sort((a, b) => a.getTime() - b.getTime());
    
    console.log("ResourcePlan: Generated weeks", {
      weeksFromHoursCount: weeksFromHours.length,
      weeksFromDatesCount: weeksList.length,
      finalWeeksCount: finalWeeks.length,
      firstFewWeeks: finalWeeks.slice(0, 5).map(w => `${w.getFullYear()}-${String(w.getMonth() + 1).padStart(2, '0')}-${String(w.getDate()).padStart(2, '0')}`),
      weekDatesFromHours: Array.from(weekDatesSet).slice(0, 5)
    });

    return finalWeeks;
  }, [engagement.line_items]);

  const existingLineItems = useMemo(() => {
    const items = engagement.line_items || [];
    const seen = new Set<string>();
    const out: typeof items = [];
    for (const item of items) {
      if (emptyRowIds.has(item.id) || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
    return out;
  }, [engagement.line_items, emptyRowIds]);

  const handleExportClick = () => {
    logResourcePlanServerCall("exportExcel", "resourcePlan: user clicked Export", {
      engagementId: engagement.id,
    });
    exportExcel.mutate(engagement.id);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      logResourcePlanServerCall("importExcel", "resourcePlan: user selected file for import", {
        engagementId: engagement.id,
        fileName: file.name,
        fileSize: file.size,
      });
      importExcel.mutate({ engagementId: engagement.id, file });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Calculate which phases overlap each week
  const weekPhaseOverlaps = useMemo(() => {
    const overlaps: Map<number, Array<{ phase: EngagementPhase; color: string }>> = new Map();
    
    if (!engagement.phases || engagement.phases.length === 0) {
      return overlaps;
    }

    weeks.forEach((week: Date, weekIndex: number) => {
      const weekDate = new Date(week);
      const weekEnd = new Date(weekDate);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const overlappingPhases: Array<{ phase: EngagementPhase; color: string }> = [];
      
      (engagement.phases || []).forEach((phase) => {
        const phaseStart = parseLocalDate(phase.start_date);
        const phaseEnd = parseLocalDate(phase.end_date);
        
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
  }, [weeks, engagement.phases]);

  const getWeekBackgroundStyle = (weekIndex: number): React.CSSProperties | undefined => {
    const overlaps = weekPhaseOverlaps.get(weekIndex);
    if (!overlaps || overlaps.length === 0) {
      return {};
    }

    if (overlaps.length === 1) {
      return {
        backgroundColor: overlaps[0].color + "33",
      };
    }

    const gradientStops = overlaps.map((overlap, idx) => {
      const percentage = (idx / overlaps.length) * 100;
      const nextPercentage = ((idx + 1) / overlaps.length) * 100;
      return `${overlap.color}33 ${percentage}%, ${overlap.color}33 ${nextPercentage}%`;
    }).join(", ");

    return {
      background: `linear-gradient(to right, ${gradientStops})`,
    };
  };

  const formatDateKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const currency = opportunityCurrency || "USD";

  return (
    <Card className="w-full max-w-full overflow-hidden">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Resource Plan</CardTitle>
          <div className="flex gap-2 items-center">
            <Button
              onClick={handleExportClick}
              disabled={exportExcel.isPending}
              variant="outline"
              size="sm"
            >
              {exportExcel.isPending ? "Exporting..." : "Export to Excel"}
            </Button>
            <Button
              onClick={handleImportClick}
              disabled={importExcel.isPending}
              variant="outline"
              size="sm"
            >
              {importExcel.isPending ? "Importing..." : "Import from Excel"}
            </Button>
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
                {engagement.phases && engagement.phases.length > 0 && (
                  <tr>
                    <th colSpan={12} className="border border-gray-300 px-2 py-1 text-xs font-semibold bg-gray-50">
                      Phases
                    </th>
                    {weeks.map((week: Date, weekIndex: number) => {
                      const overlaps = weekPhaseOverlaps.get(weekIndex);
                      const style = getWeekBackgroundStyle(weekIndex);
                      const phaseNames = overlaps?.map((o) => o.phase.name).join(", ") || "";
                      const showYear = weekIndex === 0 || week.getFullYear() !== weeks[weekIndex - 1].getFullYear();
                      
                      return (
                        <th
                          key={weekIndex}
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
                            {overlaps && overlaps.length > 0 ? (
                              <>
                                {overlaps.map((overlap: { phase: EngagementPhase; color: string }, idx: number) => (
                                  <div
                                    key={idx}
                                    className="text-[10px] font-medium truncate"
                                    style={{ color: overlap.color }}
                                  >
                                    {overlap.phase.name}
                                  </div>
                                ))}
                              </>
                            ) : (
                              <div className="text-[10px] text-gray-400">
                                {week.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </div>
                            )}
                          </div>
                        </th>
                      );
                    })}
                    <th colSpan={7} className="border border-gray-300 px-2 py-1 text-xs font-semibold bg-gray-50">
                      Totals
                    </th>
                  </tr>
                )}
                
                {/* Column headers */}
                <tr>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-semibold">
                    Payable Center
                  </th>
                  <th className="sticky left-0 z-20 bg-white border border-gray-300 px-2 py-2 text-xs font-semibold">
                    Role
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-semibold">
                    Employee
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-semibold">
                    Cost ({currency})
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-semibold">
                    Rate ({currency})
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-semibold">
                    Cost ({currency}) Daily
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-semibold">
                    Rate ({currency}) Daily
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-semibold">
                    Start Date
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-semibold">
                    End Date
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-semibold">
                    Actions
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-semibold">
                    Billable
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-semibold">
                    Billable %
                  </th>
                  {weeks.map((week: Date, weekIndex: number) => (
                    <th
                      key={weekIndex}
                      className="border border-gray-300 px-1 py-2 text-xs font-semibold text-center"
                      style={{ width: '120px', minWidth: '120px' }}
                    >
                      {week.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </th>
                  ))}
                  <th className="sticky right-0 z-10 bg-white border border-gray-300 px-2 py-2 text-xs font-semibold">
                    Total Hours
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-semibold">
                    Total Cost ({currency})
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-semibold">
                    Total Revenue ({currency})
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-semibold">
                    Billable Expenses ({currency})
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-semibold">
                    Margin ({currency})
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-semibold">
                    Margin %
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-xs font-semibold">
                    Margin % (w/ Expenses)
                  </th>
                </tr>
              </thead>
              <tbody>
                {existingLineItems.map((lineItem, index) => (
                  <EngagementLineItemRow
                    key={lineItem.id}
                    lineItem={lineItem}
                    weeks={weeks}
                    currency={currency}
                    engagementId={engagement.id}
                    opportunityDeliveryCenterId={opportunityDeliveryCenterId}
                    invoiceCustomer={invoiceCustomer}
                    billableExpenses={billableExpenses}
                    approvedHoursByWeek={approvedHoursData?.by_line_item?.[lineItem.id]}
                  />
                ))}
                {Array.from({ length: draftRowCount }).map((_, index) => {
                  const stableId = spreadsheetDraftRowStableId(index);
                  return (
                    <EngagementEmptyRow
                      key={stableId}
                      engagementId={engagement.id}
                      engagement={engagement}
                      weeks={weeks}
                      currency={currency}
                      rowIndex={existingLineItems.length + index}
                      stableId={stableId}
                      opportunityDeliveryCenterId={opportunityDeliveryCenterId}
                      invoiceCustomer={invoiceCustomer}
                      billableExpenses={billableExpenses}
                      createLineItem={createLineItem}
                      updateLineItem={updateLineItem}
                    />
                  );
                })}
                <EngagementTotalsRow
                  lineItems={existingLineItems}
                  weeks={weeks}
                  currency={currency}
                  approvedHoursByWeek={approvedHoursData?.by_week}
                />
                <tr>
                  <td
                    colSpan={12 + weeks.length + 7}
                    className="border border-gray-300 px-2 py-2 text-center"
                  >
                    <button
                      type="button"
                      onClick={() => setDraftRowCount((c) => c + 1)}
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

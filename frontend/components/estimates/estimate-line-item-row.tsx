"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import type { EstimateLineItem } from "@/types/estimate";
import { AutoFillDialog } from "./auto-fill-dialog";
import { useUpdateLineItem } from "@/hooks/useEstimates";
import { useDeleteLineItem } from "@/hooks/useEstimates";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useRoles } from "@/hooks/useRoles";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useEmployees } from "@/hooks/useEmployees";
import { estimatesApi } from "@/lib/api/estimates";
import { useQueryClient } from "@tanstack/react-query";

interface EstimateLineItemRowProps {
  lineItem: EstimateLineItem;
  weeks: Date[];
  currency: string;
  estimateId: string;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function EstimateLineItemRow({
  lineItem,
  weeks,
  currency,
  estimateId,
  onContextMenu,
}: EstimateLineItemRowProps) {
  const [isAutoFillOpen, setIsAutoFillOpen] = useState(false);
  const queryClient = useQueryClient();
  const updateLineItem = useUpdateLineItem();
  const deleteLineItemMutation = useDeleteLineItem();

  // Always-editable values (spreadsheet style)
  const [costValue, setCostValue] = useState(lineItem.cost || "0");
  const [rateValue, setRateValue] = useState(lineItem.rate || "0");
  const [startDateValue, setStartDateValue] = useState(
    lineItem.start_date.split("T")[0]
  );
  const [endDateValue, setEndDateValue] = useState(
    lineItem.end_date.split("T")[0]
  );
  const [deliveryCenterValue, setDeliveryCenterValue] = useState(
    lineItem.delivery_center_id
  );
  const [roleValue, setRoleValue] = useState(lineItem.role_id);
  const [employeeValue, setEmployeeValue] = useState(lineItem.employee_id || "");
  const [billableValue, setBillableValue] = useState(lineItem.billable ?? true);
  
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Track if we're currently updating to prevent feedback loops
  const isUpdatingRef = useRef(false);
  
  // Update local state when lineItem prop changes (from refetch)
  // Only update if values actually changed to prevent unnecessary re-renders and feedback loops
  useEffect(() => {
    // Skip updates if we're currently in the middle of an update to prevent feedback loops
    if (isUpdatingRef.current) {
      return;
    }
    
    const startDateStr = lineItem.start_date.split("T")[0];
    const endDateStr = lineItem.end_date.split("T")[0];
    
    // Only update state if values actually changed
    setCostValue((prev) => {
      const newValue = lineItem.cost || "0";
      return prev !== newValue ? newValue : prev;
    });
    setRateValue((prev) => {
      const newValue = lineItem.rate || "0";
      return prev !== newValue ? newValue : prev;
    });
    setStartDateValue((prev) => {
      const newValue = startDateStr;
      return prev !== newValue ? newValue : prev;
    });
    setEndDateValue((prev) => {
      const newValue = endDateStr;
      return prev !== newValue ? newValue : prev;
    });
    setDeliveryCenterValue((prev) => {
      const newValue = lineItem.delivery_center_id;
      return prev !== newValue ? newValue : prev;
    });
    setRoleValue((prev) => {
      const newValue = lineItem.role_id;
      return prev !== newValue ? newValue : prev;
    });
    setEmployeeValue((prev) => {
      const newValue = lineItem.employee_id || "";
      return prev !== newValue ? newValue : prev;
    });
    setBillableValue((prev) => {
      const newValue = lineItem.billable ?? true;
      return prev !== newValue ? newValue : prev;
    });
  }, [lineItem.id, lineItem.cost, lineItem.rate, lineItem.start_date, lineItem.end_date, lineItem.delivery_center_id, lineItem.role_id, lineItem.employee_id, lineItem.billable]);

  // Weekly hours editing state
  const [weeklyHoursValues, setWeeklyHoursValues] = useState<Map<string, string>>(
    new Map()
  );
  const hoursSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: rolesData } = useRoles();
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: employeesData } = useEmployees({ limit: 100 });

  // Helper function to parse date strings as local dates (avoid timezone conversion)
  // This prevents JavaScript from interpreting date strings as UTC midnight
  const parseLocalDate = (dateStr: string): Date => {
    const datePart = dateStr.split("T")[0];
    const [year, month, day] = datePart.split("-").map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed in JS, creates local date
  };

  // Helper function to format date as YYYY-MM-DD string
  const formatDateKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Helper function to get week key (must be defined before use)
  // Use local date formatting to avoid timezone conversion issues
  const getWeekKey = (week: Date) => {
    return formatDateKey(week);
  };

  // Initialize weekly hours map
  useEffect(() => {
    const hoursMap = new Map<string, string>();
    lineItem.weekly_hours?.forEach((wh) => {
      const weekKey = formatDateKey(parseLocalDate(wh.week_start_date));
      hoursMap.set(weekKey, wh.hours);
    });
    setWeeklyHoursValues(hoursMap);
  }, [lineItem.weekly_hours]);

  // Create a map of weekly hours for quick lookup
  const weeklyHoursMap = new Map<string, string>();
  lineItem.weekly_hours?.forEach((wh) => {
    const weekKey = getWeekKey(parseLocalDate(wh.week_start_date));
    weeklyHoursMap.set(weekKey, wh.hours);
  });

  // Calculate totals - only for weeks within date range
  const startDate = parseLocalDate(startDateValue);
  const endDate = parseLocalDate(endDateValue);
  const totalHours: number = weeks.reduce((sum: number, week: Date) => {
    const weekKey = getWeekKey(week);
    const weekDate = week; // week is already a Date object
    // Only include hours for weeks within the date range
    if (weekDate >= startDate && weekDate <= endDate) {
      const hours = weeklyHoursValues.get(weekKey) || weeklyHoursMap.get(weekKey) || "0";
      return sum + parseFloat(hours || "0");
    }
    return sum;
  }, 0);
  const totalCost: number = totalHours * parseFloat(costValue || "0");
  const totalRevenue: number = totalHours * parseFloat(rateValue || "0");
  const marginAmount: number = totalRevenue - totalCost;
  const marginPercentage: number = totalRevenue > 0 ? (marginAmount / totalRevenue) * 100 : 0;

  // Note: formatDate reserved for future use
  // const formatDate = (dateStr: string) => {
  //   return new Date(dateStr).toLocaleDateString("en-US", {
  //     month: "short",
  //     day: "numeric",
  //     year: "numeric",
  //   });
  // };

  // Auto-save function with debouncing (spreadsheet style)
  const handleFieldUpdate = useCallback(async (
    field: string,
    value: string | undefined,
    originalValue: string
  ) => {
    if (value === originalValue) {
      return;
    }

    // Set updating flag to prevent useEffect from interfering
    isUpdatingRef.current = true;

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce the save
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        // Only send the specific field being changed, not all fields
        const updateData: Record<string, string | boolean | undefined> = {};
        if (field === "billable") {
          // Handle billable as boolean - value is string "true"/"false"
          updateData[field] = value === "true" || value === "True";
        } else {
          updateData[field] = value;
        }

        await updateLineItem.mutateAsync({
          estimateId,
          lineItemId: lineItem.id,
          data: updateData,
        });
        
        // Clear updating flag after successful update
        // Use a small delay to allow the query invalidation to complete
        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 100);
      } catch (err) {
        console.error(`Failed to update ${field}:`, err);
        // Clear updating flag on error
        isUpdatingRef.current = false;
        // Revert on error
        if (field === "cost") setCostValue(originalValue);
        else if (field === "rate") setRateValue(originalValue);
        else if (field === "start_date") setStartDateValue(originalValue.split("T")[0]);
        else if (field === "end_date") setEndDateValue(originalValue.split("T")[0]);
        else if (field === "delivery_center_id") setDeliveryCenterValue(originalValue);
        else if (field === "role_id") setRoleValue(originalValue);
        else if (field === "employee_id") setEmployeeValue(originalValue || "");
        else if (field === "billable") setBillableValue(originalValue === "true" || originalValue === "True");
      }
    }, 500); // 500ms debounce
  }, [estimateId, lineItem.id, updateLineItem]);
  
  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (hoursSaveTimeoutRef.current) {
        clearTimeout(hoursSaveTimeoutRef.current);
      }
    };
  }, []);

  const handleWeeklyHoursUpdate = async (weekKey: string, hours: string) => {
    // Parse dates as local dates to avoid timezone conversion issues
    const parseLocalDate = (dateStr: string): Date => {
      const [year, month, day] = dateStr.split("T")[0].split("-").map(Number);
      return new Date(year, month - 1, day); // month is 0-indexed in JS
    };
    const weekDate = parseLocalDate(weekKey);
    const startDate = parseLocalDate(startDateValue);
    const endDate = parseLocalDate(endDateValue);

    // Only update if within date range
    if (weekDate < startDate || weekDate > endDate) {
      return;
    }

    // Debounce the API call
    if (hoursSaveTimeoutRef.current) {
      clearTimeout(hoursSaveTimeoutRef.current);
    }

    hoursSaveTimeoutRef.current = setTimeout(async () => {
      try {
        await estimatesApi.autoFillHours(estimateId, lineItem.id, {
          pattern: "custom",
          custom_hours: {
            [weekKey]: hours,
          },
        });
        queryClient.invalidateQueries({
          queryKey: ["estimates", "detail", estimateId, true],
        });
      } catch (err) {
        console.error("Failed to update weekly hours:", err);
        // Revert on error
        const originalHours = weeklyHoursMap.get(weekKey) || "0";
        setWeeklyHoursValues((prev: Map<string, string>) => {
          const next = new Map(prev);
          next.set(weekKey, originalHours);
          return next;
        });
      }
    }, 500);
  };


  return (
    <>
      <tr className="hover:bg-gray-50" onContextMenu={onContextMenu}>
        {/* Delivery Center */}
        <td className="border border-gray-300 px-2 py-1 text-xs">
          <Select
            value={deliveryCenterValue}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              setDeliveryCenterValue(e.target.value);
              handleFieldUpdate(
                "delivery_center_id",
                e.target.value,
                lineItem.delivery_center_id
              );
            }}
            className="text-xs h-7 w-full"
          >
            <option value="">Select...</option>
            {deliveryCentersData?.items?.map((dc: { id: string; name: string }) => (
              <option key={dc.id} value={dc.id}>
                {dc.name}
              </option>
            ))}
          </Select>
        </td>

        {/* Role */}
        <td className="sticky left-0 z-10 bg-white border border-gray-300 px-2 py-1 text-xs">
          <Select
            value={roleValue}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              setRoleValue(e.target.value);
              handleFieldUpdate("role_id", e.target.value, lineItem.role_id);
            }}
            className="text-xs h-7 w-full"
          >
            <option value="">Select...</option>
            {rolesData?.items?.map((role: { id: string; role_name: string }) => (
              <option key={role.id} value={role.id}>
                {role.role_name}
              </option>
            ))}
          </Select>
        </td>

        {/* Employee */}
        <td className="border border-gray-300 px-2 py-1 text-xs">
          <Select
            value={employeeValue}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              setEmployeeValue(e.target.value);
              handleFieldUpdate(
                "employee_id",
                e.target.value || undefined,
                lineItem.employee_id || ""
              );
            }}
            className="text-xs h-7 w-full"
          >
            <option value="">-</option>
            {employeesData?.items?.map((employee: { id: string; first_name: string; last_name: string }) => (
              <option key={employee.id} value={employee.id}>
                {employee.first_name} {employee.last_name}
              </option>
            ))}
          </Select>
        </td>

        {/* Cost */}
        <td className="border border-gray-300 px-2 py-1 text-xs" style={{ width: '120px', minWidth: '120px' }}>
          <Input
            type="number"
            step="0.01"
            value={costValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setCostValue(e.target.value);
              handleFieldUpdate("cost", e.target.value, lineItem.cost || "0");
            }}
            placeholder="Auto"
            className="text-xs h-7 w-full"
          />
        </td>

        {/* Rate */}
        <td className="border border-gray-300 px-2 py-1 text-xs" style={{ width: '120px', minWidth: '120px' }}>
          <Input
            type="number"
            step="0.01"
            value={rateValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setRateValue(e.target.value);
              handleFieldUpdate("rate", e.target.value, lineItem.rate || "0");
            }}
            placeholder="Auto"
            className="text-xs h-7 w-full"
          />
        </td>

        {/* Start Date */}
        <td className="border border-gray-300 px-2 py-1 text-xs">
          <Input
            type="date"
            value={startDateValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setStartDateValue(e.target.value);
              handleFieldUpdate(
                "start_date",
                e.target.value,
                lineItem.start_date
              );
            }}
            className="text-xs h-7 w-full"
          />
        </td>

        {/* End Date */}
        <td className="border border-gray-300 px-2 py-1 text-xs">
          <Input
            type="date"
            value={endDateValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setEndDateValue(e.target.value);
              handleFieldUpdate("end_date", e.target.value, lineItem.end_date);
            }}
            className="text-xs h-7 w-full"
          />
        </td>

        {/* Billable */}
        <td className="border border-gray-300 px-2 py-1 text-xs text-center">
          <input
            type="checkbox"
            checked={billableValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const newValue = e.target.checked;
              setBillableValue(newValue);
              handleFieldUpdate("billable", newValue ? "true" : "false", String(lineItem.billable ?? true));
            }}
            className="h-4 w-4"
          />
        </td>

        {/* Actions */}
        <td className="border border-gray-300 px-2 py-1">
          <div className="flex gap-2">
            <button
              onClick={() => setIsAutoFillOpen(true)}
              className="text-xs text-blue-600 hover:underline"
              title="Auto-fill hours"
            >
              Fill
            </button>
            <button
              onClick={async () => {
                if (deleteLineItemMutation.isPending) {
                  console.log("Delete already in progress, ignoring click");
                  return; // Prevent multiple clicks
                }
                console.log("Delete button clicked for line item:", lineItem.id);
                if (confirm("Are you sure you want to delete this line item?")) {
                  console.log("User confirmed deletion");
                  try {
                    console.log("Calling mutateAsync with:", { estimateId, lineItemId: lineItem.id });
                    await deleteLineItemMutation.mutateAsync({
                      estimateId,
                      lineItemId: lineItem.id,
                    });
                    // Success - the optimistic update already removed it from UI
                    console.log("Line item deleted successfully, ID:", lineItem.id);
                  } catch (err) {
                    console.error("Failed to delete line item:", err);
                    alert(`Failed to delete line item: ${err instanceof Error ? err.message : String(err)}`);
                  }
                } else {
                  console.log("User cancelled deletion");
                }
              }}
              disabled={deleteLineItemMutation.isPending}
              className="text-xs text-red-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              title="Delete line item"
            >
              {deleteLineItemMutation.isPending ? "Deleting..." : "Delete"}
            </button>
          </div>
        </td>

        {/* Weekly Hours */}
        {weeks.map((week) => {
          const weekKey = getWeekKey(week);
          const hours = weeklyHoursValues.get(weekKey) || weeklyHoursMap.get(weekKey) || "0";
                      const weekDate = new Date(week); // week is already a Date object
                      const startDate = parseLocalDate(startDateValue);
                      const endDate = parseLocalDate(endDateValue);
                      // Check if week overlaps with date range (week starts Sunday, ends Saturday)
                      // A week overlaps if the Start or End Date is ON or BETWEEN Sunday through Saturday
                      const weekEnd = new Date(weekDate);
                      weekEnd.setDate(weekEnd.getDate() + 6); // End of week (Saturday)
                      // Normalize dates to midnight for accurate comparison
                      const weekStartNormalized = new Date(weekDate.getFullYear(), weekDate.getMonth(), weekDate.getDate());
                      const weekEndNormalized = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate());
                      const startDateNormalized = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                      const endDateNormalized = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
                      const isInRange = weekStartNormalized <= endDateNormalized && weekEndNormalized >= startDateNormalized;

          return (
            <td
              key={weekKey}
              className={`border border-gray-300 px-1 py-1 ${
                isInRange ? "bg-blue-50" : "bg-gray-50"
              }`}
              style={{ width: '120px', minWidth: '120px' }}
            >
              <Input
                type="number"
                step="0.1"
                value={hours}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const newHours = e.target.value;
                  setWeeklyHoursValues((prev: Map<string, string>) => {
                    const next = new Map(prev);
                    next.set(weekKey, newHours);
                    return next;
                  });
                  handleWeeklyHoursUpdate(weekKey, newHours);
                }}
                placeholder="0"
                disabled={!isInRange}
                className="text-xs h-7 w-full text-center"
              />
            </td>
          );
        })}

        {/* Totals */}
        <td className="sticky right-0 z-10 bg-white border border-gray-300 px-2 py-1 text-xs font-semibold">
          {totalHours.toFixed(1)}
        </td>
        <td className="border border-gray-300 px-2 py-1 text-xs font-semibold">
          {currency} {totalCost.toFixed(2)}
        </td>
        <td className="border border-gray-300 px-2 py-1 text-xs font-semibold">
          {currency} {totalRevenue.toFixed(2)}
        </td>
        <td className="border border-gray-300 px-2 py-1 text-xs font-semibold">
          {currency} {marginAmount.toFixed(2)}
        </td>
        <td className="border border-gray-300 px-2 py-1 text-xs font-semibold">
          {marginPercentage.toFixed(1)}%
        </td>
      </tr>
      {isAutoFillOpen && (
        <AutoFillDialog
          lineItem={lineItem}
          onClose={() => setIsAutoFillOpen(false)}
          onSuccess={() => {
            setIsAutoFillOpen(false);
            // The query will automatically refetch
          }}
        />
      )}
    </>
  );
}

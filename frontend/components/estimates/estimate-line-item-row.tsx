"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import type { EstimateLineItem, EstimateDetailResponse, EstimateLineItemUpdate } from "@/types/estimate";
import { AutoFillDialog } from "./auto-fill-dialog";
import { useUpdateLineItem } from "@/hooks/useEstimates";
import { useDeleteLineItem } from "@/hooks/useEstimates";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useRoles, useRole } from "@/hooks/useRoles";
import { useRolesForDeliveryCenter } from "@/hooks/useEstimates";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useEmployees, useEmployee } from "@/hooks/useEmployees";
import { convertCurrency } from "@/lib/utils/currency";
import { estimatesApi } from "@/lib/api/estimates";
import { useQueryClient } from "@tanstack/react-query";

interface EstimateLineItemRowProps {
  lineItem: EstimateLineItem;
  weeks: Date[];
  currency: string;
  estimateId: string;
  opportunityDeliveryCenterId?: string; // Opportunity Invoice Center (delivery_center_id)
  onContextMenu?: (e: React.MouseEvent) => void;
  readOnly?: boolean;
}

export function EstimateLineItemRow({
  lineItem,
  weeks,
  currency,
  estimateId,
  opportunityDeliveryCenterId,
  onContextMenu,
  readOnly = false,
}: EstimateLineItemRowProps) {
  const [isAutoFillOpen, setIsAutoFillOpen] = useState(false);
  const queryClient = useQueryClient();
  const updateLineItem = useUpdateLineItem();
  const deleteLineItemMutation = useDeleteLineItem();
  
  // Debug: Log when lineItem prop changes
  useEffect(() => {
    console.log("EstimateLineItemRow: lineItem prop changed", {
      id: lineItem.id,
      weeklyHoursCount: lineItem.weekly_hours?.length ?? 0
    });
  }, [lineItem.id, lineItem.weekly_hours?.length]);

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
  const [billableExpensePercentageValue, setBillableExpensePercentageValue] = useState(
    lineItem.billable_expense_percentage || "0"
  );
  
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
    setBillableExpensePercentageValue((prev) => {
      const newValue = lineItem.billable_expense_percentage || "0";
      return prev !== newValue ? newValue : prev;
    });
  }, [lineItem.id, lineItem.cost, lineItem.rate, lineItem.start_date, lineItem.end_date, lineItem.delivery_center_id, lineItem.role_id, lineItem.employee_id, lineItem.billable, lineItem.billable_expense_percentage]);

  // Weekly hours editing state
  const [weeklyHoursValues, setWeeklyHoursValues] = useState<Map<string, string>>(
    new Map()
  );
  const hoursSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only show roles that have RoleRate associations with Opportunity Invoice Center
  const { data: rolesData } = useRolesForDeliveryCenter(opportunityDeliveryCenterId);
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: employeesData } = useEmployees({ limit: 100 });

  // Fetch role details when role is selected (to get role rates)
  const { data: selectedRoleData } = useRole(roleValue || "", true, {
    enabled: !!roleValue,
  });

  // Fetch employee details when employee is selected (to get employee rates)
  const { data: selectedEmployeeData } = useEmployee(employeeValue || "", false, {
    enabled: !!employeeValue,
  });

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

  // Initialize weekly hours map - update whenever lineItem or weekly_hours changes
  useEffect(() => {
    // Skip updates if we're currently in the middle of an update to prevent feedback loops
    if (isUpdatingRef.current) {
      return;
    }
    
    console.log("EstimateLineItemRow: Building hoursMap from weekly_hours", {
      weeklyHoursCount: lineItem.weekly_hours?.length ?? 0,
      weeklyHours: lineItem.weekly_hours
    });
    
    const hoursMap = new Map<string, string>();
    lineItem.weekly_hours?.forEach((wh, index) => {
      // Parse the week_start_date from backend
      const weekDate = parseLocalDate(wh.week_start_date);
      
      // Backend now stores Sunday dates, but we need to handle both:
      // 1. If it's already a Sunday (new data), use it directly
      // 2. If it's a Monday (old data), convert to Sunday
      const dayOfWeek = weekDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
      
      let sundayDate: Date;
      if (dayOfWeek === 0) {
        // Already Sunday (new format)
        sundayDate = weekDate;
      } else if (dayOfWeek === 1) {
        // Monday (old format) - convert to previous Sunday
        sundayDate = new Date(weekDate);
        sundayDate.setDate(sundayDate.getDate() - 1);
      } else {
        // Other day - shouldn't happen, but convert to Sunday of that week
        const daysSinceSunday = dayOfWeek;
        sundayDate = new Date(weekDate);
        sundayDate.setDate(sundayDate.getDate() - daysSinceSunday);
      }
      
      const weekKey = formatDateKey(sundayDate);
      
      // If we already have a value for this week key, prefer Sunday records (dayOfWeek === 0) over Monday records (dayOfWeek === 1)
      // This handles the case where we have both old Monday records and new Sunday records for the same week
      if (hoursMap.has(weekKey)) {
        // Find the existing record that's already in the map
        const existingRecord = lineItem.weekly_hours?.find((existingWh, existingIndex) => {
          if (existingIndex >= index) return false; // Only check records we've already processed
          const existingDate = parseLocalDate(existingWh.week_start_date);
          const existingDayOfWeek = existingDate.getDay();
          let existingSunday: Date;
          if (existingDayOfWeek === 0) {
            existingSunday = existingDate;
          } else if (existingDayOfWeek === 1) {
            existingSunday = new Date(existingDate);
            existingSunday.setDate(existingSunday.getDate() - 1);
          } else {
            existingSunday = new Date(existingDate);
            existingSunday.setDate(existingSunday.getDate() - existingDayOfWeek);
          }
          return formatDateKey(existingSunday) === weekKey;
        });
        
        const existingDayOfWeek = existingRecord ? parseLocalDate(existingRecord.week_start_date).getDay() : 1;
        
        // Prefer Sunday (0) over Monday (1) or any other day
        if (dayOfWeek === 0 && existingDayOfWeek !== 0) {
          // Current record is Sunday, existing is not - replace it
          hoursMap.set(weekKey, wh.hours);
          console.log(`  [${index}] OVERWRITING with Sunday record: week_start_date=${wh.week_start_date}, weekKey=${weekKey}, hours=${wh.hours} (replacing ${existingRecord?.week_start_date})`);
        } else {
          // Keep existing, skip current
          console.log(`  [${index}] SKIPPING duplicate: week_start_date=${wh.week_start_date}, weekKey=${weekKey}, hours=${wh.hours} (keeping existing ${existingRecord?.week_start_date})`);
        }
      } else {
        hoursMap.set(weekKey, wh.hours);
        console.log(`  [${index}] ADDING: week_start_date=${wh.week_start_date}, parsed=${weekDate.toISOString().split('T')[0]}, dayOfWeek=${dayOfWeek}, convertedSunday=${weekKey}, hours=${wh.hours}`);
      }
    });
    
    console.log("EstimateLineItemRow: Final hoursMap", {
      size: hoursMap.size,
      keys: Array.from(hoursMap.keys()),
      entries: Array.from(hoursMap.entries())
    });
    
    setWeeklyHoursValues(hoursMap);
  }, [
    lineItem.id,
    // Use JSON.stringify to create a stable dependency that detects any changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(lineItem.weekly_hours?.map(wh => ({
      week_start_date: wh.week_start_date,
      hours: wh.hours
    })) ?? [])
  ]);

  // Create a map of weekly hours for quick lookup (same conversion logic as useEffect)
  const weeklyHoursMap = new Map<string, string>();
  lineItem.weekly_hours?.forEach((wh) => {
    const weekDate = parseLocalDate(wh.week_start_date);
    const dayOfWeek = weekDate.getDay();
    
    let sundayDate: Date;
    if (dayOfWeek === 0) {
      sundayDate = weekDate;
    } else if (dayOfWeek === 1) {
      // Monday (old format) - convert to previous Sunday
      sundayDate = new Date(weekDate);
      sundayDate.setDate(sundayDate.getDate() - 1);
    } else {
      const daysSinceSunday = dayOfWeek;
      sundayDate = new Date(weekDate);
      sundayDate.setDate(sundayDate.getDate() - daysSinceSunday);
    }
    
    const weekKey = formatDateKey(sundayDate);
    weeklyHoursMap.set(weekKey, wh.hours);
  });

  // Calculate totals - only for weeks that overlap with date range
  const startDate = parseLocalDate(startDateValue);
  const endDate = parseLocalDate(endDateValue);
  const totalHours: number = weeks.reduce((sum: number, week: Date) => {
    const weekKey = getWeekKey(week);
    const weekDate = week; // week is already a Date object
    // Check if week overlaps with item date range (week starts Sunday, ends Saturday)
    const weekEnd = new Date(weekDate);
    weekEnd.setDate(weekEnd.getDate() + 6); // End of week (Saturday)
    
    // Only include hours for weeks that overlap with the date range
    if (weekDate <= endDate && weekEnd >= startDate) {
      const hours = weeklyHoursValues.get(weekKey) || weeklyHoursMap.get(weekKey) || "0";
      return sum + parseFloat(hours || "0");
    }
    return sum;
  }, 0);
  const totalCost: number = totalHours * parseFloat(costValue || "0");
  const totalRevenue: number = totalHours * parseFloat(rateValue || "0");
  const billableExpensePercentage: number = parseFloat(billableExpensePercentageValue || "0");
  const billableExpenseAmount: number = (billableExpensePercentage / 100) * totalRevenue;
  const marginAmount: number = totalRevenue - totalCost;
  // Margin % with expenses: (revenue - cost) / (revenue + expenses)
  const marginPercentageWithExpenses: number = (totalRevenue + billableExpenseAmount) > 0 
    ? (marginAmount / (totalRevenue + billableExpenseAmount)) * 100 
    : 0;
  // Margin % without expenses: (revenue - cost) / revenue
  const marginPercentageWithoutExpenses: number = totalRevenue > 0 
    ? (marginAmount / totalRevenue) * 100 
    : 0;

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
    if (readOnly) {
      return; // Don't allow updates when read-only
    }
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
        const updateData: Partial<EstimateLineItemUpdate> = {};
        if (field === "billable") {
          // Handle billable as boolean - value is string "true"/"false"
          updateData.billable = value === "true" || value === "True";
        } else if (field === "billable_expense_percentage") {
          updateData.billable_expense_percentage = value;
        } else if (field === "employee_id") {
          // For employee_id, send null when clearing (empty string becomes null)
          // This allows the backend to properly clear the association
          updateData.employee_id = value === "" || value === undefined ? null : value;
        } else if (field === "cost") {
          updateData.cost = value;
        } else if (field === "rate") {
          updateData.rate = value;
        } else if (field === "start_date") {
          updateData.start_date = value;
        } else if (field === "end_date") {
          updateData.end_date = value;
        } else if (field === "delivery_center_id") {
          updateData.delivery_center_id = value;
        } else if (field === "role_id") {
          updateData.role_id = value;
        } else if (field === "currency") {
          updateData.currency = value;
        } else if (field === "row_order") {
          updateData.row_order = value ? parseInt(value, 10) : undefined;
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
        else if (field === "billable_expense_percentage") setBillableExpensePercentageValue(originalValue || "0");
      }
    }, 500); // 500ms debounce
  }, [estimateId, lineItem.id, updateLineItem, readOnly]);
  
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

  // Track previous role and employee to detect changes
  const prevRoleRef = useRef<string>(roleValue);
  const prevEmployeeRef = useRef<string>(employeeValue);
  const lastPopulatedRoleDataRef = useRef<string>("");

  // When Role is selected, update Cost and Rate based on Opportunity Invoice Center & Role
  // IMPORTANT: Only auto-populate when role/employee changes, NOT when lineItem updates
  useEffect(() => {
    // Skip if we're currently updating to prevent feedback loops
    if (isUpdatingRef.current) {
      if (roleValue !== prevRoleRef.current) {
        prevRoleRef.current = roleValue;
        lastPopulatedRoleDataRef.current = ""; // Reset when role changes
      }
      return;
    }

    // Only proceed if role actually changed (not just on every render)
    const roleChanged = roleValue !== prevRoleRef.current;
    if (!roleChanged) {
      return; // Don't auto-populate if role didn't change
    }

    // Need roleValue, opportunity delivery center, and selectedRoleData to proceed
    if (!roleValue || !opportunityDeliveryCenterId || !selectedRoleData) {
      // If role changed but data not loaded yet, update ref
      prevRoleRef.current = roleValue;
      lastPopulatedRoleDataRef.current = ""; // Reset when role changes
      return;
    }

    // Check if we've already populated for this role+opportunity+currency combination
    const currentKey = `${roleValue}-${opportunityDeliveryCenterId}-${currency}`;
    
    // Reset the populated flag when role changes
    lastPopulatedRoleDataRef.current = "";
    
    // Skip if we've already populated for this exact combination
    if (lastPopulatedRoleDataRef.current === currentKey) {
      prevRoleRef.current = roleValue;
      return;
    }

    // Find the role rate that matches opportunity delivery center and currency
    // Compare as strings to handle UUID string comparison
    const matchingRate = selectedRoleData.role_rates?.find(
      (rate) =>
        String(rate.delivery_center_id) === String(opportunityDeliveryCenterId) &&
        rate.default_currency === currency
    );

    let newCost: string;
    let newRate: string;

    if (matchingRate) {
      // Update both cost and rate from the role rate
      newCost = String(matchingRate.internal_cost_rate || "0");
      newRate = String(matchingRate.external_rate || "0");
    } else {
      // Fallback to role default rates if no matching rate found
      // Use selectedRoleData which has full role info including defaults
      if (selectedRoleData) {
        newCost = String(selectedRoleData.role_internal_cost_rate || "0");
        newRate = String(selectedRoleData.role_external_rate || "0");
      } else {
        prevRoleRef.current = roleValue;
        return;
      }
    }

    // Update Rate always (Rate always comes from Role) - but ONLY when role changes
    setRateValue(newRate);
    handleFieldUpdate("rate", newRate, lineItem.rate || "0");

    // Update Cost only if NO employee is selected (if employee selected, Cost comes from employee)
    const hasEmployee = !!employeeValue;
    if (!hasEmployee) {
      setCostValue(newCost);
      handleFieldUpdate("cost", newCost, lineItem.cost || "0");
    }

    prevRoleRef.current = roleValue;
    lastPopulatedRoleDataRef.current = currentKey; // Mark as populated
  }, [roleValue, employeeValue, opportunityDeliveryCenterId, currency, selectedRoleData, rolesData, handleFieldUpdate, lineItem.cost, lineItem.rate]);

  // When Employee is selected or cleared, update Cost accordingly
  useEffect(() => {
    // Skip if we're currently updating to prevent feedback loops
    if (isUpdatingRef.current) {
      if (employeeValue !== prevEmployeeRef.current) {
        prevEmployeeRef.current = employeeValue;
      }
      return;
    }

    // Only proceed if employee actually changed
    if (employeeValue === prevEmployeeRef.current) {
      return;
    }

    // If employee was cleared (set to empty), revert Cost to Role-based cost
    if (!employeeValue) {
      // Need role and opportunity delivery center to get role-based cost
      if (roleValue && opportunityDeliveryCenterId && selectedRoleData) {
        // Find the role rate that matches opportunity delivery center and currency
        const matchingRate = selectedRoleData.role_rates?.find(
          (rate) =>
            String(rate.delivery_center_id) === String(opportunityDeliveryCenterId) &&
            rate.default_currency === currency
        );

        let newCost: string;
        if (matchingRate) {
          newCost = String(matchingRate.internal_cost_rate || "0");
        } else {
          // Fallback to role default rates if no matching rate found
          // Use selectedRoleData which has full role info including defaults
          if (selectedRoleData) {
            newCost = String(selectedRoleData.role_internal_cost_rate || "0");
          } else {
            prevEmployeeRef.current = employeeValue;
            return;
          }
        }

        // Update cost to role-based cost
        setCostValue(newCost);
        // Trigger save - only cost, NOT rate (use original value from lineItem)
        handleFieldUpdate("cost", newCost, lineItem.cost || "0");
      }
      prevEmployeeRef.current = employeeValue;
      return;
    }

    // Employee was selected - update cost from employee's rates based on delivery center matching
    if (!selectedEmployeeData) {
      // Employee data not loaded yet, wait for it
      prevEmployeeRef.current = employeeValue;
      return;
    }

    // Get employee's delivery center ID from code
    const employeeDeliveryCenterId = selectedEmployeeData.delivery_center 
      ? deliveryCentersData?.items.find(dc => dc.code === selectedEmployeeData.delivery_center)?.id
      : null;
    
    // Compare Opportunity Invoice Center with Employee Delivery Center
    const centersMatch = opportunityDeliveryCenterId && employeeDeliveryCenterId 
      ? opportunityDeliveryCenterId === employeeDeliveryCenterId
      : false;

    // Determine which rate to use and whether to convert currency
    let employeeCost: number;
    const employeeCurrency = selectedEmployeeData.default_currency || "USD";
    
    if (centersMatch) {
      // Centers match: use internal_cost_rate with NO currency conversion
      employeeCost = selectedEmployeeData.internal_cost_rate || 0;
      console.log("Employee effect (line item row) - centers match, using internal_cost_rate without conversion", {
        originalCost: employeeCost,
        employeeCurrency,
        targetCurrency: currency,
      });
    } else {
      // Centers don't match: use internal_bill_rate with currency conversion
      employeeCost = selectedEmployeeData.internal_bill_rate || 0;
      console.log("Employee effect (line item row) - centers don't match, using internal_bill_rate with conversion", {
        originalCost: employeeCost,
        employeeCurrency,
        targetCurrency: currency,
        needsConversion: employeeCurrency.toUpperCase() !== currency.toUpperCase(),
      });
      
      // Convert to Opportunity Invoice Center Currency if different
      if (employeeCurrency.toUpperCase() !== currency.toUpperCase()) {
        const convertedCost = convertCurrency(employeeCost, employeeCurrency, currency);
        console.log("Currency conversion result:", {
          from: employeeCurrency,
          to: currency,
          original: employeeCost,
          converted: convertedCost,
        });
        employeeCost = convertedCost;
      }
    }
    
    const newCost = String(employeeCost);
    console.log("Updating Cost from Employee (line item row):", {
      centersMatch,
      rateUsed: centersMatch ? "internal_cost_rate" : "internal_bill_rate",
      originalCost: centersMatch ? selectedEmployeeData.internal_cost_rate : selectedEmployeeData.internal_bill_rate,
      employeeCurrency,
      convertedCost: employeeCost,
      newCost,
      currentCost: costValue,
    });
    
    // Always update cost from employee (don't check if changed, as it should update when employee changes)
    setCostValue(newCost);
    // Trigger save - only cost, NOT rate (use original value from lineItem)
    handleFieldUpdate("cost", newCost, lineItem.cost || "0");

    prevEmployeeRef.current = employeeValue;
  }, [employeeValue, roleValue, opportunityDeliveryCenterId, currency, selectedEmployeeData, selectedRoleData, rolesData, deliveryCentersData, handleFieldUpdate, lineItem.cost, costValue]);

  const handleWeeklyHoursUpdate = async (weekKey: string, hours: string) => {
    if (readOnly) {
      return; // Don't allow updates when read-only
    }
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
        console.log(`Saving weekly hours to database: weekKey=${weekKey}, hours=${hours}, lineItemId=${lineItem.id}`);
        
        // Save to database immediately
        const response = await estimatesApi.autoFillHours(estimateId, lineItem.id, {
          pattern: "custom",
          custom_hours: {
            [weekKey]: hours,
          },
        });
        
        console.log("Save response:", response);
        console.log("Response weekly_hours:", response?.[0]?.weekly_hours);
        
        // Invalidate cache to trigger refetch from database
        await queryClient.invalidateQueries({
          queryKey: ["estimates", "detail", estimateId, true],
        });
        
        // Refetch to get fresh data from database
        await queryClient.refetchQueries({
          queryKey: ["estimates", "detail", estimateId, true],
        });
        
        console.log("Refetch completed, checking data...");
        const freshData = queryClient.getQueryData<EstimateDetailResponse>(["estimates", "detail", estimateId, true]);
        const freshLineItem = freshData?.line_items?.find(item => item.id === lineItem.id);
        console.log("Fresh line item weekly_hours:", freshLineItem?.weekly_hours);
      } catch (err) {
        console.error("Failed to update weekly hours:", err);
        // Revert on error - get the original value from the prop
        const originalHours = weeklyHoursMap.get(weekKey) || "0";
        setWeeklyHoursValues((prev: Map<string, string>) => {
          const next = new Map(prev);
          next.set(weekKey, originalHours);
          return next;
        });
      }
    }, 300); // Reduced debounce for faster save
  };


  return (
    <>
      <tr className="hover:bg-gray-50" onContextMenu={onContextMenu}>
        {/* Delivery Center */}
        <td className="border border-gray-300 px-2 py-1 text-xs">
          <Select
            value={deliveryCenterValue}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              const newValue = e.target.value;
              setDeliveryCenterValue(newValue);
              // Payable Center (delivery_center_id) can be updated independently
              // Backend will handle it using current role_id and Opportunity Invoice Center for rate lookup
              handleFieldUpdate(
                "delivery_center_id",
                newValue,
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
            {rolesData?.map((role: { id: string; role_name: string }) => (
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
              const newValue = e.target.value;
              setEmployeeValue(newValue);
              // Pass empty string when clearing - handleFieldUpdate will convert to null
              handleFieldUpdate(
                "employee_id",
                newValue || "",
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
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500">{currency}</span>
            <Input
              type="number"
              step="0.01"
              value={costValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setCostValue(e.target.value);
                handleFieldUpdate("cost", e.target.value, lineItem.cost || "0");
              }}
              placeholder="Auto"
              className="text-xs h-7 flex-1"
            />
          </div>
        </td>

        {/* Rate */}
        <td className="border border-gray-300 px-2 py-1 text-xs" style={{ width: '120px', minWidth: '120px' }}>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500">{currency}</span>
            <Input
              type="number"
              step="0.01"
              value={rateValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setRateValue(e.target.value);
                handleFieldUpdate("rate", e.target.value, lineItem.rate || "0");
              }}
              placeholder="Auto"
              className="text-xs h-7 flex-1"
            />
          </div>
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

        {/* Actions */}
        <td className="border border-gray-300 px-2 py-1" style={{ minWidth: '100px' }}>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => setIsAutoFillOpen(true)}
              className="text-xs text-blue-600 hover:underline cursor-pointer whitespace-nowrap"
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
                if (confirm("Are you sure you want to delete this line item and all its weekly hours?")) {
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
              disabled={deleteLineItemMutation.isPending || readOnly}
              className="text-xs text-red-600 hover:underline cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              title={readOnly ? "Estimate is locked by active quote" : "Delete line item and weekly hours"}
            >
              {deleteLineItemMutation.isPending ? "Deleting..." : "Delete"}
            </button>
          </div>
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

        {/* Billable Expense Percentage */}
        <td className="border border-gray-300 px-2 py-1 text-xs" style={{ width: '120px', minWidth: '120px' }}>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={billableExpensePercentageValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setBillableExpensePercentageValue(e.target.value);
                handleFieldUpdate("billable_expense_percentage", e.target.value, lineItem.billable_expense_percentage || "0");
              }}
              placeholder="0"
              className="text-xs h-7 flex-1"
            />
            <span className="text-[10px] text-gray-500">%</span>
          </div>
        </td>

        {/* Weekly Hours */}
        {weeks.map((week) => {
          const weekKey = getWeekKey(week);
          const hours = weeklyHoursValues.get(weekKey) || weeklyHoursMap.get(weekKey) || "0";
          
          // Calculate if this week is within the date range
          // week is already a Date object (Sunday of the week)
          const weekDate = week;
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
                  const newHours = e.target.value || "0";
                  console.log(`Input onChange: weekKey=${weekKey}, oldValue=${hours}, newValue=${newHours}`);
                  setWeeklyHoursValues((prev: Map<string, string>) => {
                    const next = new Map(prev);
                    next.set(weekKey, newHours);
                    console.log(`Updated weeklyHoursValues map, weekKey=${weekKey} now has value=${next.get(weekKey)}`);
                    return next;
                  });
                  handleWeeklyHoursUpdate(weekKey, newHours);
                }}
                placeholder="0"
                disabled={!isInRange || readOnly}
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
        <td className="border border-gray-300 px-2 py-1 text-xs font-semibold bg-gray-50">
          {currency} {billableExpenseAmount.toFixed(2)}
        </td>
        <td className="border border-gray-300 px-2 py-1 text-xs font-semibold">
          {currency} {marginAmount.toFixed(2)}
        </td>
        <td className="border border-gray-300 px-2 py-1 text-xs font-semibold">
          {marginPercentageWithoutExpenses.toFixed(1)}%
        </td>
        <td className="border border-gray-300 px-2 py-1 text-xs font-semibold">
          {marginPercentageWithExpenses.toFixed(1)}%
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

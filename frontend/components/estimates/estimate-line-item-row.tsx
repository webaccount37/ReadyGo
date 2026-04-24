"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { EstimateLineItem, EstimateDetailResponse, EstimateLineItemUpdate } from "@/types/estimate";
import { AutoFillDialog } from "./auto-fill-dialog";
import { useUpdateLineItem } from "@/hooks/useEstimates";
import { useDeleteLineItem } from "@/hooks/useEstimates";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useRole } from "@/hooks/useRoles";
import { useRolesForDeliveryCenter } from "@/hooks/useEstimates";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useEmployees, useEmployee } from "@/hooks/useEmployees";
import { convertCurrency } from "@/lib/utils/currency";
import { fingerprintRoleRates } from "@/lib/utils/role-rate-fingerprint";
import { pickRoleRateForOpportunityInvoiceCenter } from "@/lib/utils/role-rate-picker";
import { estimatesApi } from "@/lib/api/estimates";
import { weekColumnOverlapsLineRange } from "@/lib/utils/week-column-line-range";
import { useQueryClient } from "@tanstack/react-query";

interface EstimateLineItemRowProps {
  lineItem: EstimateLineItem;
  weeks: Date[];
  currency: string;
  estimateId: string;
  opportunityDeliveryCenterId?: string; // Opportunity Invoice Center (delivery_center_id)
  invoiceCustomer?: boolean;
  billableExpenses?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
  readOnly?: boolean;
}

export function EstimateLineItemRow({
  lineItem,
  weeks,
  currency,
  estimateId,
  opportunityDeliveryCenterId,
  invoiceCustomer = true,
  billableExpenses = true,
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
  
  // Track if we're currently updating rates from role change (to prevent sync effect from overwriting)
  const isUpdatingRatesFromRoleRef = useRef(false);
  
  // Track if we're currently updating role_id (to prevent sync effect from overwriting)
  const isUpdatingRoleIdRef = useRef(false);
  
  // Track previous start_date to detect when it's moved later
  const prevStartDateRef = useRef<string>(lineItem.start_date.split("T")[0]);
  
  // Track previous billableExpenses to detect when it changes from true to false
  const prevBillableExpensesRef = useRef<boolean>(billableExpenses);
  
  // Update local state when lineItem prop changes (from refetch)
  // Only update if values actually changed to prevent unnecessary re-renders and feedback loops
  // (Same order as EngagementLineItemRow: rate/cost first, then bail on isUpdatingRef for other fields.)
  useEffect(() => {
    const startDateStr = lineItem.start_date.split("T")[0];
    const endDateStr = lineItem.end_date.split("T")[0];

    if (!isUpdatingRatesFromRoleRef.current) {
      setCostValue((prev) => {
        const newValue = lineItem.cost || "0";
        return prev !== newValue ? newValue : prev;
      });
      setRateValue((prev) => {
        const newValue = lineItem.rate || "0";
        return prev !== newValue ? newValue : prev;
      });
    }

    if (isUpdatingRef.current) {
      return;
    }

    setStartDateValue((prev) => {
      const newValue = startDateStr;
      if (prev !== newValue) {
        // Update the ref when start_date changes from prop
        prevStartDateRef.current = newValue;
        return newValue;
      }
      return prev;
    });
    setEndDateValue((prev) => {
      const newValue = endDateStr;
      return prev !== newValue ? newValue : prev;
    });
    setDeliveryCenterValue((prev) => {
      const newValue = lineItem.delivery_center_id;
      return prev !== newValue ? newValue : prev;
    });
    
    // CRITICAL: Don't sync role_id from backend if we're currently updating it
    // This prevents the sync effect from reverting the role change before backend processes it
    if (!isUpdatingRoleIdRef.current) {
      setRoleValue((prev) => {
        const newValue = lineItem.role_id;
        return prev !== newValue ? newValue : prev;
      });
    } else {
      console.log("Skipping role_id sync - updating from user change");
    }
    setEmployeeValue((prev) => {
      const newValue = lineItem.employee_id || "";
      return prev !== newValue ? newValue : prev;
    });
    setBillableValue((prev) => {
      if (!invoiceCustomer) {
        return prev !== false ? false : prev;
      }
      const newValue = lineItem.billable ?? true;
      return prev !== newValue ? newValue : prev;
    });
    setBillableExpensePercentageValue((prev) => {
      const newValue = lineItem.billable_expense_percentage || "0";
      return prev !== newValue ? newValue : prev;
    });
    // Intentionally omit local roleValue from deps — sync from server lineItem only to avoid
    // overwriting in-progress edits before debounced save completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    lineItem.id,
    lineItem.cost,
    lineItem.rate,
    lineItem.start_date,
    lineItem.end_date,
    lineItem.delivery_center_id,
    lineItem.role_id,
    lineItem.employee_id,
    lineItem.billable,
    lineItem.billable_expense_percentage,
    invoiceCustomer,
  ]);

  // Weekly hours editing state
  const [weeklyHoursValues, setWeeklyHoursValues] = useState<Map<string, string>>(
    new Map()
  );
  const hoursSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track which week keys are currently being edited to prevent backend data from overwriting user input
  const activelyEditingWeeksRef = useRef<Set<string>>(new Set());

  // Only show roles that have RoleRate associations with Opportunity Invoice Center
  const { data: rolesData } = useRolesForDeliveryCenter(opportunityDeliveryCenterId);
  const { data: deliveryCentersData, isLoading: isLoadingDeliveryCenters, isFetching: isFetchingDeliveryCenters } = useDeliveryCenters();

  const invoiceCenterDefaultCurrency = useMemo(() => {
    if (!opportunityDeliveryCenterId || !deliveryCentersData?.items?.length) return undefined;
    return deliveryCentersData.items.find(
      (d) => String(d.id) === String(opportunityDeliveryCenterId)
    )?.default_currency;
  }, [opportunityDeliveryCenterId, deliveryCentersData?.items]);
  const { data: employeesData } = useEmployees({ limit: 100 });

  const rolesSorted = useMemo(
    () =>
      rolesData
        ? [...rolesData].sort((a, b) => (a.role_name || "").localeCompare(b.role_name || ""))
        : undefined,
    [rolesData]
  );
  const employeesSorted = useMemo(
    () =>
      employeesData?.items
        ? [...employeesData.items].sort((a, b) =>
            `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
          )
        : undefined,
    [employeesData?.items]
  );

  // Fetch role details when role is selected (to get role rates)
  const { data: selectedRoleData, isLoading: isLoadingRole, isFetching: isFetchingRole } = useRole(roleValue || "", true, {
    enabled: !!roleValue,
  });

  // Fetch employee details when employee is selected (to get employee rates)
  const { data: selectedEmployeeData, isLoading: isLoadingEmployee, isFetching: isFetchingEmployee } = useEmployee(employeeValue || "", false, {
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
      weeklyHours: lineItem.weekly_hours,
      activelyEditingWeeks: Array.from(activelyEditingWeeksRef.current)
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
    
    // Only update values for weeks that are NOT currently being edited
    // This prevents backend data from overwriting user input while they're typing
    setWeeklyHoursValues((prev) => {
      const next = new Map(prev);
      hoursMap.forEach((value, key) => {
        // Only update if this week is not actively being edited
        if (!activelyEditingWeeksRef.current.has(key)) {
          next.set(key, value);
        }
      });
      // Also add any weeks from backend that don't exist in local state (and aren't being edited)
      hoursMap.forEach((value, key) => {
        if (!next.has(key) && !activelyEditingWeeksRef.current.has(key)) {
          next.set(key, value);
        }
      });
      return next;
    });
    // Snapshot weekly_hours via JSON.stringify; listing lineItem.weekly_hours duplicates intent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    lineItem.id,
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
  // If billable is false, Total Revenue should be 0 (non-billable roles don't generate revenue)
  const totalRevenue: number = billableValue ? totalHours * parseFloat(rateValue || "0") : 0;
  const billableExpensePercentage: number = parseFloat(billableExpensePercentageValue || "0");
  // Billable expenses are only calculated on billable revenue
  const billableExpenseAmount: number = billableValue ? (billableExpensePercentage / 100) * totalRevenue : 0;
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
    if (field === "billable" && !invoiceCustomer) {
      return;
    }
    if (value === originalValue) {
      return;
    }

    // role_id must not share the debounced timer with rate/cost/other fields: a follow-up
    // handleFieldUpdate("rate") from the role effect clears this timer and would drop the role save
    // (Engagement avoids this by not debouncing role_id the same way — mirror with an immediate save).
    if (field === "role_id") {
      isUpdatingRoleIdRef.current = true;
      isUpdatingRef.current = true;
      void (async () => {
        try {
          await updateLineItem.mutateAsync({
            estimateId,
            lineItemId: lineItem.id,
            data: { role_id: value },
          });
        } catch (err) {
          console.error(`Failed to update ${field}:`, err);
          setRoleValue(originalValue);
          isUpdatingRef.current = false;
          isUpdatingRoleIdRef.current = false;
          return;
        }
        setTimeout(() => {
          isUpdatingRef.current = false;
          setTimeout(() => {
            isUpdatingRoleIdRef.current = false;
          }, 500);
        }, 100);
      })();
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

        if (field === "start_date" && value) {
          prevStartDateRef.current = value;
        }
        
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
        else if (field === "employee_id") setEmployeeValue(originalValue || "");
        else if (field === "billable") setBillableValue(originalValue === "true" || originalValue === "True");
        else if (field === "billable_expense_percentage") setBillableExpensePercentageValue(originalValue || "0");
      }
    }, 500); // 500ms debounce
    // Intentionally narrow deps: debounced handler uses refs + latest closures from render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateId, lineItem.id, updateLineItem, readOnly, invoiceCustomer]);
  
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

  // One-shot default Payable when the API still has null (first paint). Intentionally does not
  // depend on handleFieldUpdate to avoid re-running on callback identity changes when other rows save.
  const defaultPayableAppliedRef = useRef(false);
  useEffect(() => {
    defaultPayableAppliedRef.current = false;
  }, [lineItem.id]);
  useEffect(() => {
    if (lineItem.delivery_center_id) {
      defaultPayableAppliedRef.current = false;
    }
  }, [lineItem.delivery_center_id, lineItem.id]);

  // Persist default Payable when API had null but Opportunity Invoice Center is known (first paint race)
  useEffect(() => {
    if (readOnly || !opportunityDeliveryCenterId) return;
    if (lineItem.delivery_center_id) return;
    if (defaultPayableAppliedRef.current) return;
    if (isUpdatingRef.current) return;
    defaultPayableAppliedRef.current = true;
    setDeliveryCenterValue(opportunityDeliveryCenterId);
    void handleFieldUpdate("delivery_center_id", opportunityDeliveryCenterId, "");
    // handleFieldUpdate omitted from deps: only re-run on line/opportunity data changes, not other rows' updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, opportunityDeliveryCenterId, lineItem.id, lineItem.delivery_center_id]);

  // Clear billable expense percentage when billableExpenses changes from true to false
  useEffect(() => {
    if (prevBillableExpensesRef.current && !billableExpenses) {
      // billableExpenses changed from true to false - clear the value
      if (billableExpensePercentageValue !== "0" && billableExpensePercentageValue !== "") {
        setBillableExpensePercentageValue("0");
        // Only update if not read-only and we have a valid line item
        if (!readOnly) {
          handleFieldUpdate("billable_expense_percentage", "0", lineItem.billable_expense_percentage || "0");
        }
      }
    }
    prevBillableExpensesRef.current = billableExpenses;
  }, [billableExpenses, billableExpensePercentageValue, lineItem.billable_expense_percentage, handleFieldUpdate, readOnly]);

  // Persist non-billable when opportunity is not invoice customer (DB may still be true until cascade)
  useEffect(() => {
    if (readOnly || invoiceCustomer) {
      return;
    }
    if (lineItem.billable) {
      handleFieldUpdate("billable", "false", String(lineItem.billable));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, invoiceCustomer, lineItem.id, lineItem.billable]);

  // Track previous role and employee to detect changes (align with Engagement row)
  const prevRoleRef = useRef<string | undefined>(roleValue);
  const prevEmployeeRef = useRef<string>(employeeValue);
  const lastPopulatedRoleDataRef = useRef<string>("");
  const roleRatesFingerprint = fingerprintRoleRates(selectedRoleData);

  // When Role is selected, update Cost and Rate from RoleRate. Do not advance prevRoleRef on loading/mismatch exits.
  // When Role is unchanged, keep persisted rate/cost (manual/quote values); only sync from Role after a Role change.
  useEffect(() => {
    const currentKey = `${roleValue}-${opportunityDeliveryCenterId}-${currency}`;
    const roleChanged = roleValue !== prevRoleRef.current;

    if (!roleValue || !opportunityDeliveryCenterId) {
      return;
    }

    if (isLoadingRole || isFetchingRole || !selectedRoleData) {
      return;
    }

    if (selectedRoleData.id !== roleValue) {
      return;
    }

    if (!roleChanged && lastPopulatedRoleDataRef.current === currentKey) {
      return;
    }

    const matchingRate = pickRoleRateForOpportunityInvoiceCenter(
      selectedRoleData.role_rates,
      opportunityDeliveryCenterId,
      invoiceCenterDefaultCurrency
    );

    let newCost: string;
    let newRate: string;

    if (matchingRate) {
      let baseCost = matchingRate.internal_cost_rate || 0;
      let baseRate = matchingRate.external_rate || 0;
      const roleRateCurrency =
        matchingRate.default_currency || invoiceCenterDefaultCurrency || "USD";

      if (roleRateCurrency.toUpperCase() !== currency.toUpperCase()) {
        baseRate = convertCurrency(baseRate, roleRateCurrency, currency);
        baseCost = convertCurrency(baseCost, roleRateCurrency, currency);
        if (!Number.isFinite(baseRate) || !Number.isFinite(baseCost)) {
          return;
        }
      }

      newCost = parseFloat(baseCost.toFixed(2)).toString();
      newRate = parseFloat(baseRate.toFixed(2)).toString();
    } else if (selectedRoleData.role_rates?.[0]) {
      const firstRate = selectedRoleData.role_rates[0];
      const fallbackCost = firstRate.internal_cost_rate ?? 0;
      const fallbackRate = firstRate.external_rate ?? 0;
      newCost = parseFloat(fallbackCost.toFixed(2)).toString();
      newRate = parseFloat(fallbackRate.toFixed(2)).toString();
    } else {
      return;
    }

    if (!Number.isFinite(parseFloat(newCost)) || !Number.isFinite(parseFloat(newRate))) {
      return;
    }

    const hasEmployee = !!employeeValue;

    // Persisted rate/cost must win on open/refetch — only apply Role defaults when the user changes Role.
    if (!roleChanged) {
      lastPopulatedRoleDataRef.current = currentKey;
      prevRoleRef.current = roleValue;
      return;
    }

    isUpdatingRatesFromRoleRef.current = true;

    setRateValue(newRate);
    handleFieldUpdate("rate", newRate, lineItem.rate || "0");

    if (!hasEmployee) {
      setCostValue(newCost);
      handleFieldUpdate("cost", newCost, lineItem.cost || "0");
    }

    setTimeout(() => {
      isUpdatingRatesFromRoleRef.current = false;
    }, 1000);

    prevRoleRef.current = roleValue;
    lastPopulatedRoleDataRef.current = currentKey;
  }, [
    roleValue,
    employeeValue,
    opportunityDeliveryCenterId,
    invoiceCenterDefaultCurrency,
    currency,
    selectedRoleData?.id,
    roleRatesFingerprint,
    handleFieldUpdate,
    isLoadingRole,
    isFetchingRole,
  ]);

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
      // CRITICAL: Also check if React Query is still loading/fetching to avoid using stale data
      if (roleValue && opportunityDeliveryCenterId && selectedRoleData && !isLoadingRole && !isFetchingRole) {
        // CRITICAL: Verify that selectedRoleData matches the current roleValue
        // This prevents using stale role data when role changes but React Query hasn't finished fetching yet
        if (selectedRoleData.id !== roleValue) {
          return;
        }

        const matchingRate = pickRoleRateForOpportunityInvoiceCenter(
          selectedRoleData.role_rates,
          opportunityDeliveryCenterId,
          invoiceCenterDefaultCurrency
        );

        let newCost: string;
        if (matchingRate) {
          let matchingCost = matchingRate.internal_cost_rate || 0;
          const roleRateCurrency =
            matchingRate.default_currency || invoiceCenterDefaultCurrency || "USD";
          if (roleRateCurrency.toUpperCase() !== currency.toUpperCase()) {
            matchingCost = convertCurrency(matchingCost, roleRateCurrency, currency);
            if (!Number.isFinite(matchingCost)) {
              return;
            }
          }
          newCost = parseFloat(matchingCost.toFixed(2)).toString();
        } else if (selectedRoleData.role_rates?.[0]) {
          const firstRate = selectedRoleData.role_rates[0];
          const fallbackCost = firstRate.internal_cost_rate ?? 0;
          newCost = parseFloat(fallbackCost.toFixed(2)).toString();
        } else {
          return;
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
    // CRITICAL: Also check if React Query is still loading/fetching to avoid using stale data
    if (!selectedEmployeeData || isLoadingEmployee || isFetchingEmployee) {
      return;
    }

    if (selectedEmployeeData.id !== employeeValue) {
      return;
    }

    if (!deliveryCentersData || isLoadingDeliveryCenters || isFetchingDeliveryCenters) {
      return;
    }

    // Get employee's delivery center ID from code
    const employeeDeliveryCenterId = selectedEmployeeData.delivery_center 
      ? deliveryCentersData.items.find(dc => dc.code === selectedEmployeeData.delivery_center)?.id
      : null;
    
    // Compare Opportunity Invoice Center with Employee Delivery Center
    // Convert to strings for comparison to handle UUID type differences
    const centersMatch = opportunityDeliveryCenterId && employeeDeliveryCenterId 
      ? String(opportunityDeliveryCenterId) === String(employeeDeliveryCenterId)
      : false;
    
    // Determine which rate to use and whether to convert currency
    let employeeCost: number;
    let employeeRate = 0;
    const employeeCurrency = selectedEmployeeData.default_currency || "USD";
    const currenciesMatch = employeeCurrency.toUpperCase() === currency.toUpperCase();
    const hasRole = !!roleValue;

    // Apply currency conversion rules for Employee Cost
    // Centers match AND currencies match → use internal_cost_rate, NO conversion
    // Centers match BUT currencies mismatch → use internal_cost_rate, WITH conversion
    // Centers don't match BUT currencies match → use internal_bill_rate, NO conversion
    // Centers don't match AND currencies mismatch → use internal_bill_rate, WITH conversion
    if (centersMatch) {
      employeeCost = selectedEmployeeData.internal_cost_rate || 0;
    } else {
      employeeCost = selectedEmployeeData.internal_bill_rate || 0;
    }

    // No role yet: Rate follows employee (Engagement Resource Plan); once Role exists, Rate comes from Role.
    if (!hasRole) {
      employeeRate = selectedEmployeeData.external_bill_rate || 0;
    }

    if (!currenciesMatch) {
      employeeCost = convertCurrency(employeeCost, employeeCurrency, currency);
      if (!Number.isFinite(employeeCost)) {
        return;
      }
      if (!hasRole) {
        employeeRate = convertCurrency(employeeRate, employeeCurrency, currency);
        if (!Number.isFinite(employeeRate)) {
          return;
        }
      }
    }

    const newCost = parseFloat(employeeCost.toFixed(2)).toString();
    const newRate = !hasRole ? parseFloat(employeeRate.toFixed(2)).toString() : rateValue;

    setCostValue(newCost);
    handleFieldUpdate("cost", newCost, lineItem.cost || "0");

    if (!hasRole && newRate !== rateValue) {
      setRateValue(newRate);
      handleFieldUpdate("rate", newRate, lineItem.rate || "0");
    }

    prevEmployeeRef.current = employeeValue;
  }, [
    employeeValue,
    roleValue,
    rateValue,
    opportunityDeliveryCenterId,
    invoiceCenterDefaultCurrency,
    currency,
    selectedEmployeeData,
    selectedRoleData?.id,
    roleRatesFingerprint,
    deliveryCentersData,
    handleFieldUpdate,
    isLoadingEmployee,
    isFetchingEmployee,
    isLoadingRole,
    isFetchingRole,
    isLoadingDeliveryCenters,
    isFetchingDeliveryCenters,
  ]);

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

    if (!weekColumnOverlapsLineRange(weekDate, startDate, endDate)) {
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
        
        // Remove from actively editing set after save completes
        // This allows the useEffect to sync the value from backend, but only after user is done typing
        setTimeout(() => {
          activelyEditingWeeksRef.current.delete(weekKey);
        }, 100);
        
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
        // Remove from actively editing set on error
        activelyEditingWeeksRef.current.delete(weekKey);
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
              // Do NOT clear role when Payable Center changes
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
              const newRoleId = e.target.value;
              console.log("Role select changed:", {
                oldRoleId: roleValue,
                newRoleId,
                lineItemRoleId: lineItem.role_id,
              });
              setRoleValue(newRoleId);
              if (!readOnly) {
                handleFieldUpdate("role_id", newRoleId, lineItem.role_id ?? "");
              }
            }}
            className="text-xs h-7 w-full"
          >
            <option value="">Select...</option>
            {rolesSorted?.map((role: { id: string; role_name: string }) => (
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
            {employeesSorted?.map((employee: { id: string; first_name: string; last_name: string }) => (
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
              }}
              onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                if (!readOnly && e.target.value !== (lineItem.cost || "0")) {
                  handleFieldUpdate("cost", e.target.value, lineItem.cost || "0");
                }
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
              }}
              onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                if (!readOnly && e.target.value !== (lineItem.rate || "0")) {
                  handleFieldUpdate("rate", e.target.value, lineItem.rate || "0");
                }
              }}
              placeholder="Auto"
              className="text-xs h-7 flex-1"
            />
          </div>
        </td>

        {/* Cost Daily */}
        <td className="border border-gray-300 px-2 py-1 text-xs" style={{ width: '120px', minWidth: '120px' }}>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500">{currency}</span>
            <span className="text-xs flex-1 text-right">
              {(parseFloat(costValue || "0") * 8).toFixed(2)}
            </span>
          </div>
        </td>

        {/* Rate Daily */}
        <td className="border border-gray-300 px-2 py-1 text-xs" style={{ width: '120px', minWidth: '120px' }}>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500">{currency}</span>
            <span className="text-xs flex-1 text-right">
              {(parseFloat(rateValue || "0") * 8).toFixed(2)}
            </span>
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
            checked={!invoiceCustomer ? false : billableValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const newValue = e.target.checked;
              setBillableValue(newValue);
              handleFieldUpdate("billable", newValue ? "true" : "false", String(lineItem.billable ?? true));
            }}
            disabled={readOnly || !invoiceCustomer}
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
                if (billableExpenses) {
                  setBillableExpensePercentageValue(e.target.value);
                  handleFieldUpdate("billable_expense_percentage", e.target.value, lineItem.billable_expense_percentage || "0");
                }
              }}
              placeholder="0"
              disabled={!billableExpenses || readOnly}
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
                  
                  // Mark this week as actively being edited
                  activelyEditingWeeksRef.current.add(weekKey);
                  
                  setWeeklyHoursValues((prev: Map<string, string>) => {
                    const next = new Map(prev);
                    next.set(weekKey, newHours);
                    console.log(`Updated weeklyHoursValues map, weekKey=${weekKey} now has value=${next.get(weekKey)}`);
                    return next;
                  });
                  handleWeeklyHoursUpdate(weekKey, newHours);
                }}
                onBlur={() => {
                  // Remove from actively editing set when user leaves the input
                  // Use a small delay to allow the save to complete first
                  setTimeout(() => {
                    activelyEditingWeeksRef.current.delete(weekKey);
                  }, 500);
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

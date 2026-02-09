"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRolesForDeliveryCenter } from "@/hooks/useEstimates";
import { useRole } from "@/hooks/useRoles";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useEmployees, useEmployee } from "@/hooks/useEmployees";
import { useCreateLineItem, useUpdateLineItem, useEngagementDetail, useDeleteLineItem } from "@/hooks/useEngagements";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { EngagementLineItemCreate, EngagementLineItemUpdate } from "@/types/engagement";
import { convertCurrency } from "@/lib/utils/currency";
import { EngagementAutoFillDialog } from "./auto-fill-dialog";
import { engagementsApi } from "@/lib/api/engagements";

interface EngagementEmptyRowProps {
  engagementId: string;
  weeks: Date[];
  currency: string;
  rowIndex: number;
  stableId: string;
  opportunityDeliveryCenterId?: string;
  invoiceCustomer?: boolean;
  billableExpenses?: boolean;
}

export function EngagementEmptyRow({
  engagementId,
  weeks,
  currency,
  rowIndex: _rowIndex,
  stableId,
  opportunityDeliveryCenterId,
  invoiceCustomer = true,
  billableExpenses = true,
}: EngagementEmptyRowProps) {
  const { data: rolesData } = useRolesForDeliveryCenter(opportunityDeliveryCenterId);
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: employeesData } = useEmployees({ limit: 100 });
  const createLineItem = useCreateLineItem();
  const updateLineItem = useUpdateLineItem();
  const deleteLineItemMutation = useDeleteLineItem();
  const queryClient = useQueryClient();
  const [isAutoFillOpen, setIsAutoFillOpen] = useState(false);

  // Initialize lineItemId from localStorage or null
  const getInitialLineItemId = (): string | null => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`engagement-line-item-id-${stableId}-${engagementId}-${_rowIndex}`);
      return saved || null;
    }
    return null;
  };

  const [lineItemId, setLineItemId] = useState<string | null>(getInitialLineItemId);
  const isReceivingBackendUpdateRef = useRef(false);

  // Fetch engagement detail to get the line item when it's created
  const { data: engagementDetail } = useEngagementDetail(engagementId, {
    enabled: true,
    refetchOnMount: "always",
    staleTime: 0,
  });

  // Get initial form data
  const getInitialFormData = (): Partial<EngagementLineItemCreate> => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`engagement-empty-row-${stableId}-${engagementId}-${_rowIndex}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return {
            ...parsed,
            currency: currency,
          };
        } catch {
          // Ignore parse errors
        }
      }
    }
    return {
      role_id: "",
      payable_center_id: opportunityDeliveryCenterId || undefined,
      employee_id: "",
      rate: "0",
      cost: "0",
      currency: currency,
      start_date: new Date().toISOString().split("T")[0],
      end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      billable: invoiceCustomer,
      billable_expense_percentage: "0",
    };
  };

  const [formData, setFormData] = useState<Partial<EngagementLineItemCreate>>(getInitialFormData);

  // Get line item if it exists
  const lineItem = lineItemId
    ? engagementDetail?.line_items?.find((item) => item.id === lineItemId)
    : null;

  // Check if this line item is already being rendered as EngagementLineItemRow
  const isRenderedAsLineItemRow = lineItemId && engagementDetail?.line_items?.some(item => item.id === lineItemId);
  
  // Clear formData and lineItemId if this specific row's lineItemId is already rendered
  useEffect(() => {
    if (isRenderedAsLineItemRow && lineItemId) {
      setLineItemId(null);
      setFormData(getInitialFormData());
      if (typeof window !== "undefined") {
        localStorage.removeItem(`engagement-line-item-id-${stableId}-${engagementId}-${_rowIndex}`);
        localStorage.removeItem(`engagement-empty-row-${stableId}-${engagementId}-${_rowIndex}`);
      }
    }
  }, [isRenderedAsLineItemRow, lineItemId, stableId, engagementId, _rowIndex, engagementDetail]);

  // Persist lineItemId to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (lineItemId) {
        localStorage.setItem(`engagement-line-item-id-${stableId}-${engagementId}-${_rowIndex}`, lineItemId);
      } else {
        localStorage.removeItem(`engagement-line-item-id-${stableId}-${engagementId}-${_rowIndex}`);
      }
    }
  }, [lineItemId, stableId, engagementId, _rowIndex]);

  // Fetch role details when role is selected
  const { data: selectedRoleData, isLoading: isLoadingRole, isFetching: isFetchingRole } = useRole(formData.role_id || "", true, {
    enabled: !!formData.role_id,
  });

  // Fetch employee details when employee is selected
  const { data: selectedEmployeeData, isLoading: isLoadingEmployee, isFetching: isFetchingEmployee } = useEmployee(formData.employee_id || "", false, {
    enabled: !!formData.employee_id,
  });

  // Save formData to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasData = formData.role_id || formData.payable_center_id || formData.employee_id || formData.rate || formData.cost;
      if (hasData) {
        localStorage.setItem(`engagement-empty-row-${stableId}-${engagementId}-${_rowIndex}`, JSON.stringify(formData));
      } else {
        localStorage.removeItem(`engagement-empty-row-${stableId}-${engagementId}-${_rowIndex}`);
      }
    }
  }, [formData, stableId, engagementId, _rowIndex]);

  // Clear localStorage when line item is created
  useEffect(() => {
    if (lineItemId && typeof window !== "undefined") {
      localStorage.removeItem(`engagement-empty-row-${stableId}-${engagementId}-${_rowIndex}`);
    }
  }, [lineItemId, stableId, engagementId, _rowIndex]);

  const [isSaving, setIsSaving] = useState(false);
  const isCreatingRef = useRef(false);
  const prevSavedDataRef = useRef<Partial<EngagementLineItemCreate>>({});
  const prevStartDateRef = useRef<string>(formData.start_date || "");
  const prevEndDateRef = useRef<string>(formData.end_date || "");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track previous role and employee to detect changes
  const prevRoleIdRef = useRef<string>(formData.role_id || "");
  const prevEmployeeIdRef = useRef<string>(formData.employee_id || "");
  const lastPopulatedRoleDataRef = useRef<string>("");
  const lastPopulatedEmployeeRef = useRef<string>("");

  // When Role is selected, update Cost and Rate
  useEffect(() => {
    // Skip if we're currently saving, creating, or receiving backend updates
    if (isSaving || isCreatingRef.current || isReceivingBackendUpdateRef.current) {
      if (formData.role_id !== prevRoleIdRef.current) {
        prevRoleIdRef.current = formData.role_id || "";
        lastPopulatedRoleDataRef.current = ""; // Reset when role changes
      }
      return;
    }

    // Need role_id, opportunity delivery center, and selectedRoleData to proceed
    // CRITICAL: Also check if React Query is still loading/fetching to avoid using stale data
    if (!formData.role_id || !opportunityDeliveryCenterId || !selectedRoleData || isLoadingRole || isFetchingRole) {
      // If role changed but data not loaded yet, update ref
      if (formData.role_id !== prevRoleIdRef.current) {
        prevRoleIdRef.current = formData.role_id || "";
        lastPopulatedRoleDataRef.current = "";
      }
      return;
    }

    if (selectedRoleData.id !== formData.role_id) {
      if (formData.role_id !== prevRoleIdRef.current) {
        prevRoleIdRef.current = formData.role_id || "";
        lastPopulatedRoleDataRef.current = "";
      }
      return;
    }

    const currentKey = `${formData.role_id}-${opportunityDeliveryCenterId}-${currency}`;
    const roleChanged = formData.role_id !== prevRoleIdRef.current;
    
    if (roleChanged) {
      lastPopulatedRoleDataRef.current = "";
    }
    
    if (!roleChanged && lastPopulatedRoleDataRef.current === currentKey) {
      return;
    }

    const matchingRate = selectedRoleData.role_rates?.find(
      (rate) => String(rate.delivery_center_id) === String(opportunityDeliveryCenterId)
    );

    let newCost: string;
    let newRate: string;
    let roleRateCurrency: string = currency;

    if (matchingRate) {
      let baseCost = matchingRate.internal_cost_rate || 0;
      let baseRate = matchingRate.external_rate || 0;
      roleRateCurrency = matchingRate.default_currency || currency;
      
      if (roleRateCurrency.toUpperCase() !== currency.toUpperCase()) {
        baseCost = convertCurrency(baseCost, roleRateCurrency, currency);
        baseRate = convertCurrency(baseRate, roleRateCurrency, currency);
      }
      
      newCost = parseFloat(baseCost.toFixed(2)).toString();
      newRate = parseFloat(baseRate.toFixed(2)).toString();
    } else {
      if (selectedRoleData) {
        const fallbackCost = selectedRoleData.role_internal_cost_rate || 0;
        const fallbackRate = selectedRoleData.role_external_rate || 0;
        newCost = parseFloat(fallbackCost.toFixed(2)).toString();
        newRate = parseFloat(fallbackRate.toFixed(2)).toString();
      } else {
        prevRoleIdRef.current = formData.role_id || "";
        return;
      }
    }

    const hasEmployee = !!formData.employee_id;
    
    // Only update if values actually changed to prevent unnecessary re-renders and saves
    const rateChanged = formData.rate !== newRate;
    const costChanged = !hasEmployee && formData.cost !== newCost;
    
    if (rateChanged || costChanged) {
      setFormData((prev) => {
        const updates: Partial<EngagementLineItemCreate> = {
          rate: newRate,
        };
        
        if (!hasEmployee) {
          updates.cost = newCost;
        }
        
        return { ...prev, ...updates };
      });
    }
    
    prevRoleIdRef.current = formData.role_id || "";
    lastPopulatedRoleDataRef.current = currentKey;
  }, [formData.role_id, formData.employee_id, opportunityDeliveryCenterId, currency, selectedRoleData, isSaving, isCreatingRef, isLoadingRole, isFetchingRole]);

  // When Employee is selected or cleared, update Cost accordingly
  useEffect(() => {
    // Skip if we're currently saving, creating, or receiving backend updates
    if (isSaving || isCreatingRef.current || isReceivingBackendUpdateRef.current) {
      if (formData.employee_id !== prevEmployeeIdRef.current) {
        prevEmployeeIdRef.current = formData.employee_id || "";
        lastPopulatedEmployeeRef.current = ""; // Reset when employee changes
      }
      return;
    }

    const currentEmployeeId = formData.employee_id || "";
    const employeeChanged = currentEmployeeId !== prevEmployeeIdRef.current;
    
    // If employee changed, reset the populated flag
    if (employeeChanged) {
      lastPopulatedEmployeeRef.current = "";
      prevEmployeeIdRef.current = currentEmployeeId;
    }
    
    // Skip if we've already populated cost for this employee (and employee hasn't changed)
    if (!employeeChanged && lastPopulatedEmployeeRef.current === currentEmployeeId) {
      return;
    }

    if (!currentEmployeeId) {
      if (formData.role_id && opportunityDeliveryCenterId && selectedRoleData && !isLoadingRole && !isFetchingRole) {
        if (selectedRoleData.id !== formData.role_id) {
          prevEmployeeIdRef.current = currentEmployeeId;
          return;
        }
        
        const matchingRate = selectedRoleData.role_rates?.find(
          (rate) => String(rate.delivery_center_id) === String(opportunityDeliveryCenterId)
        );

        let newCost: string;
        if (matchingRate) {
          let baseCost = matchingRate.internal_cost_rate || 0;
          const roleRateCurrency = matchingRate.default_currency || currency;
          
          if (roleRateCurrency.toUpperCase() !== currency.toUpperCase()) {
            baseCost = convertCurrency(baseCost, roleRateCurrency, currency);
          }
          
          newCost = parseFloat(baseCost.toFixed(2)).toString();
        } else {
          if (selectedRoleData) {
            const fallbackCost = selectedRoleData.role_internal_cost_rate || 0;
            newCost = parseFloat(fallbackCost.toFixed(2)).toString();
          } else {
            prevEmployeeIdRef.current = currentEmployeeId;
            return;
          }
        }

        // Update cost to role-based cost
        if (newCost !== formData.cost) {
          setFormData((prev) => ({
            ...prev,
            cost: newCost,
            // Rate is NOT updated - it stays based on Role
          }));
        }
      }
      prevEmployeeIdRef.current = currentEmployeeId;
      return;
    }

    // Employee was selected - update cost (and rate if no role) from employee's rates based on delivery center matching
    // CRITICAL: Also check if React Query is still loading/fetching to avoid using stale data
    if (!selectedEmployeeData || isLoadingEmployee || isFetchingEmployee) {
      // Employee data not loaded yet, wait for it
      prevEmployeeIdRef.current = currentEmployeeId;
      return;
    }

    // CRITICAL: Verify that selectedEmployeeData matches the current employee_id
    // This prevents using stale employee data when employee changes but React Query hasn't finished fetching yet
    if (selectedEmployeeData.id !== currentEmployeeId) {
      console.warn("Employee data mismatch detected (empty row):", {
        selectedEmployeeDataId: selectedEmployeeData.id,
        currentEmployeeId,
        isLoadingEmployee,
        isFetchingEmployee,
      });
      // Employee data doesn't match current selection - wait for correct data to load
      prevEmployeeIdRef.current = currentEmployeeId;
      return;
    }

    const employeeDeliveryCenterId = selectedEmployeeData.delivery_center 
      ? deliveryCentersData?.items.find(dc => dc.code === selectedEmployeeData.delivery_center)?.id
      : null;
    
    const centersMatch = opportunityDeliveryCenterId && employeeDeliveryCenterId 
      ? String(opportunityDeliveryCenterId) === String(employeeDeliveryCenterId)
      : false;

    // Determine which rate to use and whether to convert currency
    let employeeCost: number;
    let employeeRate: number = 0; // Initialize to avoid TypeScript error
    const employeeCurrency = selectedEmployeeData.default_currency || "USD";
    const currenciesMatch = employeeCurrency.toUpperCase() === currency.toUpperCase();
    const hasRole = !!formData.role_id;
    
    // Apply currency conversion rules for Employee Cost
    // Centers match AND currencies match → use internal_cost_rate, NO conversion
    // Centers match BUT currencies mismatch → use internal_cost_rate, WITH conversion
    // Centers don't match BUT currencies match → use internal_bill_rate, NO conversion
    // Centers don't match AND currencies mismatch → use internal_bill_rate, WITH conversion
    if (centersMatch) {
      // Centers match: use internal_cost_rate
      employeeCost = selectedEmployeeData.internal_cost_rate || 0;
    } else {
      // Centers don't match: use internal_bill_rate
      employeeCost = selectedEmployeeData.internal_bill_rate || 0;
    }
    
    // If no role selected, also get Rate from employee's external_bill_rate
    if (!hasRole) {
      employeeRate = selectedEmployeeData.external_bill_rate || 0;
    }
    
    // Convert to Opportunity Invoice Currency if currencies differ
    if (!currenciesMatch) {
      employeeCost = convertCurrency(employeeCost, employeeCurrency, currency);
      if (!hasRole) {
        employeeRate = convertCurrency(employeeRate, employeeCurrency, currency);
      }
    }
    
    // Round to 2 decimal places
    const newCost = parseFloat(employeeCost.toFixed(2)).toString();
    const newRate = !hasRole ? parseFloat(employeeRate.toFixed(2)).toString() : formData.rate;
    
    console.log("Updating Cost (and Rate if no role) from Employee:", {
      centersMatch,
      rateUsed: centersMatch ? "internal_cost_rate" : "internal_bill_rate",
      originalCost: centersMatch ? selectedEmployeeData.internal_cost_rate : selectedEmployeeData.internal_bill_rate,
      employeeCurrency,
      convertedCost: employeeCost,
      newCost,
      currentCost: formData.cost,
      hasRole,
      newRate: !hasRole ? newRate : "not updated (role exists)",
    });
    
    // Update cost always, and rate only if no role selected
    const updates: Partial<EngagementLineItemCreate> = {
      cost: newCost,
    };
    if (!hasRole && formData.rate !== newRate) {
      updates.rate = newRate;
    }
    
    setFormData((prev) => ({
      ...prev,
      ...updates,
    }));
    
    // Mark as populated
    lastPopulatedEmployeeRef.current = currentEmployeeId;

    prevEmployeeIdRef.current = currentEmployeeId;
  }, [formData.employee_id, formData.role_id, opportunityDeliveryCenterId, currency, selectedEmployeeData, selectedRoleData, rolesData, deliveryCentersData, isSaving, isCreatingRef, isLoadingEmployee, isFetchingEmployee, isLoadingRole, isFetchingRole]);

  // Auto-save function
  const saveToDatabase = useCallback(async () => {
    if (isSaving || isCreatingRef.current) {
      return;
    }

    const currentData = {
      role_id: formData.role_id,
      payable_center_id: formData.payable_center_id,
      employee_id: formData.employee_id,
      rate: formData.rate,
      cost: formData.cost,
      start_date: formData.start_date,
      end_date: formData.end_date,
    };

    const hasChanges = 
      prevSavedDataRef.current.role_id !== currentData.role_id ||
      prevSavedDataRef.current.payable_center_id !== currentData.payable_center_id ||
      prevSavedDataRef.current.employee_id !== currentData.employee_id ||
      prevSavedDataRef.current.rate !== currentData.rate ||
      prevSavedDataRef.current.cost !== currentData.cost ||
      prevSavedDataRef.current.start_date !== currentData.start_date ||
      prevSavedDataRef.current.end_date !== currentData.end_date;

    // If we have a line item ID, UPDATE it
    if (lineItemId) {
      if (!formData.role_id) {
        return;
      }

      if (!hasChanges) {
        return;
      }

      setIsSaving(true);
      try {
        const updateData: Partial<EngagementLineItemUpdate> = {
          role_id: formData.role_id,
          payable_center_id: formData.payable_center_id || opportunityDeliveryCenterId,
          employee_id: formData.employee_id || null,
          rate: formData.rate || "0",
          cost: formData.cost || "0",
          start_date: formData.start_date,
          end_date: formData.end_date,
          billable: invoiceCustomer ? (formData.billable ?? true) : false,
          billable_expense_percentage: billableExpenses ? (formData.billable_expense_percentage || "0") : "0",
        };

        await updateLineItem.mutateAsync({
          engagementId,
          lineItemId,
          data: updateData as any,
        });
        
        prevSavedDataRef.current = { ...currentData };
      } catch (err) {
        console.error("Failed to update line item:", err);
        prevSavedDataRef.current = { ...currentData };
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // If we DON'T have a line item ID but have role_id (required) OR (employee_id AND payable_center_id for role lookup), CREATE it
    // Note: Backend requires role_rates_id, so we need role_id to create. If only employee_id is set, we can't create yet.
    if (!lineItemId && formData.role_id) {
      isCreatingRef.current = true;
      setIsSaving(true);
      
      try {
        // Backend requires role_id and delivery_center_id (or role_rates_id) to create
        // Use payable_center_id if set, otherwise fall back to opportunityDeliveryCenterId
        const deliveryCenterId = formData.payable_center_id || opportunityDeliveryCenterId;
        if (!deliveryCenterId) {
          // Can't create without delivery center
          return;
        }
        
        const createData: any = {
          role_id: formData.role_id,
          delivery_center_id: deliveryCenterId, // Backend uses this to find role_rates_id
          payable_center_id: formData.payable_center_id || undefined,
          employee_id: formData.employee_id || undefined,
          rate: formData.rate || "0",
          cost: formData.cost || "0",
          currency: currency,
          start_date: formData.start_date,
          end_date: formData.end_date,
          billable: invoiceCustomer ? (formData.billable ?? true) : false,
          billable_expense_percentage: billableExpenses ? (formData.billable_expense_percentage || "0") : "0",
        };
        
        // Remove undefined fields
        if (!createData.employee_id) {
          delete createData.employee_id;
        }
        if (!createData.payable_center_id) {
          delete createData.payable_center_id;
        }
        
        const newLineItem = await createLineItem.mutateAsync({
          engagementId,
          data: createData,
        });
        
        setLineItemId(newLineItem.id);
        prevSavedDataRef.current = { ...currentData };
        prevStartDateRef.current = formData.start_date || "";
        prevEndDateRef.current = formData.end_date || "";
        
        await queryClient.invalidateQueries({
          queryKey: ["engagements", "detail", engagementId],
        });
      } catch (err) {
        console.error("Failed to create line item:", err);
        prevSavedDataRef.current = { ...currentData };
      } finally {
        isCreatingRef.current = false;
        setIsSaving(false);
      }
      return;
    }
  }, [lineItemId, formData.role_id, formData.payable_center_id, formData.employee_id, formData.rate, formData.cost, formData.start_date, formData.end_date, engagementId, createLineItem, updateLineItem, queryClient, isSaving, engagementDetail, opportunityDeliveryCenterId, currency, invoiceCustomer, billableExpenses]);

  // Helper function to get week key
  const getWeekKey = (week: Date): string => {
    const year = week.getFullYear();
    const month = String(week.getMonth() + 1).padStart(2, "0");
    const day = String(week.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Helper function to parse local date
  const parseLocalDate = (dateStr: string): Date => {
    const datePart = dateStr.split("T")[0];
    const [year, month, day] = datePart.split("-").map(Number);
    return new Date(year, month - 1, day);
  };

  // Handle start/end date changes - clear hours outside date range
  useEffect(() => {
    if (!lineItemId || isSaving || isCreatingRef.current) {
      return;
    }

    const newStartDateStr = formData.start_date || "";
    const newEndDateStr = formData.end_date || "";
    const oldStartDateStr = prevStartDateRef.current;
    const oldEndDateStr = prevEndDateRef.current;

    if (!newStartDateStr || !newEndDateStr || !oldStartDateStr || !oldEndDateStr) {
      prevStartDateRef.current = newStartDateStr;
      prevEndDateRef.current = newEndDateStr;
      return;
    }

    const newStartDate = parseLocalDate(newStartDateStr);
    const newEndDate = parseLocalDate(newEndDateStr);
    const oldStartDate = parseLocalDate(oldStartDateStr);
    const oldEndDate = parseLocalDate(oldEndDateStr);

    const weeksToClear: Record<string, string> = {};

    // Check if start date moved later - clear weeks before new start
    if (newStartDate > oldStartDate) {
      weeks.forEach((week) => {
        const weekKey = getWeekKey(week);
        const weekDate = week;
        if (weekDate < newStartDate) {
          // Check if this week has hours in the line item
          const lineItem = engagementDetail?.line_items?.find(item => item.id === lineItemId);
          const weekHasHours = lineItem?.weekly_hours?.some(wh => {
            const whDate = parseLocalDate(wh.week_start_date);
            return getWeekKey(whDate) === weekKey && parseFloat(wh.hours) > 0;
          });
          if (weekHasHours) {
            weeksToClear[weekKey] = "0";
          }
        }
      });
    }

    // Check if start date moved earlier - clear weeks before new start (if they're outside range)
    if (newStartDate < oldStartDate) {
      weeks.forEach((week) => {
        const weekKey = getWeekKey(week);
        const weekDate = week;
        if (weekDate < newStartDate) {
          const lineItem = engagementDetail?.line_items?.find(item => item.id === lineItemId);
          const weekHasHours = lineItem?.weekly_hours?.some(wh => {
            const whDate = parseLocalDate(wh.week_start_date);
            return getWeekKey(whDate) === weekKey && parseFloat(wh.hours) > 0;
          });
          if (weekHasHours) {
            weeksToClear[weekKey] = "0";
          }
        }
      });
    }

    // Check if end date moved earlier - clear weeks after new end
    if (newEndDate < oldEndDate) {
      weeks.forEach((week) => {
        const weekKey = getWeekKey(week);
        const weekDate = week;
        const weekEnd = new Date(weekDate);
        weekEnd.setDate(weekEnd.getDate() + 6); // Saturday
        if (weekEnd > newEndDate) {
          const lineItem = engagementDetail?.line_items?.find(item => item.id === lineItemId);
          const weekHasHours = lineItem?.weekly_hours?.some(wh => {
            const whDate = parseLocalDate(wh.week_start_date);
            return getWeekKey(whDate) === weekKey && parseFloat(wh.hours) > 0;
          });
          if (weekHasHours) {
            weeksToClear[weekKey] = "0";
          }
        }
      });
    }

    // Clear hours for weeks outside date range
    if (Object.keys(weeksToClear).length > 0) {
      console.log(`Clearing ${Object.keys(weeksToClear).length} weeks outside date range:`, weeksToClear);
      
      engagementsApi.autoFillHours(engagementId, lineItemId, {
        pattern: "custom",
        custom_hours: weeksToClear,
      }).then(() => {
        queryClient.invalidateQueries({
          queryKey: ["engagements", "detail", engagementId],
        });
      }).catch((err) => {
        console.error("Failed to clear hours for weeks outside date range:", err);
      });
    }

    prevStartDateRef.current = newStartDateStr;
    prevEndDateRef.current = newEndDateStr;
  }, [formData.start_date, formData.end_date, lineItemId, weeks, engagementId, engagementDetail, queryClient, isSaving]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Handle field updates with debounce (for onBlur)
  const handleFieldBlur = useCallback(async (field: string, value: string) => {
    if (isSaving || isCreatingRef.current) {
      return;
    }

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce the save
    saveTimeoutRef.current = setTimeout(async () => {
      if (!lineItemId) {
        // If no line item yet, trigger saveToDatabase which will create it if role/employee exists
        saveToDatabase();
        return;
      }

      setIsSaving(true);
      try {
        const updateData: Partial<EngagementLineItemUpdate> = {};
        if (field === "cost") {
          updateData.cost = value;
        } else if (field === "rate") {
          updateData.rate = value;
        } else if (field === "start_date") {
          updateData.start_date = value;
        } else if (field === "end_date") {
          updateData.end_date = value;
        } else if (field === "billable_expense_percentage") {
          updateData.billable_expense_percentage = value;
        }

        if (Object.keys(updateData).length > 0) {
          await updateLineItem.mutateAsync({
            engagementId,
            lineItemId,
            data: updateData as any,
          });
        }
      } catch (err) {
        console.error(`Failed to update ${field}:`, err);
      } finally {
        setIsSaving(false);
      }
    }, 500);
  }, [lineItemId, engagementId, updateLineItem, isSaving, saveToDatabase]);

  // Auto-save when Role changes (immediate, no debounce)
  // Note: Backend requires role_id to create, so we only create when role_id is set
  useEffect(() => {
    if (isSaving || isCreatingRef.current || isReceivingBackendUpdateRef.current) {
      return;
    }

    if (lineItemId || formData.role_id) {
      saveToDatabase();
    }
  }, [formData.role_id, formData.payable_center_id, formData.employee_id, lineItemId, saveToDatabase]);

  return (
    <tr className={isSaving ? "bg-yellow-50" : "bg-white hover:bg-gray-50"}>
      {/* Payable Center */}
      <td className="border border-gray-300 px-2 py-1 text-xs">
        <Select
          value={formData.payable_center_id || ""}
          onChange={(e) => setFormData({ ...formData, payable_center_id: e.target.value })}
          className="text-xs h-7 w-full"
        >
          <option value="">Select...</option>
          {deliveryCentersData?.items?.map((dc) => (
            <option key={dc.id} value={dc.id}>
              {dc.name}
            </option>
          ))}
        </Select>
      </td>
      {/* Role */}
      <td className="sticky left-0 z-10 bg-white border border-gray-300 px-2 py-1 text-xs" style={{ backgroundColor: 'white' }}>
        <Select
          value={formData.role_id || ""}
          onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
          className="text-xs h-7 w-full"
        >
          <option value="">Select...</option>
          {rolesData?.map((role) => (
            <option key={role.id} value={role.id}>
              {role.role_name}
            </option>
          ))}
        </Select>
      </td>
      {/* Employee */}
      <td className="border border-gray-300 px-2 py-1 text-xs">
        <Select
          value={formData.employee_id || ""}
          onChange={(e) => setFormData({ ...formData, employee_id: e.target.value || "" })}
          className="text-xs h-7 w-full"
        >
          <option value="">-</option>
          {employeesData?.items?.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.first_name} {emp.last_name}
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
            value={formData.cost || ""}
            onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
            onBlur={(e) => {
              if (lineItemId && e.target.value !== formData.cost) {
                handleFieldBlur("cost", e.target.value);
              }
            }}
            placeholder="Auto"
            className="text-xs h-7 flex-1"
            disabled={!lineItemId && !formData.role_id}
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
            value={formData.rate || ""}
            onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
            onBlur={(e) => {
              if (lineItemId && e.target.value !== formData.rate) {
                handleFieldBlur("rate", e.target.value);
              }
            }}
            placeholder="Auto"
            className="text-xs h-7 flex-1"
            disabled={!lineItemId && !formData.role_id}
          />
        </div>
      </td>
      {/* Cost Daily */}
      <td className="border border-gray-300 px-2 py-1 text-xs" style={{ width: '120px', minWidth: '120px' }}>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500">{currency}</span>
          <span className="text-xs flex-1 text-right">
            {(parseFloat(formData.cost || "0") * 8).toFixed(2)}
          </span>
        </div>
      </td>
      {/* Rate Daily */}
      <td className="border border-gray-300 px-2 py-1 text-xs" style={{ width: '120px', minWidth: '120px' }}>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500">{currency}</span>
          <span className="text-xs flex-1 text-right">
            {(parseFloat(formData.rate || "0") * 8).toFixed(2)}
          </span>
        </div>
      </td>
      {/* Start Date */}
      <td className="border border-gray-300 px-2 py-1 text-xs">
        <Input
          type="date"
          value={formData.start_date || ""}
          onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
          onBlur={(e) => {
            if (lineItemId && e.target.value !== formData.start_date) {
              handleFieldBlur("start_date", e.target.value);
            }
          }}
          className="text-xs h-7 w-full"
          disabled={!lineItemId && !formData.role_id && !formData.employee_id}
        />
      </td>
      {/* End Date */}
      <td className="border border-gray-300 px-2 py-1 text-xs">
        <Input
          type="date"
          value={formData.end_date || ""}
          onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
          onBlur={(e) => {
            if (lineItemId && e.target.value !== formData.end_date) {
              handleFieldBlur("end_date", e.target.value);
            }
          }}
          className="text-xs h-7 w-full"
          disabled={!lineItemId && !formData.role_id && !formData.employee_id}
        />
      </td>
      {/* Actions */}
      <td className="border border-gray-300 px-2 py-1 text-xs" style={{ minWidth: '100px' }}>
        {lineItemId ? (
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
                  return;
                }
                if (confirm("Are you sure you want to delete this line item and all its weekly hours?")) {
                  try {
                    await deleteLineItemMutation.mutateAsync({
                      engagementId,
                      lineItemId: lineItemId,
                    });
                  } catch (err) {
                    console.error("Failed to delete line item:", err);
                    alert(`Failed to delete line item: ${err instanceof Error ? err.message : String(err)}`);
                  }
                }
              }}
              disabled={deleteLineItemMutation.isPending}
              className="text-xs text-red-600 hover:underline cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              title="Delete line item and weekly hours"
            >
              {deleteLineItemMutation.isPending ? "Deleting..." : "Delete"}
            </button>
          </div>
        ) : null}
      </td>
      {/* Billable */}
      <td className="border border-gray-300 px-2 py-1 text-xs text-center">
        <input
          type="checkbox"
          checked={formData.billable ?? true}
          onChange={(e) => setFormData({ ...formData, billable: e.target.checked })}
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
            value={formData.billable_expense_percentage || "0"}
            onChange={(e) => {
              if (billableExpenses) {
                setFormData({ ...formData, billable_expense_percentage: e.target.value });
              }
            }}
            onBlur={(e) => {
              if (lineItemId && billableExpenses && e.target.value !== formData.billable_expense_percentage) {
                handleFieldBlur("billable_expense_percentage", e.target.value);
              }
            }}
            placeholder="0"
            disabled={!billableExpenses || (!lineItemId && !formData.role_id && !formData.employee_id)}
            className="text-xs h-7 flex-1"
          />
          <span className="text-[10px] text-gray-500">%</span>
        </div>
      </td>
      {weeks.map((week, weekIndex) => {
        const weekKey = getWeekKey(week);
        const weekDate = week;
        const startDate = formData.start_date ? parseLocalDate(formData.start_date) : null;
        const endDate = formData.end_date ? parseLocalDate(formData.end_date) : null;
        const isInRange = startDate && endDate 
          ? weekDate <= endDate && (new Date(weekDate.getTime() + 6 * 24 * 60 * 60 * 1000)) >= startDate
          : false;
        
        return (
          <td
            key={weekIndex}
            className={`border border-gray-300 px-1 py-1 text-xs text-center ${isInRange ? "bg-blue-50" : "bg-gray-50"}`}
            style={{ width: '120px', minWidth: '120px' }}
          >
            {lineItemId && isInRange ? (
              <Input
                type="number"
                step="0.1"
                value="0"
                placeholder="0"
                disabled={true}
                className="text-xs h-7 w-full text-center"
              />
            ) : (
              "-"
            )}
          </td>
        );
      })}
      <td className="sticky right-0 z-10 bg-white border border-gray-300 px-2 py-1 text-xs">
        -
      </td>
      <td className="border border-gray-300 px-2 py-1 text-xs">
        -
      </td>
      <td className="border border-gray-300 px-2 py-1 text-xs">
        -
      </td>
      <td className="border border-gray-300 px-2 py-1 text-xs">
        -
      </td>
      <td className="border border-gray-300 px-2 py-1 text-xs">
        -
      </td>
      <td className="border border-gray-300 px-2 py-1 text-xs">
        -
      </td>
      <td className="border border-gray-300 px-2 py-1 text-xs">
        -
      </td>
      {isAutoFillOpen && lineItem && (
        <EngagementAutoFillDialog
          lineItem={lineItem}
          onClose={() => setIsAutoFillOpen(false)}
          onSuccess={() => {
            setIsAutoFillOpen(false);
            queryClient.invalidateQueries({
              queryKey: ["engagements", "detail", engagementId],
            });
          }}
        />
      )}
    </tr>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useRoles, useRole } from "@/hooks/useRoles";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useEmployees, useEmployee } from "@/hooks/useEmployees";
import { useCreateLineItem, useUpdateLineItem, useDeleteLineItem, useEstimateDetail } from "@/hooks/useEstimates";
import { estimatesApi } from "@/lib/api/estimates";
import { useQueryClient } from "@tanstack/react-query";
import type { EstimateLineItemCreate, EstimateLineItem, EstimateLineItemUpdate } from "@/types/estimate";
import { convertCurrency } from "@/lib/utils/currency";
import { AutoFillDialog } from "./auto-fill-dialog";

interface EstimateEmptyRowProps {
  estimateId: string;
  weeks: Date[];
  currency: string;
  rowIndex: number;
  stableId: string; // Stable ID to prevent remounting
  engagementDeliveryCenterId?: string; // Engagement Invoice Center (delivery_center_id)
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function EstimateEmptyRow({
  estimateId,
  weeks,
  currency,
  rowIndex: _rowIndex,
  stableId,
  engagementDeliveryCenterId,
  onContextMenu,
}: EstimateEmptyRowProps) {
  const { data: rolesData } = useRoles();
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: employeesData } = useEmployees({ limit: 100 });
  const createLineItem = useCreateLineItem();
  const updateLineItem = useUpdateLineItem();
  const deleteLineItemMutation = useDeleteLineItem();
  const queryClient = useQueryClient();

  // Initialize lineItemId from localStorage or null
  const getInitialLineItemId = (): string | null => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`line-item-id-${stableId}-${estimateId}-${_rowIndex}`);
      return saved || null;
    }
    return null;
  };

  const [lineItemId, setLineItemId] = useState<string | null>(getInitialLineItemId);
  const [isAutoFillOpen, setIsAutoFillOpen] = useState(false);
  const isReceivingBackendUpdateRef = useRef(false);

  // Fetch estimate detail to get the line item when it's created
  const { data: estimateDetail } = useEstimateDetail(estimateId, {
    enabled: true, // Always fetch to check for existing line items
  });

  // Use a ref to persist formData across refetches, initialized from localStorage if available
  const getInitialFormData = (): EstimateLineItemCreate => {
    if (typeof window !== "undefined") {
      // Include rowIndex in key to prevent first row from affecting second row
      const saved = localStorage.getItem(`empty-row-${stableId}-${estimateId}-${_rowIndex}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return {
            ...parsed,
            currency: currency, // Always use current currency
          };
        } catch {
          // Ignore parse errors
        }
      }
    }
    return {
      role_id: "",
      delivery_center_id: engagementDeliveryCenterId || "", // Always use Engagement Invoice Center (required)
      employee_id: "",
      rate: "",
      cost: "",
      currency: currency,
      start_date: new Date().toISOString().split("T")[0],
      end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      billable: true,
      billable_expense_percentage: "0",
    };
  };

  const [formData, setFormData] = useState<EstimateLineItemCreate>(getInitialFormData);

  // SIMPLE: Each row is tied directly to its database record ID
  // If we have a lineItemId (from localStorage or creation), use it directly
  // Once a line item is created, it will be rendered as EstimateLineItemRow after refetch
  const lineItem = lineItemId
    ? estimateDetail?.line_items?.find((item) => item.id === lineItemId)
    : null;

  // Check if this line item is already being rendered as EstimateLineItemRow
  // Only clear if THIS specific row's lineItemId is in the rendered list
  // Don't clear based on matching - that would clear other rows incorrectly
  const isRenderedAsLineItemRow = lineItemId && estimateDetail?.line_items?.some(item => item.id === lineItemId);
  
  // Clear formData and lineItemId ONLY if this specific row's lineItemId is already rendered
  // This prevents the empty row from showing duplicate data when the line item is rendered as EstimateLineItemRow
  useEffect(() => {
    if (isRenderedAsLineItemRow && lineItemId) {
      // This specific line item is now rendered as EstimateLineItemRow, so clear this empty row
      console.log("Clearing empty row because its line item is already rendered as EstimateLineItemRow:", lineItemId);
      setLineItemId(null);
      setFormData(getInitialFormData());
      if (typeof window !== "undefined") {
        localStorage.removeItem(`line-item-id-${stableId}-${estimateId}-${_rowIndex}`);
        localStorage.removeItem(`empty-row-${stableId}-${estimateId}-${_rowIndex}`);
      }
    }
  }, [isRenderedAsLineItemRow, lineItemId, stableId, estimateId, _rowIndex, estimateDetail]);

  // The effective line item ID is simply the lineItemId we have stored
  // This ensures each row only operates on its own database record
  const effectiveLineItemId = lineItemId || null;
  const effectiveLineItem = lineItem || null;
  
  // For Delete button: show if this row has a database record
  // Check both lineItemId and if a matching record exists in estimateDetail
  // Use String() comparison for cost/rate to handle string vs number differences
  const matchingExistingRecord = estimateDetail?.line_items?.find(item => 
    item.role_id === formData.role_id &&
    item.delivery_center_id === engagementDeliveryCenterId &&
    String(item.cost) === String(formData.cost) &&
    String(item.rate) === String(formData.rate)
  );
  
  const hasDatabaseRecord = effectiveLineItemId !== null || matchingExistingRecord !== undefined;
  const recordIdForDelete = effectiveLineItemId || matchingExistingRecord?.id || null;

  // Debug logging
  useEffect(() => {
    if (lineItemId) {
      console.log("Row lineItemId:", {
        lineItemId,
        lineItemExists: !!lineItem,
        formDataRoleId: formData.role_id,
      });
    }
  }, [lineItemId, lineItem, formData.role_id]);

  // Persist lineItemId to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (lineItemId) {
        localStorage.setItem(`line-item-id-${stableId}-${estimateId}-${_rowIndex}`, lineItemId);
      } else {
        localStorage.removeItem(`line-item-id-${stableId}-${estimateId}-${_rowIndex}`);
      }
    }
  }, [lineItemId, stableId, estimateId, _rowIndex]);

  // Fetch role details when role is selected (to get role rates)
  const { data: selectedRoleData } = useRole(formData.role_id || "", true, {
    enabled: !!formData.role_id,
  });

  // Fetch employee details when employee is selected (to get employee rates)
  const { data: selectedEmployeeData } = useEmployee(formData.employee_id || "", false, {
    enabled: !!formData.employee_id,
  });
  
  // Save formData to localStorage whenever it changes (but not on initial mount)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasData = formData.role_id || formData.delivery_center_id || formData.employee_id || formData.rate || formData.cost;
      if (hasData) {
        // Include rowIndex in key to prevent first row from affecting second row
        localStorage.setItem(`empty-row-${stableId}-${estimateId}-${_rowIndex}`, JSON.stringify(formData));
      } else {
        localStorage.removeItem(`empty-row-${stableId}-${estimateId}-${_rowIndex}`);
      }
    }
  }, [formData, stableId, estimateId, _rowIndex]);
  
  // Clear localStorage when line item is created (this row becomes a real line item)
  useEffect(() => {
    if (lineItemId && typeof window !== "undefined") {
      localStorage.removeItem(`empty-row-${stableId}-${estimateId}-${_rowIndex}`);
    }
  }, [lineItemId, stableId, estimateId, _rowIndex]);
  const [isSaving, setIsSaving] = useState(false);
  const [weeklyHoursValues, setWeeklyHoursValues] = useState<Map<string, string>>(
    new Map()
  );

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hoursSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCreatingRef = useRef(false);
  const lastSavedDataRef = useRef<Partial<EstimateLineItemCreate>>({});

  // Auto-save function with debouncing - only saves meaningful changes
  const autoSave = useCallback(async (changedFields?: Set<string>) => {
    // Don't save if we're already saving or creating
    if (isSaving || isCreatingRef.current) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      // If we have a line item ID, update it
      if (lineItemId) {
        if (!formData.role_id || !formData.delivery_center_id) {
          return; // Don't save if required fields are missing
        }

        // Only update if meaningful fields changed (not cost/rate if they're auto-calculated)
        const updateData: Partial<EstimateLineItemUpdate> = {};
        let hasChanges = false;

        // Only include fields that actually changed
        if (changedFields) {
          if (changedFields.has("role_id")) {
            updateData.role_id = formData.role_id;
            hasChanges = true;
          }
          if (changedFields.has("delivery_center_id")) {
            updateData.delivery_center_id = formData.delivery_center_id;
            hasChanges = true;
          }
          if (changedFields.has("employee_id")) {
            // Send null when clearing employee_id to properly remove the association
            updateData.employee_id = formData.employee_id || null;
            hasChanges = true;
          }
          if (changedFields.has("start_date")) {
            updateData.start_date = formData.start_date;
            hasChanges = true;
          }
          if (changedFields.has("end_date")) {
            updateData.end_date = formData.end_date;
            hasChanges = true;
          }
          // Only include cost/rate if they were manually changed (not auto-calculated)
          if (changedFields.has("cost") && formData.cost) {
            updateData.cost = formData.cost;
            hasChanges = true;
          }
          if (changedFields.has("rate") && formData.rate) {
            updateData.rate = formData.rate;
            hasChanges = true;
          }
        } else {
          // Fallback: compare with last saved data
          if (formData.role_id !== lastSavedDataRef.current.role_id) {
            updateData.role_id = formData.role_id;
            hasChanges = true;
          }
          if (formData.delivery_center_id !== lastSavedDataRef.current.delivery_center_id) {
            updateData.delivery_center_id = formData.delivery_center_id;
            hasChanges = true;
          }
          if (formData.employee_id !== lastSavedDataRef.current.employee_id) {
            // Send null when clearing employee_id to properly remove the association
            updateData.employee_id = formData.employee_id || null;
            hasChanges = true;
          }
          if (formData.start_date !== lastSavedDataRef.current.start_date) {
            updateData.start_date = formData.start_date;
            hasChanges = true;
          }
          if (formData.end_date !== lastSavedDataRef.current.end_date) {
            updateData.end_date = formData.end_date;
            hasChanges = true;
          }
        }

        if (!hasChanges) {
          return; // No changes to save
        }

        setIsSaving(true);
        try {
          await updateLineItem.mutateAsync({
            estimateId,
            lineItemId,
            data: updateData as any,
          });
          // Update last saved data
          lastSavedDataRef.current = { ...formData };
        } catch (err) {
          console.error("Failed to auto-save line item:", err);
        } finally {
          setIsSaving(false);
        }
      } else if (formData.role_id && !isCreatingRef.current && !lineItemId) {
        // Before creating, check if a matching line item already exists
        // This prevents duplicates when Role is selected and Cost/Rate are auto-populated
        if (estimateDetail?.line_items) {
          const matchingItem = estimateDetail.line_items.find(item => 
            item.role_id === formData.role_id &&
            item.delivery_center_id === engagementDeliveryCenterId &&
            item.cost === formData.cost &&
            item.rate === formData.rate
          );
          
          if (matchingItem) {
            // Found existing line item - use it instead of creating duplicate
            console.log("Found existing line item, using it instead of creating:", matchingItem.id);
            setLineItemId(matchingItem.id);
            lastSavedDataRef.current = { ...formData };
            return; // Don't create a new one
          }
        }
        
        // Create line item when Role is selected and we have meaningful data (hours or cost/rate)
        // Cost/Rate are auto-populated when Role is selected, so they should trigger creation
        const hasHours = weeklyHoursValues.size > 0 && Array.from(weeklyHoursValues.values()).some(h => h && parseFloat(h) > 0);
        const hasRates = (formData.rate && formData.rate !== "0" && formData.rate !== "") || 
                         (formData.cost && formData.cost !== "0" && formData.cost !== "");
        
        console.log("Checking if line item should be created:", {
          role_id: formData.role_id,
          delivery_center_id: engagementDeliveryCenterId,
          hasHours,
          hasRates,
          rate: formData.rate,
          cost: formData.cost,
          willCreate: hasHours || hasRates,
        });
        
        if (!hasHours && !hasRates) {
          // Don't create line item yet - wait for user to enter hours or rates
          return;
        }
        
        // Create new line item if we have required fields and meaningful data
        // Double-check we're not already creating and don't have a line item ID
        if (isCreatingRef.current || lineItemId) {
          return;
        }
        isCreatingRef.current = true;
        setIsSaving(true);
        try {
          // Ensure rate and cost are always provided (backend requires them)
          // delivery_center_id always comes from engagementDeliveryCenterId (required)
          const createData: any = {
            role_id: formData.role_id,
            delivery_center_id: engagementDeliveryCenterId, // Always use Engagement Invoice Center (required)
            employee_id: formData.employee_id || undefined,
            rate: formData.rate || "0",
            cost: formData.cost || "0",
            currency: formData.currency || currency,
            start_date: formData.start_date,
            end_date: formData.end_date,
            billable: formData.billable ?? true,
          };
          // Remove undefined/empty employee_id - backend expects valid UUID or omitted
          if (!createData.employee_id) {
            delete createData.employee_id;
          }
          const newLineItem = await createLineItem.mutateAsync({
            estimateId,
            data: createData,
          });
          setLineItemId(newLineItem.id);
          // Update last saved data
          lastSavedDataRef.current = { ...formData };
          // Invalidate to refresh the list - this will cause the component to re-render
          // and this empty row will be replaced by the actual line item row
          queryClient.invalidateQueries({
            queryKey: ["estimates", "detail", estimateId, true],
          });
        } catch (err) {
          console.error("Failed to create line item:", err);
          isCreatingRef.current = false;
        } finally {
          setIsSaving(false);
        }
      }
    }, 500); // 500ms debounce
  }, [lineItemId, formData, estimateId, createLineItem, updateLineItem, queryClient, isSaving, estimateDetail, engagementDeliveryCenterId, currency, weeklyHoursValues]);

  // Track previous formData to detect what changed
  const prevFormDataRef = useRef<EstimateLineItemCreate>(formData);

  // Auto-save when meaningful form data changes (not cost/rate unless manually changed)
  useEffect(() => {
    // Skip if we're currently saving, creating, or receiving backend updates
    if (isSaving || isCreatingRef.current || isReceivingBackendUpdateRef.current) {
      prevFormDataRef.current = { ...formData };
      return;
    }

    // Only trigger autoSave if we have role_id (delivery_center_id is optional)
    if (!formData.role_id) {
      prevFormDataRef.current = { ...formData };
      return;
    }

    // Detect which fields changed
    const changedFields = new Set<string>();
    if (prevFormDataRef.current.role_id !== formData.role_id) {
      changedFields.add("role_id");
    }
    if (prevFormDataRef.current.delivery_center_id !== formData.delivery_center_id) {
      changedFields.add("delivery_center_id");
    }
    if (prevFormDataRef.current.employee_id !== formData.employee_id) {
      changedFields.add("employee_id");
    }
    if (prevFormDataRef.current.start_date !== formData.start_date) {
      changedFields.add("start_date");
    }
    if (prevFormDataRef.current.end_date !== formData.end_date) {
      changedFields.add("end_date");
    }
    // Track cost/rate changes - always track if they changed (for creation, we need to know)
    // If we don't have a line item yet, cost/rate changes should trigger creation
    if (prevFormDataRef.current.cost !== formData.cost && formData.cost) {
      changedFields.add("cost");
    }
    if (prevFormDataRef.current.rate !== formData.rate && formData.rate) {
      changedFields.add("rate");
    }

    // Auto-save if meaningful fields changed
    // Include cost/rate changes if:
    // 1. We don't have a line item yet (need to create) OR
    // 2. We have a line item and cost/rate were manually changed
    const hasMeaningfulChanges = changedFields.has("role_id") ||
      changedFields.has("delivery_center_id") ||
      changedFields.has("employee_id") ||
      changedFields.has("start_date") ||
      changedFields.has("end_date");

    // Cost/rate changes trigger creation if no line item exists, or update if line item exists
    const hasCostRateChange = (changedFields.has("cost") && formData.cost) ||
      (changedFields.has("rate") && formData.rate);
    
    const shouldTriggerAutoSave = hasMeaningfulChanges || 
      (hasCostRateChange && !lineItemId) || // Cost/rate changes trigger creation
      (hasCostRateChange && lineItemId);    // Cost/rate changes trigger update

    if (shouldTriggerAutoSave) {
      console.log("Auto-save triggered with changes:", Array.from(changedFields), { hasLineItem: !!lineItemId });
      autoSave(changedFields);
    }

    // Update previous formData
    prevFormDataRef.current = { ...formData };

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (hoursSaveTimeoutRef.current) {
        clearTimeout(hoursSaveTimeoutRef.current);
      }
    };
  }, [formData.role_id, formData.delivery_center_id, formData.employee_id, formData.start_date, formData.end_date, autoSave, isSaving, lineItemId]);

  // Handle manual cost/rate changes separately (only for updates, not creates)
  useEffect(() => {
    // Only handle cost/rate changes if we have a line item ID (update, not create)
    if (!lineItemId || isSaving || isCreatingRef.current) {
      return;
    }

    const costChanged = prevFormDataRef.current.cost !== formData.cost && formData.cost;
    const rateChanged = prevFormDataRef.current.rate !== formData.rate && formData.rate;

    if (costChanged || rateChanged) {
      const changedFields = new Set<string>();
      if (costChanged) changedFields.add("cost");
      if (rateChanged) changedFields.add("rate");
      autoSave(changedFields);
    }
  }, [formData.cost, formData.rate, lineItemId, autoSave, isSaving]);

  // Track previous role and employee to detect changes
  const prevRoleIdRef = useRef<string>(formData.role_id || "");
  const prevEmployeeIdRef = useRef<string>(formData.employee_id || "");
  const lastPopulatedRoleDataRef = useRef<string>("");

  // When Role is selected, update Cost and Rate based on Engagement Invoice Center & Role
  useEffect(() => {
    // Skip if we're currently saving, creating, or receiving backend updates
    if (isSaving || isCreatingRef.current || isReceivingBackendUpdateRef.current) {
      if (formData.role_id !== prevRoleIdRef.current) {
        prevRoleIdRef.current = formData.role_id || "";
        lastPopulatedRoleDataRef.current = ""; // Reset when role changes
      }
      return;
    }

    // Need role_id, engagement delivery center, and selectedRoleData to proceed
    if (!formData.role_id || !engagementDeliveryCenterId || !selectedRoleData) {
      // If role changed but data not loaded yet, update ref
      if (formData.role_id !== prevRoleIdRef.current) {
        prevRoleIdRef.current = formData.role_id || "";
        lastPopulatedRoleDataRef.current = ""; // Reset when role changes
      }
      return;
    }

    // Check if we've already populated for this role+engagement+currency combination
    const currentKey = `${formData.role_id}-${engagementDeliveryCenterId}-${currency}`;
    const roleChanged = formData.role_id !== prevRoleIdRef.current;
    
    // If role changed, reset the populated flag
    if (roleChanged) {
      lastPopulatedRoleDataRef.current = "";
    }
    
    // Skip if we've already populated for this exact combination (and role hasn't changed)
    if (!roleChanged && lastPopulatedRoleDataRef.current === currentKey) {
      return;
    }

    console.log("Role effect running - populating Cost & Rate", {
      role_id: formData.role_id,
      engagementDeliveryCenterId,
      currency,
      roleChanged,
      currentKey,
      lastPopulated: lastPopulatedRoleDataRef.current,
      role_rates_count: selectedRoleData?.role_rates?.length || 0,
    });

    // Find the role rate that matches engagement delivery center and currency
    // Compare as strings to handle UUID string comparison
    const matchingRate = selectedRoleData.role_rates?.find(
      (rate) =>
        String(rate.delivery_center_id) === String(engagementDeliveryCenterId) &&
        rate.default_currency === currency
    );

    let newCost: string;
    let newRate: string;

    if (matchingRate) {
      newCost = String(matchingRate.internal_cost_rate || "0");
      newRate = String(matchingRate.external_rate || "0");
    } else {
      // Fallback to role default rates if no matching rate found
      const role = rolesData?.items?.find((r) => r.id === formData.role_id);
      if (role) {
        newCost = String(role.role_internal_cost_rate || "0");
        newRate = String(role.role_external_rate || "0");
      } else {
        prevRoleIdRef.current = formData.role_id || "";
        return;
      }
    }

    // Update Rate always (Rate always comes from Role)
    // Update Cost only if NO employee is selected (if employee selected, Cost comes from employee)
    const hasEmployee = !!formData.employee_id;
    
    console.log("Updating Cost & Rate:", {
      newCost,
      newRate,
      hasEmployee,
      willUpdateCost: !hasEmployee,
      currentCost: formData.cost,
      currentRate: formData.rate,
    });
    
    setFormData((prev) => {
      const updates: Partial<EstimateLineItemCreate> = {
        rate: newRate,
      };
      
      // Only update cost if no employee is selected
      if (!hasEmployee) {
        updates.cost = newCost;
      }
      
      return { ...prev, ...updates };
    });
    
    prevRoleIdRef.current = formData.role_id || "";
    lastPopulatedRoleDataRef.current = currentKey; // Mark as populated
  }, [formData.role_id, formData.employee_id, engagementDeliveryCenterId, currency, selectedRoleData, rolesData, isSaving, isCreatingRef]);

  // Track if we've already populated cost for this employee
  const lastPopulatedEmployeeRef = useRef<string>("");

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

    // If employee was cleared (set to empty), revert Cost to Role-based cost
    if (!currentEmployeeId) {
      // Need role and engagement delivery center to get role-based cost
      if (formData.role_id && engagementDeliveryCenterId && selectedRoleData) {
        // Find the role rate that matches engagement delivery center and currency
        const matchingRate = selectedRoleData.role_rates?.find(
          (rate) =>
            String(rate.delivery_center_id) === String(engagementDeliveryCenterId) &&
            rate.default_currency === currency
        );

        let newCost: string;
        if (matchingRate) {
          newCost = String(matchingRate.internal_cost_rate || "0");
        } else {
          // Fallback to role default rates if no matching rate found
          const role = rolesData?.items?.find((r) => r.id === formData.role_id);
          if (role) {
            newCost = String(role.role_internal_cost_rate || "0");
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

    // Employee was selected - update cost from employee's internal_cost_rate
    if (!selectedEmployeeData) {
      // Employee data not loaded yet, wait for it
      prevEmployeeIdRef.current = currentEmployeeId;
      return;
    }

    console.log("Employee effect running - updating Cost", {
      employee_id: currentEmployeeId,
      selectedEmployeeData: !!selectedEmployeeData,
      internal_cost_rate: selectedEmployeeData?.internal_cost_rate,
      default_currency: selectedEmployeeData?.default_currency,
      target_currency: currency,
    });

    // Update only cost from employee's internal_cost_rate
    // Convert currency if Employee Cost Default Currency differs from Engagement Invoice Center Currency
    if (selectedEmployeeData.internal_cost_rate !== undefined) {
      let employeeCost = selectedEmployeeData.internal_cost_rate || 0;
      const employeeCurrency = selectedEmployeeData.default_currency || "USD";
      
      // Convert to Engagement Invoice Center Currency if different
      if (employeeCurrency.toUpperCase() !== currency.toUpperCase()) {
        console.log("Converting currency:", {
          from: employeeCurrency,
          to: currency,
          originalAmount: employeeCost,
        });
        const convertedCost = convertCurrency(employeeCost, employeeCurrency, currency);
        console.log("Conversion result:", {
          convertedAmount: convertedCost,
        });
        employeeCost = convertedCost;
      }
      
      const newCost = String(employeeCost);
      console.log("Updating Cost from Employee:", {
        originalCost: selectedEmployeeData.internal_cost_rate,
        employeeCurrency,
        convertedCost: employeeCost,
        newCost,
        currentCost: formData.cost,
      });
      
      // Always update cost from employee (don't check if changed, as it should update when employee changes)
      setFormData((prev) => ({
        ...prev,
        cost: newCost,
        // Rate is NOT updated - it stays based on Role
      }));
      
      // Mark as populated
      lastPopulatedEmployeeRef.current = currentEmployeeId;
    }

    prevEmployeeIdRef.current = currentEmployeeId;
  }, [formData.employee_id, formData.role_id, engagementDeliveryCenterId, currency, selectedEmployeeData, selectedRoleData, rolesData, isSaving, isCreatingRef]);

  const handleWeeklyHoursUpdate = async (weekKey: string, hours: string) => {
    // Ensure we have required fields and create line item if needed
    if (!formData.role_id || !formData.delivery_center_id) {
      return; // Can't save hours without required fields
    }

    const weekDate = new Date(weekKey);
    const startDate = new Date(formData.start_date);
    const endDate = new Date(formData.end_date);

    // Only update if within date range
    if (weekDate < startDate || weekDate > endDate) {
      return;
    }

    // Update local state immediately
    setWeeklyHoursValues((prev) => {
      const next = new Map(prev);
      next.set(weekKey, hours);
      return next;
    });

    // Create line item first if it doesn't exist
    let currentLineItemId = lineItemId;
    if (!currentLineItemId && !isCreatingRef.current) {
      isCreatingRef.current = true;
      setIsSaving(true);
      try {
        // Ensure rate and cost are always provided (backend requires them)
        const createData = {
          ...formData,
          rate: formData.rate || "0",
          cost: formData.cost || "0",
        };
        const newLineItem = await createLineItem.mutateAsync({
          estimateId,
          data: createData,
        });
        currentLineItemId = newLineItem.id;
        setLineItemId(newLineItem.id);
        queryClient.invalidateQueries({
          queryKey: ["estimates", "detail", estimateId, true],
        });
      } catch (err) {
        console.error("Failed to create line item for hours:", err);
        isCreatingRef.current = false;
        setIsSaving(false);
        // Revert hours
        setWeeklyHoursValues((prev) => {
          const next = new Map(prev);
          next.delete(weekKey);
          return next;
        });
        return;
      } finally {
        setIsSaving(false);
        isCreatingRef.current = false;
      }
    }

    if (!currentLineItemId) {
      return; // Still creating, will retry after creation
    }

    // Debounce the API call
    if (hoursSaveTimeoutRef.current) {
      clearTimeout(hoursSaveTimeoutRef.current);
    }

    hoursSaveTimeoutRef.current = setTimeout(async () => {
      try {
        await estimatesApi.autoFillHours(estimateId, currentLineItemId!, {
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
        setWeeklyHoursValues((prev) => {
          const next = new Map(prev);
          next.delete(weekKey);
          return next;
        });
      }
    }, 500);
  };

  const getWeekKey = (week: Date) => {
    return week.toISOString().split("T")[0];
  };

  // Helper function to parse date string as local date (avoid timezone conversion)
  const parseLocalDate = (dateStr: string): Date => {
    const datePart = dateStr.split("T")[0];
    const [year, month, day] = datePart.split("-").map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed in JS
  };

  // Calculate totals
  const totalHours: number = Array.from(weeklyHoursValues.values()).reduce(
    (sum, hours) => sum + parseFloat(hours || "0"),
    0
  );
  const totalCost: number = totalHours * parseFloat(formData.cost || "0");
  const totalRevenue: number = totalHours * parseFloat(formData.rate || "0");
  const billableExpensePercentage: number = parseFloat(formData.billable_expense_percentage || "0");
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

  return (
    <tr
      className={isSaving ? "bg-yellow-50" : "bg-white hover:bg-gray-50"}
      onContextMenu={onContextMenu}
    >
      {/* Delivery Center */}
      <td className="border border-gray-300 px-2 py-1">
        <Select
          value={formData.delivery_center_id}
          onChange={(e) =>
            setFormData({ ...formData, delivery_center_id: e.target.value })
          }
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
      <td className="sticky left-0 z-10 bg-white border border-gray-300 px-2 py-1">
        <Select
          value={formData.role_id}
          onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
          className="text-xs h-7 w-full"
        >
          <option value="">Select...</option>
          {rolesData?.items?.map((role) => (
            <option key={role.id} value={role.id}>
              {role.role_name}
            </option>
          ))}
        </Select>
      </td>

      {/* Employee */}
      <td className="border border-gray-300 px-2 py-1">
        <Select
          value={formData.employee_id || ""}
          onChange={(e) =>
            setFormData({ ...formData, employee_id: e.target.value || "" })
          }
          className="text-xs h-7 w-full"
        >
          <option value="">-</option>
          {employeesData?.items?.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.first_name} {employee.last_name}
            </option>
          ))}
        </Select>
      </td>

      {/* Cost */}
      <td className="border border-gray-300 px-2 py-1" style={{ width: '120px', minWidth: '120px' }}>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500">{currency}</span>
          <Input
            type="number"
            step="0.01"
            value={formData.cost || ""}
            onChange={(e) => {
              setFormData({ ...formData, cost: e.target.value });
            }}
            placeholder="Auto"
            className="text-xs h-7 flex-1"
          />
        </div>
      </td>

      {/* Rate */}
      <td className="border border-gray-300 px-2 py-1" style={{ width: '120px', minWidth: '120px' }}>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500">{currency}</span>
          <Input
            type="number"
            step="0.01"
            value={formData.rate || ""}
            onChange={(e) => {
              setFormData({ ...formData, rate: e.target.value });
            }}
            placeholder="Auto"
            className="text-xs h-7 flex-1"
          />
        </div>
      </td>

      {/* Start Date */}
      <td className="border border-gray-300 px-2 py-1">
        <Input
          type="date"
          value={formData.start_date}
          onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
          className="text-xs h-7 w-full"
        />
      </td>

      {/* End Date */}
      <td className="border border-gray-300 px-2 py-1">
        <Input
          type="date"
          value={formData.end_date}
          onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
          className="text-xs h-7 w-full"
        />
      </td>

      {/* Billable */}
      <td className="border border-gray-300 px-2 py-1 text-center">
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
            onChange={(e) => setFormData({ ...formData, billable_expense_percentage: e.target.value })}
            placeholder="0"
            className="text-xs h-7 flex-1"
          />
          <span className="text-[10px] text-gray-500">%</span>
        </div>
      </td>

      {/* Actions */}
      <td className="border border-gray-300 px-2 py-1">
        <div className="flex gap-2 items-center">
          {isSaving && (
            <span className="text-xs text-gray-400" title="Saving...">
              ...
            </span>
          )}
          {/* Show Fill button when ROLE, COST, RATE, START DATE, and END DATE are present */}
          {formData.role_id &&
            formData.cost &&
            formData.rate &&
            formData.start_date &&
            formData.end_date && (
              <button
                onClick={async () => {
                  // Ensure we have a line item before opening Fill dialog
                  // First, check if a matching line item already exists in the database
                  let lineItemToUse = effectiveLineItem;
                  
                  if (!lineItemToUse && estimateDetail?.line_items) {
                    // Try to find existing line item by matching role_id, delivery_center_id, cost, and rate
                    // Use String() comparison for cost/rate to handle string vs number differences
                    const matchingItem = estimateDetail.line_items.find(item => 
                      item.role_id === formData.role_id &&
                      item.delivery_center_id === engagementDeliveryCenterId &&
                      String(item.cost) === String(formData.cost) &&
                      String(item.rate) === String(formData.rate)
                    );
                    
                    if (matchingItem) {
                      // Found existing line item - use it instead of creating duplicate
                      lineItemToUse = matchingItem;
                      setLineItemId(matchingItem.id);
                      setIsAutoFillOpen(true);
                      return; // Don't create a new one
                    }
                  }
                  
                  // If we still don't have a line item, create one
                  if (!lineItemToUse && !effectiveLineItemId) {
                    try {
                      // delivery_center_id always comes from engagementDeliveryCenterId (required)
                      const createData: any = {
                        role_id: formData.role_id,
                        delivery_center_id: engagementDeliveryCenterId, // Always use Engagement Invoice Center (required)
                        employee_id: formData.employee_id || undefined,
                        rate: formData.rate || "0",
                        cost: formData.cost || "0",
                        currency: formData.currency || currency,
                        start_date: formData.start_date,
                        end_date: formData.end_date,
                        billable: formData.billable ?? true,
                        billable_expense_percentage: formData.billable_expense_percentage || "0",
                      };
                      // Remove undefined/empty employee_id - backend expects valid UUID or omitted
                      if (!createData.employee_id) {
                        delete createData.employee_id;
                      }
                      const newLineItem = await createLineItem.mutateAsync({
                        estimateId,
                        data: createData,
                      });
                      setLineItemId(newLineItem.id);
                      lineItemToUse = newLineItem;
                      // Wait for the query to update, then open dialog
                      await queryClient.invalidateQueries({
                        queryKey: ["estimates", "detail", estimateId, true],
                      });
                      // Open dialog with the newly created line item
                      setIsAutoFillOpen(true);
                    } catch (err) {
                      console.error("Failed to create line item for Fill:", err);
                      alert(`Failed to create line item: ${err instanceof Error ? err.message : String(err)}`);
                    }
                  } else if (lineItemToUse || effectiveLineItemId) {
                    // We have a line item (either found or already had one) - just open dialog
                    setIsAutoFillOpen(true);
                  }
                }}
                className="text-xs text-blue-600 hover:underline"
                title="Auto-fill hours"
              >
                Fill
              </button>
            )}
          {/* Show Delete button if this row has a database record */}
          {hasDatabaseRecord && recordIdForDelete ? (
            <button
              onClick={async () => {
                if (deleteLineItemMutation.isPending) {
                  return;
                }
                if (confirm("Are you sure you want to delete this line item and all its weekly hours?")) {
                  try {
                    await deleteLineItemMutation.mutateAsync({
                      estimateId,
                      lineItemId: recordIdForDelete,
                    });
                    // Reset the row state after successful deletion
                    setLineItemId(null);
                    setFormData(getInitialFormData());
                    // Clear localStorage
                    if (typeof window !== "undefined") {
                      localStorage.removeItem(`line-item-id-${stableId}-${estimateId}-${_rowIndex}`);
                      localStorage.removeItem(`empty-row-${stableId}-${estimateId}-${_rowIndex}`);
                    }
                  } catch (err: any) {
                    console.error("Failed to delete line item:", err);
                    // If the line item doesn't exist (404), clear the stale lineItemId
                    if (err?.response?.status === 404 || err?.message?.includes("not found")) {
                      console.log("Line item not found, clearing stale lineItemId");
                      setLineItemId(null);
                      if (typeof window !== "undefined") {
                        localStorage.removeItem(`line-item-id-${stableId}-${estimateId}-${_rowIndex}`);
                      }
                    } else {
                      alert(`Failed to delete line item: ${err instanceof Error ? err.message : String(err)}`);
                    }
                  }
                }
              }}
              disabled={deleteLineItemMutation.isPending}
              className="text-xs text-red-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              title="Delete line item and weekly hours"
            >
              {deleteLineItemMutation.isPending ? "Deleting..." : "Delete"}
            </button>
          ) : null}
        </div>
        {/* AutoFill Dialog */}
        {isAutoFillOpen && (effectiveLineItem || (estimateDetail?.line_items?.find(item => 
          item.role_id === formData.role_id &&
          item.delivery_center_id === engagementDeliveryCenterId &&
          String(item.cost) === String(formData.cost) &&
          String(item.rate) === String(formData.rate)
        ))) && (
          <AutoFillDialog
            lineItem={effectiveLineItem || estimateDetail!.line_items!.find(item => 
              item.role_id === formData.role_id &&
              item.delivery_center_id === engagementDeliveryCenterId &&
              String(item.cost) === String(formData.cost) &&
              String(item.rate) === String(formData.rate)
            )!}
            onClose={() => setIsAutoFillOpen(false)}
            onSuccess={() => {
              setIsAutoFillOpen(false);
              // The mutation already handles cache invalidation, no need to do it here
            }}
          />
        )}
      </td>

      {/* Weekly Hours */}
      {weeks.map((week) => {
        const weekKey = getWeekKey(week);
        const hours = weeklyHoursValues.get(weekKey) || "";
        
        const weekDate = parseLocalDate(weekKey);
        const startDate = parseLocalDate(formData.start_date);
        const endDate = parseLocalDate(formData.end_date);
        // Check if week overlaps with date range (week starts Sunday, ends Saturday)
        // A week overlaps if the Start or End Date is ON or BETWEEN Sunday through Saturday
        const weekEnd = new Date(weekDate);
        weekEnd.setDate(weekEnd.getDate() + 6); // End of week (Saturday)
        // Normalize dates to midnight for accurate comparison
        const weekStartNormalized = new Date(weekDate.getFullYear(), weekDate.getMonth(), weekDate.getDate());
        const weekEndNormalized = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate());
        const startDateNormalized = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        const endDateNormalized = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        const isWithinRange = weekStartNormalized <= endDateNormalized && weekEndNormalized >= startDateNormalized;
        // delivery_center_id always comes from engagementDeliveryCenterId (required), so check that instead
        const canEdit = formData.role_id && engagementDeliveryCenterId && isWithinRange;
        
        return (
          <td
            key={week.toISOString()}
            className="border border-gray-300 px-1 py-1"
            style={{ width: '120px', minWidth: '120px' }}
          >
            <Input
              type="number"
              step="0.1"
              value={hours}
              onChange={(e) => {
                if (canEdit) {
                  handleWeeklyHoursUpdate(weekKey, e.target.value);
                }
              }}
              placeholder="0"
              className="text-xs h-7 w-full text-center"
              disabled={!canEdit}
            />
          </td>
        );
      })}

      {/* Total Hours */}
      <td className="sticky right-0 z-10 bg-white border border-gray-300 px-2 py-1 text-xs font-semibold text-right">
        {totalHours > 0 ? totalHours.toFixed(1) : "-"}
      </td>

      {/* Total Cost */}
      <td className="border border-gray-300 px-2 py-1 text-xs font-semibold text-right">
        {totalCost > 0 ? totalCost.toFixed(2) : "-"}
      </td>

      {/* Total Revenue */}
      <td className="border border-gray-300 px-2 py-1 text-xs font-semibold text-right">
        {totalRevenue > 0 ? totalRevenue.toFixed(2) : "-"}
      </td>

      {/* Billable Expense Amount */}
      <td className="border border-gray-300 px-2 py-1 text-xs font-semibold text-right bg-gray-50">
        {billableExpenseAmount > 0 ? billableExpenseAmount.toFixed(2) : "-"}
      </td>

      {/* Margin Amount */}
      <td className="border border-gray-300 px-2 py-1 text-xs font-semibold text-right">
        {marginAmount > 0 ? marginAmount.toFixed(2) : "-"}
      </td>

      {/* Margin % (Without Expenses) */}
      <td className="border border-gray-300 px-2 py-1 text-xs font-semibold text-right">
        {totalRevenue > 0 ? marginPercentageWithoutExpenses.toFixed(1) : "-"}%
      </td>

      {/* Margin % (With Expenses) */}
      <td className="border border-gray-300 px-2 py-1 text-xs font-semibold text-right">
        {(totalRevenue + billableExpenseAmount) > 0 ? marginPercentageWithExpenses.toFixed(1) : "-"}%
      </td>
    </tr>
  );
}


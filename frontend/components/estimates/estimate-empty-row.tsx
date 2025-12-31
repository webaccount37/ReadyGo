"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useRoles } from "@/hooks/useRoles";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useEmployees } from "@/hooks/useEmployees";
import { useCreateLineItem, useUpdateLineItem } from "@/hooks/useEstimates";
import { estimatesApi } from "@/lib/api/estimates";
import { useQueryClient } from "@tanstack/react-query";
import type { EstimateLineItemCreate } from "@/types/estimate";

interface EstimateEmptyRowProps {
  estimateId: string;
  weeks: Date[];
  currency: string;
  rowIndex: number;
  stableId: string; // Stable ID to prevent remounting
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function EstimateEmptyRow({
  estimateId,
  weeks,
  currency,
  rowIndex: _rowIndex,
  stableId,
  onContextMenu,
}: EstimateEmptyRowProps) {
  const { data: rolesData } = useRoles();
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: employeesData } = useEmployees({ limit: 100 });
  const createLineItem = useCreateLineItem();
  const updateLineItem = useUpdateLineItem();
  const queryClient = useQueryClient();

  const [lineItemId, setLineItemId] = useState<string | null>(null);
  const isReceivingBackendUpdateRef = useRef(false);

  // Use a ref to persist formData across refetches, initialized from localStorage if available
  const getInitialFormData = (): EstimateLineItemCreate => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`empty-row-${stableId}-${estimateId}`);
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
      delivery_center_id: "",
      employee_id: "",
      rate: "",
      cost: "",
      currency: currency,
      start_date: new Date().toISOString().split("T")[0],
      end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      billable: true,
    };
  };

  const [formData, setFormData] = useState<EstimateLineItemCreate>(getInitialFormData);
  
  // Save formData to localStorage whenever it changes (but not on initial mount)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasData = formData.role_id || formData.delivery_center_id || formData.employee_id || formData.rate || formData.cost;
      if (hasData) {
        localStorage.setItem(`empty-row-${stableId}-${estimateId}`, JSON.stringify(formData));
      } else {
        localStorage.removeItem(`empty-row-${stableId}-${estimateId}`);
      }
    }
  }, [formData, stableId, estimateId]);
  
  // Clear localStorage when line item is created (this row becomes a real line item)
  useEffect(() => {
    if (lineItemId && typeof window !== "undefined") {
      localStorage.removeItem(`empty-row-${stableId}-${estimateId}`);
    }
  }, [lineItemId, stableId, estimateId]);
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
        const updateData: Partial<EstimateLineItemCreate> = {};
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
            updateData.employee_id = formData.employee_id || undefined;
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
            updateData.employee_id = formData.employee_id || undefined;
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
      } else if (formData.role_id && formData.delivery_center_id && !isCreatingRef.current && !lineItemId) {
        // Create new line item if we have required fields
        // Double-check we're not already creating and don't have a line item ID
        if (isCreatingRef.current || lineItemId) {
          return;
        }
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
  }, [lineItemId, formData, estimateId, createLineItem, updateLineItem, queryClient, isSaving]);

  // Track previous formData to detect what changed
  const prevFormDataRef = useRef<EstimateLineItemCreate>(formData);

  // Auto-save when meaningful form data changes (not cost/rate unless manually changed)
  useEffect(() => {
    // Skip if we're currently saving, creating, or receiving backend updates
    if (isSaving || isCreatingRef.current || isReceivingBackendUpdateRef.current) {
      prevFormDataRef.current = { ...formData };
      return;
    }

    // Only trigger autoSave if we have required fields
    if (!formData.role_id || !formData.delivery_center_id) {
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
    // Only track cost/rate if they were manually changed (not empty and different from previous)
    if (prevFormDataRef.current.cost !== formData.cost && formData.cost) {
      changedFields.add("cost");
    }
    if (prevFormDataRef.current.rate !== formData.rate && formData.rate) {
      changedFields.add("rate");
    }

    // Only auto-save if meaningful fields changed (exclude cost/rate if they're just auto-calculated)
    // Cost/rate changes alone shouldn't trigger a save unless they were manually edited
    const hasMeaningfulChanges = changedFields.has("role_id") ||
      changedFields.has("delivery_center_id") ||
      changedFields.has("employee_id") ||
      changedFields.has("start_date") ||
      changedFields.has("end_date");

    // Only include cost/rate if they were manually changed AND we have a line item ID (update, not create)
    const hasManualCostRateChange = lineItemId && (
      (changedFields.has("cost") && formData.cost) ||
      (changedFields.has("rate") && formData.rate)
    );

    if (hasMeaningfulChanges || hasManualCostRateChange) {
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
            setFormData({ ...formData, employee_id: e.target.value || undefined })
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
        <Input
          type="number"
          step="0.01"
          value={formData.cost || ""}
          onChange={(e) => {
            setFormData({ ...formData, cost: e.target.value });
          }}
          placeholder="Auto"
          className="text-xs h-7 w-full"
        />
      </td>

      {/* Rate */}
      <td className="border border-gray-300 px-2 py-1" style={{ width: '120px', minWidth: '120px' }}>
        <Input
          type="number"
          step="0.01"
          value={formData.rate || ""}
          onChange={(e) => {
            setFormData({ ...formData, rate: e.target.value });
          }}
          placeholder="Auto"
          className="text-xs h-7 w-full"
        />
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

      {/* Actions - Empty for empty rows */}
      <td className="border border-gray-300 px-2 py-1">
        {isSaving && (
          <span className="text-xs text-gray-400" title="Saving...">
            ...
          </span>
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
        const canEdit = formData.role_id && formData.delivery_center_id && isWithinRange;
        
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

      {/* Margin Amount */}
      <td className="border border-gray-300 px-2 py-1 text-xs font-semibold text-right">
        {(totalRevenue - totalCost) > 0 ? (totalRevenue - totalCost).toFixed(2) : "-"}
      </td>

      {/* Margin Percentage */}
      <td className="border border-gray-300 px-2 py-1 text-xs font-semibold text-right">
        {totalRevenue > 0 ? (((totalRevenue - totalCost) / totalRevenue) * 100).toFixed(1) : "-"}%
      </td>
    </tr>
  );
}


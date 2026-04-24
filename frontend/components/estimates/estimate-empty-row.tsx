"use client";

import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from "react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useRole } from "@/hooks/useRoles";
import { useRolesForDeliveryCenter } from "@/hooks/useEstimates";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useEmployees, useEmployee } from "@/hooks/useEmployees";
import { useCreateLineItem, useUpdateLineItem, useDeleteLineItem, useEstimateDetail } from "@/hooks/useEstimates";
import { estimatesApi } from "@/lib/api/estimates";
import { rolesApi } from "@/lib/api/roles";
import { useQueryClient } from "@tanstack/react-query";
import type { EstimateLineItemCreate, EstimateLineItem, EstimateLineItemUpdate } from "@/types/estimate";
import type { RoleResponse } from "@/types/role";
import { convertCurrency } from "@/lib/utils/currency";
import { fingerprintRoleRates } from "@/lib/utils/role-rate-fingerprint";
import { pickRoleRateForOpportunityInvoiceCenter } from "@/lib/utils/role-rate-picker";
import { weekColumnOverlapsLineRange } from "@/lib/utils/week-column-line-range";
import { AutoFillDialog } from "./auto-fill-dialog";

/** Same shape as `useRole` in `@/hooks/useRoles` so `fetchQuery` populates that cache. */
const rolesDetailQueryKey = (id: string) => ["roles", "detail", id] as const;

function computeRateCostFromRoleDetail(
  roleDetail: RoleResponse,
  opportunityDeliveryCenterId: string | undefined,
  invoiceCenterDefaultCurrency: string | undefined,
  currency: string
): { newRate: string; newCost: string } | null {
  if (!opportunityDeliveryCenterId) {
    return null;
  }

  const matchingRate = pickRoleRateForOpportunityInvoiceCenter(
    roleDetail.role_rates,
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
      baseCost = convertCurrency(baseCost, roleRateCurrency, currency);
      baseRate = convertCurrency(baseRate, roleRateCurrency, currency);
      if (!Number.isFinite(baseCost) || !Number.isFinite(baseRate)) {
        return null;
      }
    }

    newCost = parseFloat(baseCost.toFixed(2)).toString();
    newRate = parseFloat(baseRate.toFixed(2)).toString();
  } else {
    const firstRate = roleDetail.role_rates?.[0];
    const fallbackCost = firstRate?.internal_cost_rate ?? 0;
    const fallbackRate = firstRate?.external_rate ?? 0;
    newCost = parseFloat(fallbackCost.toFixed(2)).toString();
    newRate = parseFloat(fallbackRate.toFixed(2)).toString();
  }

  return { newRate, newCost };
}

interface EstimateEmptyRowProps {
  estimateId: string;
  weeks: Date[];
  currency: string;
  rowIndex: number;
  stableId: string; // Stable ID to prevent remounting
  opportunityDeliveryCenterId?: string; // Opportunity Invoice Center (delivery_center_id)
  startDate?: string; // Opportunity start date
  endDate?: string; // Opportunity end date
  invoiceCustomer?: boolean;
  billableExpenses?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function EstimateEmptyRow({
  estimateId,
  weeks,
  currency,
  rowIndex: _rowIndex,
  stableId,
  opportunityDeliveryCenterId,
  startDate: opportunityStartDate,
  endDate: opportunityEndDate,
  invoiceCustomer = true,
  billableExpenses = true,
  onContextMenu,
}: EstimateEmptyRowProps) {
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
  const createLineItem = useCreateLineItem();
  const updateLineItem = useUpdateLineItem();
  const deleteLineItemMutation = useDeleteLineItem();
  const queryClient = useQueryClient();

  // Initialize lineItemId from localStorage or null
  const getInitialLineItemId = (): string | null => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`line-item-id-${stableId}-${estimateId}`);
      return saved || null;
    }
    return null;
  };

  const [lineItemId, setLineItemId] = useState<string | null>(getInitialLineItemId);
  const [isAutoFillOpen, setIsAutoFillOpen] = useState(false);
  const isReceivingBackendUpdateRef = useRef(false);

  // Fetch estimate detail to get the line item when it's created
  // Force refetch to ensure we have fresh data from database
  const { data: estimateDetail } = useEstimateDetail(estimateId, {
    enabled: true, // Always fetch to check for existing line items
    refetchOnMount: "always",
    staleTime: 0, // Never consider data stale
  });

  // Use a ref to persist formData across refetches, initialized from localStorage if available
  // CRITICAL: Always use Opportunity dates for start_date and end_date, never use cached dates
  const getInitialFormData = (): EstimateLineItemCreate => {
    // Always prioritize Opportunity dates - they should match the Opportunity's date range
    const defaultStartDate = opportunityStartDate || new Date().toISOString().split("T")[0];
    const defaultEndDate = opportunityEndDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    
    if (typeof window !== "undefined") {
      const savedLineItemId = localStorage.getItem(`line-item-id-${stableId}-${estimateId}`);
      // stableId + estimateId: each empty slot has its own draft key (rowIndex not needed)
      const saved = localStorage.getItem(`empty-row-${stableId}-${estimateId}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const merged: EstimateLineItemCreate = {
            ...parsed,
            currency: currency, // Always use current currency
            start_date: defaultStartDate, // Always use Opportunity start date
            end_date: defaultEndDate, // Always use Opportunity end date
          };
          // Without a server line item id, restoring role_id makes the auto-save effect
          // create a new line item on every mount — multiple empty slots → many spurious rows.
          if (!savedLineItemId) {
            merged.role_id = "";
            merged.rate = "";
            merged.cost = "";
            merged.employee_id = undefined;
          }
          return merged;
        } catch {
          // Ignore parse errors
        }
      }
    }
    return {
      role_id: "",
      delivery_center_id: opportunityDeliveryCenterId || "", // Always use Opportunity Invoice Center (required)
      employee_id: "",
      rate: "",
      cost: "",
      currency: currency,
      start_date: defaultStartDate, // Always use Opportunity start date
      end_date: defaultEndDate, // Always use Opportunity end date
      billable: invoiceCustomer, // Default to invoiceCustomer value
      billable_expense_percentage: "0",
    };
  };

  const [formData, setFormData] = useState<EstimateLineItemCreate>(getInitialFormData);

  // CRITICAL: Update dates when Opportunity dates change to ensure they always match
  // This ensures that if Opportunity dates are updated or loaded later, empty rows use the correct dates
  useEffect(() => {
    if (opportunityStartDate && opportunityEndDate && !lineItemId) {
      // Only update if we don't have a line item yet (empty row)
      // Format dates to YYYY-MM-DD for date inputs
      const formattedStartDate = opportunityStartDate.includes('T') 
        ? opportunityStartDate.split('T')[0] 
        : opportunityStartDate;
      const formattedEndDate = opportunityEndDate.includes('T') 
        ? opportunityEndDate.split('T')[0] 
        : opportunityEndDate;
      
      // Update formData if dates don't match Opportunity dates
      setFormData(prev => {
        if (prev.start_date !== formattedStartDate || prev.end_date !== formattedEndDate) {
          // Update the ref when start_date changes from opportunity
          if (prev.start_date !== formattedStartDate) {
            prevStartDateRef.current = formattedStartDate;
          }
          return {
            ...prev,
            start_date: formattedStartDate,
            end_date: formattedEndDate,
          };
        }
        return prev;
      });
    }
  }, [opportunityStartDate, opportunityEndDate, lineItemId]);

  // When Opportunity Invoice Center loads after first paint, default Payable (delivery_center_id) for new rows
  useEffect(() => {
    if (!opportunityDeliveryCenterId || lineItemId) return;
    setFormData((prev) => {
      if (prev.delivery_center_id) return prev;
      const next = { ...prev, delivery_center_id: opportunityDeliveryCenterId };
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem(`empty-row-${stableId}-${estimateId}`);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            localStorage.setItem(
              `empty-row-${stableId}-${estimateId}`,
              JSON.stringify({ ...parsed, delivery_center_id: opportunityDeliveryCenterId })
            );
          } catch {
            /* ignore */
          }
        }
      }
      return next;
    });
  }, [opportunityDeliveryCenterId, lineItemId, stableId, estimateId]);

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
  
  // CRITICAL: Check if lineItemId exists in localStorage but NOT in database (stale data)
  // This happens when a line item is deleted but localStorage still has the old ID
  const hasStaleLineItemId = lineItemId && estimateDetail && !estimateDetail.line_items?.some(item => item.id === lineItemId);
  
  // Clear formData and lineItemId ONLY if this specific row's lineItemId is already rendered
  // This prevents the empty row from showing duplicate data when the line item is rendered as EstimateLineItemRow
  useLayoutEffect(() => {
    if (isRenderedAsLineItemRow && lineItemId) {
      // This specific line item is now rendered as EstimateLineItemRow, so clear this empty row
      console.log("Clearing empty row because its line item is already rendered as EstimateLineItemRow:", lineItemId);
      if (typeof window !== "undefined") {
        localStorage.removeItem(`line-item-id-${stableId}-${estimateId}`);
        localStorage.removeItem(`empty-row-${stableId}-${estimateId}`);
      }
      setLineItemId(null);
      setFormData(getInitialFormData());
    }
  }, [isRenderedAsLineItemRow, lineItemId, stableId, estimateId, estimateDetail]);
  
  // CRITICAL: Clear stale lineItemId from localStorage if it doesn't exist in database
  useEffect(() => {
    if (hasStaleLineItemId && lineItemId) {
      console.log("Detected stale lineItemId in localStorage that doesn't exist in database, clearing:", lineItemId);
      if (typeof window !== "undefined") {
        localStorage.removeItem(`line-item-id-${stableId}-${estimateId}`);
        localStorage.removeItem(`empty-row-${stableId}-${estimateId}`);
      }
      setLineItemId(null);
      setFormData(getInitialFormData());
    }
  }, [hasStaleLineItemId, lineItemId, stableId, estimateId]);
  
  // CRITICAL: Check if this row's formData matches a line item that doesn't exist
  // This handles cases where form data was saved but the line item creation failed
  // IMPORTANT: Only run when estimateDetail changes, NOT when formData changes (to avoid clearing during editing)
  useEffect(() => {
    // Skip cleanup if we're currently saving or creating - don't interfere with active operations
    if (isSaving || isCreatingRef.current) {
      return;
    }
    
    // Skip cleanup if we have a lineItemId that exists in the database - this row is valid
    if (lineItemId && estimateDetail?.line_items?.some(item => item.id === lineItemId)) {
      return;
    }
    
    // Only check if we have form data but no lineItemId (meaning it's not a saved record)
    if (!lineItemId && formData.role_id && estimateDetail && estimateDetail.line_items) {
      // Check if there's a line item matching this form data
      // Use more lenient matching - check role and employee first, then rate/cost
      const matchingItem = estimateDetail.line_items.find(item => {
        const roleMatches = item.role_id === formData.role_id;
        const employeeMatches = (item.employee_id || null) === (formData.employee_id || null);
        const rateMatches = formData.rate ? Math.abs(parseFloat(String(item.rate)) - parseFloat(String(formData.rate))) < 0.01 : true;
        const costMatches = formData.cost ? Math.abs(parseFloat(String(item.cost)) - parseFloat(String(formData.cost))) < 0.01 : true;
        
        return roleMatches && employeeMatches && rateMatches && costMatches;
      });
      
      // If no matching item exists AND we have meaningful data, this form data is stale
      // But only clear if the data looks "complete" (has both role and some other field)
      // This prevents clearing data that's still being entered
      const hasCompleteData = formData.role_id && (formData.rate || formData.cost || formData.employee_id);
      if (!matchingItem && hasCompleteData) {
        // Add a small delay to avoid clearing data that's about to be saved
        const timeoutId = setTimeout(() => {
          // Double-check we're still not saving/creating and still no match
          if (!isSaving && !isCreatingRef.current && !lineItemId && estimateDetail && estimateDetail.line_items) {
            const stillNoMatch = !estimateDetail.line_items.some(item => {
              const roleMatches = item.role_id === formData.role_id;
              const employeeMatches = (item.employee_id || null) === (formData.employee_id || null);
              return roleMatches && employeeMatches;
            });
            
            if (stillNoMatch) {
              console.log("Clearing stale form data - no matching database record found:", {
                role_id: formData.role_id,
                rate: formData.rate,
                cost: formData.cost,
                employee_id: formData.employee_id,
                database_line_items_count: estimateDetail.line_items.length
              });
              if (typeof window !== "undefined") {
                localStorage.removeItem(`empty-row-${stableId}-${estimateId}`);
                localStorage.removeItem(`line-item-id-${stableId}-${estimateId}`);
              }
              setFormData(getInitialFormData());
            }
          }
        }, 2000); // 2 second delay to allow saves to complete
        
        return () => clearTimeout(timeoutId);
      }
    }
  }, [estimateDetail?.line_items, lineItemId, stableId, estimateId, opportunityDeliveryCenterId]); // Only depend on estimateDetail changes, not formData (isSaving checked inside effect)
  
  // CRITICAL: Also run cleanup on mount and when estimateDetail first loads
  // This ensures stale form data is cleared even if it was loaded before estimateDetail
  // But only run once per estimate load, and skip if actively saving/creating
  useEffect(() => {
    // Skip cleanup if we're currently saving or creating
    if (isSaving || isCreatingRef.current) {
      return;
    }
    
    if (estimateDetail && estimateDetail.line_items && !lineItemId) {
      // If we have form data but no lineItemId, check if it matches any database record
      // Only check if we have "complete" data (role + something else) to avoid clearing partial entries
      const hasCompleteData = formData.role_id && (formData.rate || formData.cost || formData.employee_id);
      if (hasCompleteData) {
        const hasMatch = estimateDetail.line_items.some(item => {
          const roleMatches = item.role_id === formData.role_id;
          const employeeMatches = (item.employee_id || null) === (formData.employee_id || null);
          return roleMatches && employeeMatches;
        });
        
        if (!hasMatch) {
          // Add delay to avoid clearing data that's about to be saved
          const timeoutId = setTimeout(() => {
            if (!isSaving && !isCreatingRef.current && !lineItemId && estimateDetail && estimateDetail.line_items) {
              const stillNoMatch = !estimateDetail.line_items.some(item => {
                const roleMatches = item.role_id === formData.role_id;
                const employeeMatches = (item.employee_id || null) === (formData.employee_id || null);
                return roleMatches && employeeMatches;
              });
              
              if (stillNoMatch) {
                console.log("Mount cleanup: Clearing stale form data - no matching database record:", {
                  formData: { role_id: formData.role_id, employee_id: formData.employee_id, rate: formData.rate, cost: formData.cost },
                  database_count: estimateDetail.line_items.length
                });
                if (typeof window !== "undefined") {
                  localStorage.removeItem(`empty-row-${stableId}-${estimateId}`);
                  localStorage.removeItem(`line-item-id-${stableId}-${estimateId}`);
                }
                setFormData(getInitialFormData());
              }
            }
          }, 2000); // 2 second delay
          
          return () => clearTimeout(timeoutId);
        }
      }
    }
  }, [estimateDetail?.id]); // Run when estimateDetail first loads (isSaving checked inside effect)

  // The effective line item ID is simply the lineItemId we have stored
  // This ensures each row only operates on its own database record
  const effectiveLineItemId = lineItemId || null;
  const effectiveLineItem = lineItem || null;
  
  // For Delete button: show if this row has a database record
  // CRITICAL: Must verify the line item actually exists in the database, not just in localStorage
  // Check if lineItemId exists AND is found in estimateDetail.line_items
  const existingLineItemById = effectiveLineItemId 
    ? estimateDetail?.line_items?.find(item => item.id === effectiveLineItemId)
    : null;
  
  // CRITICAL: Don't match by field values - this causes cross-row contamination
  // Each row should only operate on its own lineItemId, never match to other rows
  // Only show Delete if we have a valid database record with our specific lineItemId
  const hasDatabaseRecord = existingLineItemById !== null;
  const recordIdForDelete = existingLineItemById?.id || null;

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
        localStorage.setItem(`line-item-id-${stableId}-${estimateId}`, lineItemId);
      } else {
        localStorage.removeItem(`line-item-id-${stableId}-${estimateId}`);
      }
    }
  }, [lineItemId, stableId, estimateId]);

  // Fetch role details when role is selected (to get role rates)
  const { data: selectedRoleData } = useRole(formData.role_id || "", true, {
    enabled: !!formData.role_id,
  });

  // Fetch employee details when employee is selected (to get employee rates)
  const { data: selectedEmployeeData } = useEmployee(formData.employee_id || "", false, {
    enabled: !!formData.employee_id,
  });

  const roleRatesFingerprint = fingerprintRoleRates(selectedRoleData);

  // Save formData to localStorage whenever it changes (but not on initial mount)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasData = formData.role_id || formData.delivery_center_id || formData.employee_id || formData.rate || formData.cost;
      if (hasData) {
        // Include rowIndex in key to prevent first row from affecting second row
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

  const hoursSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCreatingRef = useRef(false);
  const lastSavedDataRef = useRef<Partial<EstimateLineItemCreate>>({});
  // Track which week keys are currently being edited to prevent backend data from overwriting user input
  const activelyEditingWeeksRef = useRef<Set<string>>(new Set());

  // Track previous saved data to prevent unnecessary saves
  const prevSavedDataRef = useRef<Partial<EstimateLineItemCreate>>({});
  
  // Track previous start_date to detect when it's moved later
  const prevStartDateRef = useRef<string>(formData.start_date);
  
  // Track previous billableExpenses to detect when it changes from true to false
  const prevBillableExpensesRef = useRef<boolean>(billableExpenses);

  /** After a line is created, the real row appears in the list; clear this slot so we never show a duplicate (empty + line). */
  const resetEmptyRowSlot = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(`line-item-id-${stableId}-${estimateId}`);
      localStorage.removeItem(`empty-row-${stableId}-${estimateId}`);
    }
    const blank = getInitialFormData();
    setFormData(blank);
    setLineItemId(null);
    setWeeklyHoursValues(new Map());
    prevStartDateRef.current = blank.start_date;
    prevSavedDataRef.current = {
      role_id: blank.role_id,
      delivery_center_id: blank.delivery_center_id,
      employee_id: blank.employee_id,
      rate: blank.rate,
      cost: blank.cost,
      start_date: blank.start_date,
      end_date: blank.end_date,
    };
    lastSavedDataRef.current = { ...blank };
  // getInitialFormData is recreated each render; same inputs as that helper
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableId, estimateId, opportunityStartDate, opportunityEndDate, opportunityDeliveryCenterId, currency, invoiceCustomer, billableExpenses]);

  // Clear billable expense percentage when billableExpenses changes from true to false
  useEffect(() => {
    if (prevBillableExpensesRef.current && !billableExpenses) {
      // billableExpenses changed from true to false - clear the value
      if (formData.billable_expense_percentage && formData.billable_expense_percentage !== "0") {
        setFormData(prev => ({
          ...prev,
          billable_expense_percentage: "0",
        }));
        // If we have a line item, update it in the database
        if (lineItemId && !isSaving && !isCreatingRef.current) {
          updateLineItem.mutateAsync({
            estimateId,
            lineItemId,
            data: { billable_expense_percentage: "0" },
          }).catch((err) => {
            console.error("Failed to clear billable expense percentage:", err);
          });
        }
      }
    }
    prevBillableExpensesRef.current = billableExpenses;
  }, [billableExpenses, formData.billable_expense_percentage, lineItemId, estimateId, updateLineItem, isSaving]);

  // Track previous role and employee to detect changes
  const prevRoleIdRef = useRef<string>(formData.role_id || "");
  const prevEmployeeIdRef = useRef<string>(formData.employee_id || "");
  const lastPopulatedEmployeeRef = useRef<string>("");
  const lastPopulatedRoleDataRef = useRef<string>("");
  const lastCalculationSignatureRef = useRef<string>("");

  const handleRoleSelect = useCallback(
    async (newRoleId: string) => {
      if (!newRoleId) {
        setFormData((prev) => ({ ...prev, role_id: "" }));
        prevRoleIdRef.current = "";
        lastPopulatedRoleDataRef.current = "";
        return;
      }

      let roleDetail: RoleResponse;
      try {
        roleDetail = await queryClient.fetchQuery({
          queryKey: rolesDetailQueryKey(newRoleId),
          queryFn: () => rolesApi.getRole(newRoleId, true),
        });
      } catch (err) {
        console.error("Failed to fetch role for spreadsheet row:", err);
        setFormData((prev) => ({ ...prev, role_id: newRoleId }));
        return;
      }

      const computed = computeRateCostFromRoleDetail(
        roleDetail,
        opportunityDeliveryCenterId,
        invoiceCenterDefaultCurrency,
        currency
      );

      setFormData((prev) => {
        const next: EstimateLineItemCreate = { ...prev, role_id: newRoleId };
        if (!computed) {
          return next;
        }
        const hasEmployee = !!prev.employee_id;
        return {
          ...next,
          rate: computed.newRate,
          ...(hasEmployee ? {} : { cost: computed.newCost }),
        };
      });

      const currentKey = `${newRoleId}-${opportunityDeliveryCenterId ?? ""}-${currency}`;
      prevRoleIdRef.current = newRoleId;
      lastPopulatedRoleDataRef.current = computed ? currentKey : "";
    },
    [queryClient, opportunityDeliveryCenterId, invoiceCenterDefaultCurrency, currency]
  );

  // When Role is selected, update Cost and Rate from RoleRate.
  // useLayoutEffect so rate/cost flush before the auto-save useEffect runs in the same commit
  // (otherwise create/update can run once with the employee rate still in formData).
  useLayoutEffect(() => {
    if (isSaving || isCreatingRef.current || isReceivingBackendUpdateRef.current) {
      return;
    }

    if (!formData.role_id || !opportunityDeliveryCenterId || !selectedRoleData) {
      return;
    }

    if (selectedRoleData.id !== formData.role_id) {
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

    const matchingRate = pickRoleRateForOpportunityInvoiceCenter(
      selectedRoleData.role_rates,
      opportunityDeliveryCenterId,
      invoiceCenterDefaultCurrency
    );

    let newCost: string;
    let newRate: string;
    let roleRateCurrency: string = currency;

    if (matchingRate) {
      let baseCost = matchingRate.internal_cost_rate || 0;
      let baseRate = matchingRate.external_rate || 0;
      roleRateCurrency =
        matchingRate.default_currency || invoiceCenterDefaultCurrency || "USD";

      if (roleRateCurrency.toUpperCase() !== currency.toUpperCase()) {
        baseCost = convertCurrency(baseCost, roleRateCurrency, currency);
        baseRate = convertCurrency(baseRate, roleRateCurrency, currency);
        if (!Number.isFinite(baseCost) || !Number.isFinite(baseRate)) {
          return;
        }
      }

      newCost = parseFloat(baseCost.toFixed(2)).toString();
      newRate = parseFloat(baseRate.toFixed(2)).toString();
    } else {
      if (selectedRoleData) {
        const firstRate = selectedRoleData.role_rates?.[0];
        const fallbackCost = firstRate?.internal_cost_rate ?? 0;
        const fallbackRate = firstRate?.external_rate ?? 0;
        newCost = parseFloat(fallbackCost.toFixed(2)).toString();
        newRate = parseFloat(fallbackRate.toFixed(2)).toString();
      } else {
        prevRoleIdRef.current = formData.role_id || "";
        return;
      }
    }

    const hasEmployee = !!formData.employee_id;

    setFormData((prev) => {
      const updates: Partial<EstimateLineItemCreate> = {
        rate: newRate,
      };
      if (!hasEmployee) {
        updates.cost = newCost;
      }
      return { ...prev, ...updates };
    });

    prevRoleIdRef.current = formData.role_id || "";
    lastPopulatedRoleDataRef.current = currentKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formData.role_id,
    formData.employee_id,
    opportunityDeliveryCenterId,
    invoiceCenterDefaultCurrency,
    currency,
    selectedRoleData?.id,
    roleRatesFingerprint,
    isSaving,
    isCreatingRef,
  ]);

  // When Employee is selected or cleared, update Cost (and Rate if no role).
  useLayoutEffect(() => {
    if (isSaving || isCreatingRef.current || isReceivingBackendUpdateRef.current) {
      return;
    }

    const currentEmployeeId = formData.employee_id || "";
    const employeeChanged = currentEmployeeId !== prevEmployeeIdRef.current;

    const calculationSignature = `${currentEmployeeId}|${currency}|${opportunityDeliveryCenterId}|${!!deliveryCentersData}`;
    const signatureChanged = calculationSignature !== lastCalculationSignatureRef.current;

    if (employeeChanged) {
      lastPopulatedEmployeeRef.current = "";
      lastCalculationSignatureRef.current = "";
    }

    if (!employeeChanged && !signatureChanged && lastPopulatedEmployeeRef.current === currentEmployeeId) {
      return;
    }

    if (!currentEmployeeId) {
      if (formData.role_id && opportunityDeliveryCenterId && selectedRoleData) {
        if (selectedRoleData.id !== formData.role_id) {
          return;
        }

        const matchingRate = pickRoleRateForOpportunityInvoiceCenter(
          selectedRoleData.role_rates,
          opportunityDeliveryCenterId,
          invoiceCenterDefaultCurrency
        );

        let newCost: string;
        if (matchingRate) {
          let baseCost = matchingRate.internal_cost_rate || 0;
          const roleRateCurrency =
            matchingRate.default_currency || invoiceCenterDefaultCurrency || "USD";

          if (roleRateCurrency.toUpperCase() !== currency.toUpperCase()) {
            baseCost = convertCurrency(baseCost, roleRateCurrency, currency);
            if (!Number.isFinite(baseCost)) {
              return;
            }
          }

          newCost = parseFloat(baseCost.toFixed(2)).toString();
        } else {
          if (selectedRoleData) {
            const firstRate = selectedRoleData.role_rates?.[0];
            const fallbackCost = firstRate?.internal_cost_rate ?? 0;
            newCost = parseFloat(fallbackCost.toFixed(2)).toString();
          } else {
            return;
          }
        }

        if (newCost !== formData.cost) {
          setFormData((prev) => ({
            ...prev,
            cost: newCost,
          }));
        }
      }
      prevEmployeeIdRef.current = currentEmployeeId;
      return;
    }

    if (!selectedEmployeeData || selectedEmployeeData.id !== currentEmployeeId) {
      return;
    }

    if (!deliveryCentersData || isLoadingDeliveryCenters || isFetchingDeliveryCenters) {
      return;
    }

    const employeeDeliveryCenterId = selectedEmployeeData.delivery_center
      ? deliveryCentersData.items.find((dc) => dc.code === selectedEmployeeData.delivery_center)?.id
      : null;

    const centersMatch =
      opportunityDeliveryCenterId && employeeDeliveryCenterId
        ? String(opportunityDeliveryCenterId) === String(employeeDeliveryCenterId)
        : false;

    let employeeCost: number;
    let employeeRate = 0;
    const employeeCurrency = selectedEmployeeData.default_currency || "USD";
    const currenciesMatch = employeeCurrency.toUpperCase() === currency.toUpperCase();
    const hasRole = !!formData.role_id;

    if (centersMatch) {
      employeeCost = selectedEmployeeData.internal_cost_rate || 0;
    } else {
      employeeCost = selectedEmployeeData.internal_bill_rate || 0;
    }

    if (!hasRole) {
      employeeRate = selectedEmployeeData.external_bill_rate || 0;
    }

    if (!currenciesMatch) {
      employeeCost = convertCurrency(employeeCost, employeeCurrency, currency);
      if (!Number.isFinite(employeeCost)) {
        return;
      }
      employeeCost = parseFloat(employeeCost.toFixed(2));
      if (!hasRole) {
        employeeRate = convertCurrency(employeeRate, employeeCurrency, currency);
        if (!Number.isFinite(employeeRate)) {
          return;
        }
        employeeRate = parseFloat(employeeRate.toFixed(2));
      }
    }

    const newCost = parseFloat(employeeCost.toFixed(2)).toString();
    const newRate = !hasRole ? parseFloat(employeeRate.toFixed(2)).toString() : formData.rate;

    const updates: Partial<EstimateLineItemCreate> = {
      cost: newCost,
    };
    if (!hasRole && formData.rate !== newRate) {
      updates.rate = newRate;
    }

    setFormData((prev) => ({
      ...prev,
      ...updates,
    }));

    lastPopulatedEmployeeRef.current = currentEmployeeId;
    lastCalculationSignatureRef.current = `${currentEmployeeId}|${currency}|${opportunityDeliveryCenterId}|${!!deliveryCentersData}`;

    prevEmployeeIdRef.current = currentEmployeeId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formData.employee_id,
    formData.role_id,
    opportunityDeliveryCenterId,
    invoiceCenterDefaultCurrency,
    currency,
    selectedEmployeeData,
    selectedRoleData,
    rolesData,
    deliveryCentersData,
    isSaving,
    isCreatingRef,
    isLoadingDeliveryCenters,
    isFetchingDeliveryCenters,
  ]);

  // SIMPLE: Save immediately when ANY field changes - no debounce, no complex logic
  const saveToDatabase = useCallback(async () => {
    // Skip if already saving/creating
    if (isSaving || isCreatingRef.current) {
      return;
    }

    // Check if data actually changed compared to last saved
    const currentData = {
      role_id: formData.role_id,
      delivery_center_id: formData.delivery_center_id,
      employee_id: formData.employee_id,
      rate: formData.rate,
      cost: formData.cost,
      start_date: formData.start_date,
      end_date: formData.end_date,
    };

    const hasChanges = 
      prevSavedDataRef.current.role_id !== currentData.role_id ||
      prevSavedDataRef.current.delivery_center_id !== currentData.delivery_center_id ||
      prevSavedDataRef.current.employee_id !== currentData.employee_id ||
      prevSavedDataRef.current.rate !== currentData.rate ||
      prevSavedDataRef.current.cost !== currentData.cost ||
      prevSavedDataRef.current.start_date !== currentData.start_date ||
      prevSavedDataRef.current.end_date !== currentData.end_date;

    // If we have a line item ID, UPDATE it immediately
    if (lineItemId) {
      if (!formData.role_id) {
        return; // Can't update without role_id
      }

      // Skip if nothing changed
      if (!hasChanges) {
        return;
      }

      setIsSaving(true);
      try {
        const updateData: Partial<EstimateLineItemUpdate> = {
          role_id: formData.role_id,
          delivery_center_id: formData.delivery_center_id || opportunityDeliveryCenterId,
          employee_id: formData.employee_id || null,
          rate: formData.rate || "0",
          cost: formData.cost || "0",
          start_date: formData.start_date,
          end_date: formData.end_date,
          billable: invoiceCustomer ? (formData.billable ?? true) : false,
          billable_expense_percentage: billableExpenses ? (formData.billable_expense_percentage || "0") : "0",
        };

        await updateLineItem.mutateAsync({
          estimateId,
          lineItemId,
          data: updateData as EstimateLineItemUpdate,
        });
        
        // Update saved data reference - DON'T invalidate queries to prevent refetch loop
        prevSavedDataRef.current = { ...currentData };
        lastSavedDataRef.current = { ...formData };
        console.log("Line item updated:", lineItemId);
      } catch (err) {
        console.error("Failed to update line item:", err);
        // CRITICAL: Update saved data ref even on error to prevent infinite retry loop
        // This prevents the useEffect from seeing the same data and trying to save again
        prevSavedDataRef.current = { ...currentData };
        lastSavedDataRef.current = { ...formData };
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // If we DON'T have a line item ID but have role_id, CREATE it immediately
    // CRITICAL: Never match to existing line items - each empty row must create its own line item
    // Matching to existing items causes cross-row contamination where editing one row updates another
    if (!lineItemId && formData.role_id) {
      isCreatingRef.current = true;
      setIsSaving(true);
      
      try {
        const createData: EstimateLineItemCreate = {
          role_id: formData.role_id,
          delivery_center_id: opportunityDeliveryCenterId!,
          employee_id: formData.employee_id || undefined,
          rate: formData.rate || "0",
          cost: formData.cost || "0",
          currency: currency, // Always use the opportunity currency passed as prop, not formData.currency
          start_date: formData.start_date,
          end_date: formData.end_date,
          billable: invoiceCustomer ? (formData.billable ?? true) : false,
          billable_expense_percentage: billableExpenses ? (formData.billable_expense_percentage || "0") : "0",
        };
        
        if (!createData.employee_id) {
          delete createData.employee_id;
        }
        
        console.log("Creating line item:", createData);
        const newLineItem = await createLineItem.mutateAsync({
          estimateId,
          data: createData,
        });
        
        console.log("Line item created:", newLineItem.id);
        await queryClient.invalidateQueries({
          queryKey: ["estimates", "detail", estimateId, true],
        });
        resetEmptyRowSlot();
      } catch (err) {
        console.error("Failed to create line item:", err);
        // CRITICAL: Update saved data ref even on error to prevent infinite retry loop
        // This prevents the useEffect from seeing the same data and trying to save again
        prevSavedDataRef.current = { ...currentData };
        lastSavedDataRef.current = { ...formData };
        // Don't clear formData or lineItemId on error - let user see the error and fix it
      } finally {
        isCreatingRef.current = false;
        setIsSaving(false);
      }
      return;
    }
    // Narrow deps: full formData would retrigger save loop; isSaving checked inside callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineItemId, formData.role_id, formData.delivery_center_id, formData.employee_id, formData.rate, formData.cost, formData.start_date, formData.end_date, estimateId, createLineItem, updateLineItem, queryClient, isSaving, estimateDetail, opportunityDeliveryCenterId, currency, invoiceCustomer, billableExpenses, resetEmptyRowSlot]);

  // SIMPLE: Save to database immediately when ANY field in formData changes
  useEffect(() => {
    // Skip if saving/creating or receiving backend update
    if (isSaving || isCreatingRef.current || isReceivingBackendUpdateRef.current) {
      return;
    }

    // Save immediately - no debounce, no complex logic
    // If we have lineItemId -> update
    // If we have role_id but no lineItemId -> create
    // Otherwise -> wait for role_id
    if (lineItemId || formData.role_id) {
      console.log("FormData changed - saving to database:", { 
        hasLineItemId: !!lineItemId, 
        hasRoleId: !!formData.role_id,
        formData: { role_id: formData.role_id, cost: formData.cost, rate: formData.rate, employee_id: formData.employee_id }
      });
      saveToDatabase();
    }
    // isSaving intentionally omitted — effect gates on it internally via saveToDatabase
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formData.role_id,
    formData.delivery_center_id,
    formData.employee_id,
    formData.cost,
    formData.rate,
    formData.start_date,
    formData.end_date,
    lineItemId,
    saveToDatabase,
  ]);

  const parseLocalDate = (dateStr: string): Date => {
    const datePart = dateStr.split("T")[0];
    const [year, month, day] = datePart.split("-").map(Number);
    return new Date(year, month - 1, day);
  };

  const formatDateKey = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const getWeekKey = (week: Date) => formatDateKey(week);

  const handleWeeklyHoursUpdate = async (weekKey: string, hours: string) => {
    // Ensure we have required fields and create line item if needed
    if (!formData.role_id || !formData.delivery_center_id) {
      return; // Can't save hours without required fields
    }

    const weekDate = parseLocalDate(weekKey);
    const startDate = parseLocalDate(formData.start_date);
    const endDate = parseLocalDate(formData.end_date);

    if (!weekColumnOverlapsLineRange(weekDate, startDate, endDate)) {
      return;
    }

    // Update local state immediately (only if not already set by onChange)
    // The onChange handler already updates the state, so this is mainly for the initial call
    if (!activelyEditingWeeksRef.current.has(weekKey)) {
      setWeeklyHoursValues((prev) => {
        const next = new Map(prev);
        next.set(weekKey, hours);
        return next;
      });
    }

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
        await queryClient.invalidateQueries({
          queryKey: ["estimates", "detail", estimateId, true],
        });
        resetEmptyRowSlot();
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
        
        // Remove from actively editing set after save completes
        // This allows sync from backend, but only after user is done typing
        setTimeout(() => {
          activelyEditingWeeksRef.current.delete(weekKey);
        }, 100);
        
        queryClient.invalidateQueries({
          queryKey: ["estimates", "detail", estimateId, true],
        });
      } catch (err) {
        console.error("Failed to update weekly hours:", err);
        // Remove from actively editing set on error
        activelyEditingWeeksRef.current.delete(weekKey);
        // Revert on error
        setWeeklyHoursValues((prev) => {
          const next = new Map(prev);
          next.delete(weekKey);
          return next;
        });
      }
    }, 500);
  };

  // Calculate totals
  const totalHours: number = Array.from(weeklyHoursValues.values()).reduce(
    (sum, hours) => sum + parseFloat(hours || "0"),
    0
  );
  const totalCost: number = totalHours * parseFloat(formData.cost || "0");
  // If billable is false, Total Revenue should be 0 (non-billable roles don't generate revenue)
  const billable = formData.billable ?? invoiceCustomer;
  const totalRevenue: number = billable ? totalHours * parseFloat(formData.rate || "0") : 0;
  const billableExpensePercentage: number = parseFloat(formData.billable_expense_percentage || "0");
  // Billable expenses are only calculated on billable revenue
  const billableExpenseAmount: number = billable ? (billableExpensePercentage / 100) * totalRevenue : 0;
  const marginAmount: number = totalRevenue - totalCost;
  // Margin % with expenses: (revenue - cost) / (revenue + expenses)
  const marginPercentageWithExpenses: number = (totalRevenue + billableExpenseAmount) > 0 
    ? (marginAmount / (totalRevenue + billableExpenseAmount)) * 100 
    : 0;
  // Margin % without expenses: (revenue - cost) / revenue
  const marginPercentageWithoutExpenses: number = totalRevenue > 0 
    ? (marginAmount / totalRevenue) * 100 
    : 0;

  if (isRenderedAsLineItemRow) {
    return null;
  }

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
          onChange={(e) => {
            void handleRoleSelect(e.target.value);
          }}
          className="text-xs h-7 w-full"
        >
          <option value="">Select...</option>
          {rolesSorted?.map((role) => (
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
          {employeesSorted?.map((employee) => (
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
              const newCost = e.target.value;
              setFormData({ ...formData, cost: newCost });
            }}
            onBlur={(e) => {
              // Trigger save on blur if value changed and we have a line item
              if (lineItemId && e.target.value !== formData.cost) {
                saveToDatabase();
              }
            }}
            placeholder="Auto"
            className="text-xs h-7 flex-1"
            disabled={!lineItemId && !formData.role_id}
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
              const newRate = e.target.value;
              setFormData({ ...formData, rate: newRate });
            }}
            onBlur={(e) => {
              // Trigger save on blur if value changed and we have a line item
              if (lineItemId && e.target.value !== formData.rate) {
                saveToDatabase();
              }
            }}
            placeholder="Auto"
            className="text-xs h-7 flex-1"
            disabled={!lineItemId && !formData.role_id}
          />
        </div>
      </td>

      {/* Cost Daily */}
      <td className="border border-gray-300 px-2 py-1" style={{ width: '120px', minWidth: '120px' }}>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500">{currency}</span>
          <span className="text-xs flex-1 text-right">
            {(parseFloat(formData.cost || "0") * 8).toFixed(2)}
          </span>
        </div>
      </td>

      {/* Rate Daily */}
      <td className="border border-gray-300 px-2 py-1" style={{ width: '120px', minWidth: '120px' }}>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500">{currency}</span>
          <span className="text-xs flex-1 text-right">
            {(parseFloat(formData.rate || "0") * 8).toFixed(2)}
          </span>
        </div>
      </td>

      {/* Start Date */}
      <td className="border border-gray-300 px-2 py-1">
        <Input
          type="date"
          value={formData.start_date}
          onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
          onBlur={(e) => {
            // Trigger save on blur if value changed and we have a line item
            if (lineItemId && e.target.value !== formData.start_date) {
              saveToDatabase();
            }
          }}
          className="text-xs h-7 w-full"
          disabled={!lineItemId && !formData.role_id}
        />
      </td>

      {/* End Date */}
      <td className="border border-gray-300 px-2 py-1">
        <Input
          type="date"
          value={formData.end_date}
          onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
          onBlur={(e) => {
            // Trigger save on blur if value changed and we have a line item
            if (lineItemId && e.target.value !== formData.end_date) {
              saveToDatabase();
            }
          }}
          className="text-xs h-7 w-full"
          disabled={!lineItemId && !formData.role_id}
        />
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
                  // CRITICAL: Never match to existing line items - this causes cross-row contamination
                  // Each row must have its own line item. If we don't have one, create it first.
                  let lineItemToUse = effectiveLineItem;
                  
                  // Only use the line item if we already have a lineItemId for THIS row
                  // Never search for matching items - that would cause one row to update another
                  if (!lineItemToUse && !lineItemId) {
                    // We need to create a line item first before opening auto-fill
                    // Auto-fill requires a line item to exist
                    console.log("Cannot open auto-fill - no line item exists for this row. Please save the row first.");
                    return;
                  }
                  
                  // If we still don't have a line item, create one
                  if (!lineItemToUse && !effectiveLineItemId) {
                    try {
                      // delivery_center_id always comes from opportunityDeliveryCenterId (required)
                      const createData: EstimateLineItemCreate = {
                        role_id: formData.role_id,
                        delivery_center_id: opportunityDeliveryCenterId!,
                        employee_id: formData.employee_id || undefined,
                        rate: formData.rate || "0",
                        cost: formData.cost || "0",
                        currency: formData.currency || currency,
                        start_date: formData.start_date,
                        end_date: formData.end_date,
                        billable: invoiceCustomer ? (formData.billable ?? true) : false,
                        billable_expense_percentage: billableExpenses ? (formData.billable_expense_percentage || "0") : "0",
                      };
                      // Remove undefined/empty employee_id - backend expects valid UUID or omitted
                      if (!createData.employee_id) {
                        delete createData.employee_id;
                      }
                      const newLineItem = await createLineItem.mutateAsync({
                        estimateId,
                        data: createData,
                      });
                      lineItemToUse = newLineItem;
                      await queryClient.invalidateQueries({
                        queryKey: ["estimates", "detail", estimateId, true],
                      });
                      resetEmptyRowSlot();
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
                    if (typeof window !== "undefined") {
                      localStorage.removeItem(`line-item-id-${stableId}-${estimateId}`);
                      localStorage.removeItem(`empty-row-${stableId}-${estimateId}`);
                    }
                    setLineItemId(null);
                    setFormData(getInitialFormData());
                  } catch (err: unknown) {
                    console.error("Failed to delete line item:", err);
                    const status =
                      err &&
                      typeof err === "object" &&
                      "response" in err &&
                      err.response &&
                      typeof err.response === "object" &&
                      "status" in err.response
                        ? (err.response as { status?: number }).status
                        : undefined;
                    const message = err instanceof Error ? err.message : String(err);
                    // If the line item doesn't exist (404), clear the stale lineItemId
                    if (status === 404 || message.includes("not found")) {
                      console.log("Line item not found, clearing stale lineItemId");
                      setLineItemId(null);
                      if (typeof window !== "undefined") {
                        localStorage.removeItem(`line-item-id-${stableId}-${estimateId}`);
                      }
                    } else {
                      alert(`Failed to delete line item: ${message}`);
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
          item.delivery_center_id === opportunityDeliveryCenterId &&
          String(item.cost) === String(formData.cost) &&
          String(item.rate) === String(formData.rate)
        ))) && (
          <AutoFillDialog
            lineItem={effectiveLineItem || estimateDetail!.line_items!.find(item => 
              item.role_id === formData.role_id &&
              item.delivery_center_id === opportunityDeliveryCenterId &&
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

      {/* Billable */}
      <td className="border border-gray-300 px-2 py-1 text-center">
        <input
          type="checkbox"
          checked={formData.billable ?? invoiceCustomer}
          onChange={(e) => setFormData({ ...formData, billable: e.target.checked })}
          disabled={!invoiceCustomer}
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
              const newValue = billableExpenses ? e.target.value : "0";
              setFormData({ ...formData, billable_expense_percentage: newValue });
            }}
            onBlur={(e) => {
              // Trigger save on blur if value changed and we have a line item
              if (lineItemId && billableExpenses && e.target.value !== (formData.billable_expense_percentage || "0")) {
                saveToDatabase();
              }
            }}
            placeholder="0"
            disabled={!billableExpenses || (!lineItemId && !formData.role_id)}
            className="text-xs h-7 flex-1"
          />
          <span className="text-[10px] text-gray-500">%</span>
        </div>
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
        // delivery_center_id always comes from opportunityDeliveryCenterId (required), so check that instead
        const canEdit = formData.role_id && opportunityDeliveryCenterId && isWithinRange;
        
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
                  const newHours = e.target.value || "0";
                  // Mark this week as actively being edited
                  activelyEditingWeeksRef.current.add(weekKey);
                  // Update local state immediately
                  setWeeklyHoursValues((prev) => {
                    const next = new Map(prev);
                    next.set(weekKey, newHours);
                    return next;
                  });
                  handleWeeklyHoursUpdate(weekKey, newHours);
                }
              }}
              onBlur={() => {
                // Remove from actively editing set when user leaves the input
                // Use a small delay to allow the save to complete first
                setTimeout(() => {
                  activelyEditingWeeksRef.current.delete(weekKey);
                }, 500);
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


"use client";

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import { useRolesForDeliveryCenter } from "@/hooks/useEstimates";
import { useRole } from "@/hooks/useRoles";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useEmployees, useEmployee } from "@/hooks/useEmployees";
import { useDeleteLineItem } from "@/hooks/useEngagements";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type {
  EngagementLineItemResponse,
  EngagementLineItemCreate,
  EngagementLineItemUpdate,
  EngagementDetailResponse,
} from "@/types/engagement";
import { convertCurrency } from "@/lib/utils/currency";
import { fingerprintRoleRates } from "@/lib/utils/role-rate-fingerprint";
import { logResourcePlanServerCall } from "@/lib/engagement-resource-plan-server-log";
import { pickEngagementCreateRateFromRole } from "@/lib/engagement-line-payload";
import { pickRoleRateForOpportunityInvoiceCenter } from "@/lib/utils/role-rate-picker";
import { EngagementAutoFillDialog } from "./auto-fill-dialog";

/**
 * Synchronous, engagement-scoped lock so only one draft create POST runs per engagement.
 * (Per-row isCreatingRef alone is not enough: a second draft slot or back-to-back tryFlush
 * in the same tick can both pass guards before the first set isCreatingRef runs.)
 */
const createInFlightByEngagementId = new Set<string>();

interface EngagementEmptyRowProps {
  engagementId: string;
  /** Parent's detail (single React Query subscription for this page) */
  engagement: EngagementDetailResponse;
  weeks: Date[];
  currency: string;
  rowIndex: number;
  stableId: string;
  opportunityDeliveryCenterId?: string;
  invoiceCustomer?: boolean;
  billableExpenses?: boolean;
  createLineItem: UseMutationResult<
    EngagementLineItemResponse,
    Error,
    { engagementId: string; data: EngagementLineItemCreate },
    { previousDetail: EngagementDetailResponse | undefined }
  >;
  updateLineItem: UseMutationResult<
    EngagementLineItemResponse,
    Error,
    { engagementId: string; lineItemId: string; data: EngagementLineItemUpdate }
  >;
}

export function EngagementEmptyRow({
  engagementId,
  engagement: engagementDetail,
  weeks,
  currency,
  rowIndex: _rowIndex,
  stableId,
  opportunityDeliveryCenterId,
  invoiceCustomer = true,
  billableExpenses = true,
  createLineItem,
  updateLineItem,
}: EngagementEmptyRowProps) {
  const { data: rolesData } = useRolesForDeliveryCenter(opportunityDeliveryCenterId);
  const { data: deliveryCentersData } = useDeliveryCenters();

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

  const deleteLineItemMutation = useDeleteLineItem();
  const queryClient = useQueryClient();
  const createPendingRef = useRef(false);
  const updatePendingRef = useRef(false);
  createPendingRef.current = createLineItem.isPending;
  updatePendingRef.current = updateLineItem.isPending;
  const [isAutoFillOpen, setIsAutoFillOpen] = useState(false);
  /** Synchronous guard (with isCreatingRef) so we do not rely on React Query isPending alone — it can be false for a tick. */
  const [isSaving, setIsSaving] = useState(false);

  // Initialize lineItemId from localStorage or null
  const getInitialLineItemId = (): string | null => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`engagement-line-item-id-${stableId}-${engagementId}`);
      return saved || null;
    }
    return null;
  };

  const [lineItemId, setLineItemId] = useState<string | null>(getInitialLineItemId);
  const isReceivingBackendUpdateRef = useRef(false);

  // Get initial form data
  const getInitialFormData = (): Partial<EngagementLineItemCreate> => {
    if (typeof window !== "undefined") {
      const savedLineItemId = localStorage.getItem(`engagement-line-item-id-${stableId}-${engagementId}`);
      const saved = localStorage.getItem(`engagement-empty-row-${stableId}-${engagementId}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const merged: Partial<EngagementLineItemCreate> = {
            ...parsed,
            currency: currency,
          };
          if (!savedLineItemId) {
            merged.role_id = "";
            merged.rate = "0";
            merged.cost = "0";
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

  // localStorage can hold a line id that no longer exists (e.g. deleted) — same as estimate-empty-row
  const hasStaleLineItemId =
    !!lineItemId && !!engagementDetail && !engagementDetail.line_items?.some((item) => item.id === lineItemId);
  
  // Clear formData and lineItemId if this specific row's lineItemId is already rendered (e.g. stale localStorage)
  useLayoutEffect(() => {
    if (isRenderedAsLineItemRow && lineItemId) {
      if (typeof window !== "undefined") {
        localStorage.removeItem(`engagement-line-item-id-${stableId}-${engagementId}`);
        localStorage.removeItem(`engagement-empty-row-${stableId}-${engagementId}`);
      }
      setLineItemId(null);
      setFormData(getInitialFormData());
    }
  }, [isRenderedAsLineItemRow, lineItemId, stableId, engagementId, engagementDetail]);

  useEffect(() => {
    if (hasStaleLineItemId && lineItemId) {
      if (typeof window !== "undefined") {
        localStorage.removeItem(`engagement-line-item-id-${stableId}-${engagementId}`);
        localStorage.removeItem(`engagement-empty-row-${stableId}-${engagementId}`);
      }
      setLineItemId(null);
      setFormData(getInitialFormData());
    }
  }, [hasStaleLineItemId, lineItemId, stableId, engagementId]);

  // When Opportunity Invoice Center loads after first paint, default Payable for new rows (see estimate-empty-row)
  useEffect(() => {
    if (!opportunityDeliveryCenterId || lineItemId) return;
    setFormData((prev) => {
      if (prev.payable_center_id) return prev;
      return { ...prev, payable_center_id: opportunityDeliveryCenterId };
    });
  }, [opportunityDeliveryCenterId, lineItemId]);

  // Persist lineItemId to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (lineItemId) {
        localStorage.setItem(`engagement-line-item-id-${stableId}-${engagementId}`, lineItemId);
      } else {
        localStorage.removeItem(`engagement-line-item-id-${stableId}-${engagementId}`);
      }
    }
  }, [lineItemId, stableId, engagementId]);

  // Fetch role details when role is selected
  const { data: selectedRoleData, isLoading: isLoadingRole, isFetching: isFetchingRole } = useRole(formData.role_id || "", true, {
    enabled: !!formData.role_id,
  });

  // Fetch employee details when employee is selected
  const { data: selectedEmployeeData, isLoading: isLoadingEmployee, isFetching: isFetchingEmployee } = useEmployee(formData.employee_id || "", false, {
    enabled: !!formData.employee_id,
  });

  const roleRatesFingerprint = fingerprintRoleRates(selectedRoleData);

  // Save formData to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasData = formData.role_id || formData.payable_center_id || formData.employee_id || formData.rate || formData.cost;
      if (hasData) {
        localStorage.setItem(`engagement-empty-row-${stableId}-${engagementId}`, JSON.stringify(formData));
      } else {
        localStorage.removeItem(`engagement-empty-row-${stableId}-${engagementId}`);
      }
    }
  }, [formData, stableId, engagementId]);

  // Clear localStorage when line item is created
  useEffect(() => {
    if (lineItemId && typeof window !== "undefined") {
      localStorage.removeItem(`engagement-empty-row-${stableId}-${engagementId}`);
    }
  }, [lineItemId, stableId, engagementId]);

  const isCreatingRef = useRef(false);
  const prevSavedDataRef = useRef<Partial<EngagementLineItemCreate>>({});
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  const resetEmptyRowSlot = useCallback(() => {
    setIsSaving(false);
    if (typeof window !== "undefined") {
      localStorage.removeItem(`engagement-line-item-id-${stableId}-${engagementId}`);
      localStorage.removeItem(`engagement-empty-row-${stableId}-${engagementId}`);
    }
    const blank = getInitialFormData();
    setFormData(blank);
    setLineItemId(null);
    prevSavedDataRef.current = {
      role_id: blank.role_id,
      payable_center_id: blank.payable_center_id,
      employee_id: blank.employee_id,
      rate: blank.rate,
      cost: blank.cost,
      start_date: blank.start_date,
      end_date: blank.end_date,
      billable: blank.billable,
      billable_expense_percentage: blank.billable_expense_percentage,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableId, engagementId, opportunityDeliveryCenterId, currency, invoiceCustomer, billableExpenses]);

  // Track previous role and employee to detect changes
  const prevRoleIdRef = useRef<string>(formData.role_id || "");
  const prevEmployeeIdRef = useRef<string>(formData.employee_id || "");
  const lastPopulatedRoleDataRef = useRef<string>("");
  const lastPopulatedEmployeeRef = useRef<string>("");

  const tryFlushPersist = useCallback(
    async (fd: Partial<EngagementLineItemCreate>, callSource = "tryFlushPersist:unspecified") => {
      if (isSaving || isCreatingRef.current || createPendingRef.current || updatePendingRef.current) {
        return;
      }

      const currentData = {
        role_id: fd.role_id,
        payable_center_id: fd.payable_center_id,
        employee_id: fd.employee_id,
        rate: fd.rate,
        cost: fd.cost,
        start_date: fd.start_date,
        end_date: fd.end_date,
      };

      const hasChanges =
        prevSavedDataRef.current.role_id !== currentData.role_id ||
        prevSavedDataRef.current.payable_center_id !== currentData.payable_center_id ||
        prevSavedDataRef.current.employee_id !== currentData.employee_id ||
        prevSavedDataRef.current.rate !== currentData.rate ||
        prevSavedDataRef.current.cost !== currentData.cost ||
        prevSavedDataRef.current.start_date !== currentData.start_date ||
        prevSavedDataRef.current.end_date !== currentData.end_date ||
        prevSavedDataRef.current.billable !== fd.billable ||
        (prevSavedDataRef.current as { billable_expense_percentage?: string }).billable_expense_percentage !==
          fd.billable_expense_percentage;

      const hasCreateIntentChange =
        prevSavedDataRef.current.role_id !== currentData.role_id ||
        prevSavedDataRef.current.payable_center_id !== currentData.payable_center_id ||
        prevSavedDataRef.current.employee_id !== currentData.employee_id ||
        prevSavedDataRef.current.start_date !== currentData.start_date ||
        prevSavedDataRef.current.end_date !== currentData.end_date;

      if (lineItemId) {
        if (!fd.role_id) {
          return;
        }
        if (!hasChanges) {
          return;
        }
        setIsSaving(true);
        try {
          const updateData: Partial<EngagementLineItemUpdate> = {
            role_id: fd.role_id,
            payable_center_id: fd.payable_center_id || opportunityDeliveryCenterId,
            employee_id: fd.employee_id || null,
            rate: fd.rate || "0",
            cost: fd.cost || "0",
            start_date: fd.start_date,
            end_date: fd.end_date,
            billable: invoiceCustomer ? (fd.billable ?? true) : false,
            billable_expense_percentage: billableExpenses ? (fd.billable_expense_percentage || "0") : "0",
          };
          logResourcePlanServerCall("updateLineItem", `tryFlush → full row PUT (${callSource})`, {
            engagementId,
            lineItemId,
            draftStableId: stableId,
            body: updateData,
          });
          await updateLineItem.mutateAsync({
            engagementId,
            lineItemId,
            data: updateData as EngagementLineItemUpdate,
          });
          prevSavedDataRef.current = { ...currentData, billable: fd.billable, billable_expense_percentage: fd.billable_expense_percentage };
        } catch (err) {
          console.error("Failed to update line item:", err);
          prevSavedDataRef.current = { ...currentData, billable: fd.billable, billable_expense_percentage: fd.billable_expense_percentage };
        } finally {
          setIsSaving(false);
        }
        return;
      }

      if (!lineItemId && fd.role_id) {
        if (isLoadingRole || isFetchingRole) {
          return;
        }
        const deliveryCenterId = fd.payable_center_id || opportunityDeliveryCenterId;
        if (!deliveryCenterId) {
          return;
        }
        if (!hasCreateIntentChange) {
          return;
        }
        if (createInFlightByEngagementId.has(engagementId)) {
          return;
        }
        createInFlightByEngagementId.add(engagementId);
        isCreatingRef.current = true;
        setIsSaving(true);
        try {
          const createData: Record<string, unknown> = {
            role_id: fd.role_id,
            delivery_center_id: deliveryCenterId,
            payable_center_id: fd.payable_center_id || undefined,
            employee_id: fd.employee_id || undefined,
            rate: fd.rate || "0",
            cost: fd.cost || "0",
            currency: currency,
            start_date: fd.start_date,
            end_date: fd.end_date,
            billable: invoiceCustomer ? (fd.billable ?? true) : false,
            billable_expense_percentage: billableExpenses ? (fd.billable_expense_percentage || "0") : "0",
          };
          if (!createData.employee_id) {
            delete createData.employee_id;
          }
          if (!createData.payable_center_id) {
            delete createData.payable_center_id;
          }
          {
            const r = pickEngagementCreateRateFromRole(
              fd.role_id,
              selectedRoleData,
              opportunityDeliveryCenterId,
              invoiceCenterDefaultCurrency,
              currency
            );
            if (r) {
              createData.rate = r;
            }
          }
          prevSavedDataRef.current = {
            role_id: fd.role_id,
            payable_center_id: fd.payable_center_id,
            employee_id: fd.employee_id,
            rate: createData.rate as string,
            cost: createData.cost as string,
            start_date: fd.start_date,
            end_date: fd.end_date,
            billable: fd.billable,
            billable_expense_percentage: fd.billable_expense_percentage,
          };
          logResourcePlanServerCall("createLineItem", `tryFlush → POST new line (${callSource})`, {
            engagementId,
            draftStableId: stableId,
            body: createData,
            isLoadingRole,
            isFetchingRole,
            hadCreateIntentChange: hasCreateIntentChange,
          });
          await createLineItem.mutateAsync({
            engagementId,
            data: createData as unknown as EngagementLineItemCreate,
          });
          resetEmptyRowSlot();
        } catch (err) {
          console.error("Failed to create line item:", err);
          // Do not clear prevSavedDataRef. It was set to the attempted payload before await;
          // clearing it makes hasCreateIntentChange true again on the next derive effect, which
          // re-POSTs the same body (duplicate calls after a 4xx/5xx). To retry, change an intent
          // field (role, employee, payable, dates) or fix the server and nudge a field.
        } finally {
          createInFlightByEngagementId.delete(engagementId);
          isCreatingRef.current = false;
          setIsSaving(false);
        }
      }
    },
    [
      isSaving,
      lineItemId,
      engagementId,
      createLineItem,
      updateLineItem,
      isLoadingRole,
      isFetchingRole,
      opportunityDeliveryCenterId,
      currency,
      invoiceCustomer,
      billableExpenses,
      resetEmptyRowSlot,
      selectedRoleData,
      invoiceCenterDefaultCurrency,
    ]
  );

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

  // Derive rate/cost from role + employee (one pass on a working copy, then setState + single persist call).
  useEffect(() => {
    if (
      isSaving ||
      isCreatingRef.current ||
      isReceivingBackendUpdateRef.current ||
      createLineItem.isPending ||
      updateLineItem.isPending
    ) {
      return;
    }

    const work: Partial<EngagementLineItemCreate> = { ...formData };

    if (work.role_id && opportunityDeliveryCenterId && selectedRoleData && !isLoadingRole && !isFetchingRole) {
      if (selectedRoleData.id === work.role_id) {
        const currentKey = `${work.role_id}-${opportunityDeliveryCenterId}-${currency}`;
        const roleChanged = work.role_id !== prevRoleIdRef.current;
        if (roleChanged) {
          lastPopulatedRoleDataRef.current = "";
        }
        if (roleChanged || lastPopulatedRoleDataRef.current !== currentKey) {
          const matchingRate = pickRoleRateForOpportunityInvoiceCenter(
            selectedRoleData.role_rates,
            opportunityDeliveryCenterId,
            invoiceCenterDefaultCurrency
          );
          let newCost: string | undefined;
          let newRate: string | undefined;
          if (matchingRate) {
            let baseCost = matchingRate.internal_cost_rate || 0;
            let baseRate = matchingRate.external_rate || 0;
            const roleRateCurrency = matchingRate.default_currency || invoiceCenterDefaultCurrency || "USD";
            if (roleRateCurrency.toUpperCase() !== currency.toUpperCase()) {
              baseCost = convertCurrency(baseCost, roleRateCurrency, currency);
              baseRate = convertCurrency(baseRate, roleRateCurrency, currency);
              if (!Number.isFinite(baseCost) || !Number.isFinite(baseRate)) {
                newCost = undefined;
                newRate = undefined;
              } else {
                newCost = parseFloat(baseCost.toFixed(2)).toString();
                newRate = parseFloat(baseRate.toFixed(2)).toString();
              }
            } else {
              newCost = parseFloat(baseCost.toFixed(2)).toString();
              newRate = parseFloat(baseRate.toFixed(2)).toString();
            }
          } else if (selectedRoleData.role_rates?.[0]) {
            const firstRate = selectedRoleData.role_rates[0]!;
            const fallbackCost = firstRate.internal_cost_rate ?? 0;
            const fallbackRate = firstRate.external_rate ?? 0;
            newCost = parseFloat(fallbackCost.toFixed(2)).toString();
            newRate = parseFloat(fallbackRate.toFixed(2)).toString();
          }
          if (newCost !== undefined && newRate !== undefined) {
            const hasEmployee = !!work.employee_id;
            const rateCh = work.rate !== newRate;
            const costCh = !hasEmployee && work.cost !== newCost;
            if (rateCh) {
              work.rate = newRate;
            }
            if (costCh) {
              work.cost = newCost;
            }
            prevRoleIdRef.current = work.role_id || "";
            lastPopulatedRoleDataRef.current = currentKey;
          }
        }
      }
    }

    const currentEmployeeId = work.employee_id || "";
    const employeeChanged = currentEmployeeId !== prevEmployeeIdRef.current;
    if (employeeChanged) {
      lastPopulatedEmployeeRef.current = "";
    }
    if (!(!employeeChanged && lastPopulatedEmployeeRef.current === currentEmployeeId)) {
      if (!currentEmployeeId) {
        if (work.role_id && opportunityDeliveryCenterId && selectedRoleData && !isLoadingRole && !isFetchingRole) {
          if (selectedRoleData.id === work.role_id) {
            const matchingRate = pickRoleRateForOpportunityInvoiceCenter(
              selectedRoleData.role_rates,
              opportunityDeliveryCenterId,
              invoiceCenterDefaultCurrency
            );
            let newNoEmpCost: string | undefined;
            if (matchingRate) {
              let baseCost = matchingRate.internal_cost_rate || 0;
              const roleRateCurrency = matchingRate.default_currency || invoiceCenterDefaultCurrency || "USD";
              if (roleRateCurrency.toUpperCase() !== currency.toUpperCase()) {
                baseCost = convertCurrency(baseCost, roleRateCurrency, currency);
                if (!Number.isFinite(baseCost)) {
                  newNoEmpCost = undefined;
                } else {
                  newNoEmpCost = parseFloat(baseCost.toFixed(2)).toString();
                }
              } else {
                newNoEmpCost = parseFloat(baseCost.toFixed(2)).toString();
              }
            } else if (selectedRoleData.role_rates?.[0]) {
              const fallbackCost = selectedRoleData.role_rates[0].internal_cost_rate ?? 0;
              newNoEmpCost = parseFloat(fallbackCost.toFixed(2)).toString();
            }
            if (newNoEmpCost !== undefined && newNoEmpCost !== work.cost) {
              work.cost = newNoEmpCost;
            }
          }
        }
        prevEmployeeIdRef.current = currentEmployeeId;
      } else if (selectedEmployeeData && !isLoadingEmployee && !isFetchingEmployee) {
        if (selectedEmployeeData.id === currentEmployeeId) {
          const employeeDeliveryCenterId = selectedEmployeeData.delivery_center
            ? deliveryCentersData?.items.find((dc) => dc.code === selectedEmployeeData.delivery_center)?.id
            : null;
          const centersMatch =
            opportunityDeliveryCenterId && employeeDeliveryCenterId
              ? String(opportunityDeliveryCenterId) === String(employeeDeliveryCenterId)
              : false;
          let employeeCost: number;
          let employeeRate: number = 0;
          const employeeCurrency = selectedEmployeeData.default_currency || "USD";
          const currenciesMatch = employeeCurrency.toUpperCase() === currency.toUpperCase();
          const hasRole = !!work.role_id;
          if (centersMatch) {
            employeeCost = selectedEmployeeData.internal_cost_rate || 0;
          } else {
            employeeCost = selectedEmployeeData.internal_bill_rate || 0;
          }
          if (!hasRole) {
            employeeRate = selectedEmployeeData.external_bill_rate || 0;
          }
          let canApplyEmployee = true;
          if (!currenciesMatch) {
            employeeCost = convertCurrency(employeeCost, employeeCurrency, currency);
            if (!Number.isFinite(employeeCost)) {
              canApplyEmployee = false;
            } else if (!hasRole) {
              employeeRate = convertCurrency(employeeRate, employeeCurrency, currency);
              if (!Number.isFinite(employeeRate)) {
                canApplyEmployee = false;
              }
            }
          }
          if (canApplyEmployee) {
            const newCostStr = parseFloat(employeeCost.toFixed(2)).toString();
            const newRateStr = !hasRole ? parseFloat(employeeRate.toFixed(2)).toString() : (work.rate || "0");
            if (work.cost !== newCostStr) {
              work.cost = newCostStr;
            }
            if (!hasRole && (work.rate || "") !== newRateStr) {
              work.rate = newRateStr;
            }
            lastPopulatedEmployeeRef.current = currentEmployeeId;
            prevEmployeeIdRef.current = currentEmployeeId;
          }
        }
      }
    }

    if ((work.rate || "") !== (formData.rate || "") || (work.cost || "") !== (formData.cost || "")) {
      setFormData((prev) => ({ ...prev, rate: work.rate, cost: work.cost }));
    }

    const merged: Partial<EngagementLineItemCreate> = {
      ...formData,
      rate: work.rate,
      cost: work.cost,
    };
    void tryFlushPersist(merged, "deriveUseEffect: after rate/cost work + end-of-effect flush");
  }, [
    formData,
    opportunityDeliveryCenterId,
    invoiceCenterDefaultCurrency,
    currency,
    selectedRoleData,
    roleRatesFingerprint,
    selectedEmployeeData,
    deliveryCentersData,
    isSaving,
    isLoadingRole,
    isFetchingRole,
    isLoadingEmployee,
    isFetchingEmployee,
    tryFlushPersist,
    lineItemId,
    createLineItem.isPending,
    updateLineItem.isPending,
  ]);

  const handleFieldBlur = useCallback(
    async (field: string, value: string) => {
      if (isSaving || createPendingRef.current || updatePendingRef.current || isCreatingRef.current) {
        return;
      }
      if (!lineItemId) {
        const merged = { ...formDataRef.current, [field]: value } as Partial<EngagementLineItemCreate>;
        void tryFlushPersist(merged, `handleFieldBlur: draft row, field=${field} (commit from blur, may create)`);
        return;
      }
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
          logResourcePlanServerCall("updateLineItem", `handleFieldBlur: partial PATCH field=${field}`, {
            engagementId,
            lineItemId,
            draftStableId: stableId,
            body: updateData,
          });
          await updateLineItem.mutateAsync({
            engagementId,
            lineItemId,
            data: updateData as EngagementLineItemUpdate,
          });
        }
      } catch (err) {
        console.error(`Failed to update ${field}:`, err);
      }
    },
    [isSaving, lineItemId, engagementId, updateLineItem, tryFlushPersist, stableId]
  );

  if (isRenderedAsLineItemRow) {
    return null;
  }

  // Shared `createLineItem` makes `isPending` true for the whole table — only this row is busy
  // for create when *this* instance holds isCreatingRef (or isSaving) while the mutation runs.
  const rowIsBusy =
    isSaving ||
    (isCreatingRef.current && createLineItem.isPending) ||
    (!!lineItemId && updateLineItem.isPending);

  return (
    <tr className={rowIsBusy ? "bg-yellow-50" : "bg-white hover:bg-gray-50"}>
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
          {rolesSorted?.map((role) => (
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
          {employeesSorted?.map((emp) => (
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
                    logResourcePlanServerCall("deleteLineItem", "emptyRow: user confirmed delete from draft row actions", {
                      engagementId,
                      lineItemId,
                      draftStableId: stableId,
                    });
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

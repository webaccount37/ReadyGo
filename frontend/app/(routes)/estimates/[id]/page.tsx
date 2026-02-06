"use client";

import { useParams } from "next/navigation";
import { useEstimateDetail, useCloneEstimate, useCreateEstimate, useDeleteEstimate } from "@/hooks/useEstimates";
import { useOpportunity, useUpdateOpportunity } from "@/hooks/useOpportunities";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useRouter } from "next/navigation";
import { EstimateSpreadsheet } from "@/components/estimates/estimate-spreadsheet";
import { PhaseManagement } from "@/components/estimates/phase-management";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import Link from "next/link";
import { useState, useEffect, useMemo, useRef } from "react";
import { Lock, AlertTriangle, AlertCircle, Calendar } from "lucide-react";
import { CURRENCIES } from "@/types/currency";
import { useQueryClient } from "@tanstack/react-query";
import type { EstimateDetailResponse } from "@/types/estimate";
import { GanttViewDialog } from "@/components/estimates/gantt-view-dialog";

// Helper function to clear stale cache entries
function clearStaleCacheEntries(queryClient: ReturnType<typeof useQueryClient>, estimateId: string, actualLineItemIds: Set<string>) {
  const cacheData = queryClient.getQueryData<EstimateDetailResponse>(["estimates", "detail", estimateId, true]);
  if (cacheData && cacheData.line_items) {
    // Filter out any line items that don't exist in the actual database response
    const validLineItems = cacheData.line_items.filter(item => actualLineItemIds.has(item.id));
    if (validLineItems.length !== cacheData.line_items.length) {
      console.log(`Clearing ${cacheData.line_items.length - validLineItems.length} stale line items from cache`);
      queryClient.setQueryData<EstimateDetailResponse>(
        ["estimates", "detail", estimateId, true],
        {
          ...cacheData,
          line_items: validLineItems,
        }
      );
    }
  }
}

export default function EstimateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const estimateId = params.id as string;
  const queryClient = useQueryClient();
  
  // Force refetch on mount to ensure we have fresh data from database
  const { data: estimate, isLoading, error } = useEstimateDetail(estimateId, {
    refetchOnMount: "always", // Always refetch to ensure fresh data
    refetchOnWindowFocus: false,
    staleTime: 0, // Never consider data stale - always refetch
  });
  
  // CRITICAL: Sync cache with database and clear stale data
  useEffect(() => {
    if (estimate && queryClient && typeof window !== "undefined") {
      // Create set of actual line item IDs from database response
      const actualLineItemIds = new Set(estimate.line_items?.map(item => item.id) || []);
      
      // Clear stale cache entries
      clearStaleCacheEntries(queryClient, estimateId, actualLineItemIds);
      
      // Get all localStorage keys for this estimate
      const keysToCheck: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes(`-${estimateId}-`) || key.includes(`-${estimate.id}-`))) {
          keysToCheck.push(key);
        }
      }
      
      // Check each key and remove if it references a line item that doesn't exist
      keysToCheck.forEach(key => {
        if (key.includes('line-item-id-')) {
          const lineItemId = localStorage.getItem(key);
          if (lineItemId && !actualLineItemIds.has(lineItemId)) {
            console.log("Removing stale localStorage key:", key, "for non-existent lineItemId:", lineItemId);
            localStorage.removeItem(key);
            // Also remove associated empty-row data
            const emptyRowKey = key.replace('line-item-id-', 'empty-row-');
            localStorage.removeItem(emptyRowKey);
          }
        }
      });
    }
  }, [estimate?.id, estimateId, queryClient]); // Only run when estimate ID changes
  
  const cloneEstimate = useCloneEstimate();
  const createEstimate = useCreateEstimate();
  const deleteEstimate = useDeleteEstimate();
  const [isCloning, setIsCloning] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isGanttDialogOpen, setIsGanttDialogOpen] = useState(false);
  
  // Fetch opportunity data for start/end dates and delivery center
  const { data: opportunity, refetch: refetchOpportunity } = useOpportunity(estimate?.opportunity_id || "", false);
  const updateOpportunity = useUpdateOpportunity();
  
  // Fetch delivery centers to get names for display
  const { data: deliveryCentersData } = useDeliveryCenters();
  
  // Helper function to get delivery center name from ID
  const getDeliveryCenterName = (dcId: string | undefined): string => {
    if (!dcId || !deliveryCentersData?.items) return dcId || "—";
    const dc = deliveryCentersData.items.find(d => d.id === dcId);
    return dc?.name || dcId;
  };
  
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [invoiceCurrency, setInvoiceCurrency] = useState<string>("");
  const [invoiceCustomer, setInvoiceCustomer] = useState<boolean>(true);
  const [billableExpenses, setBillableExpenses] = useState<boolean>(true);
  
  // Track original Invoice Center and Currency to detect changes
  const [originalInvoiceCenterId, setOriginalInvoiceCenterId] = useState<string | undefined>(undefined);
  const [originalInvoiceCurrency, setOriginalInvoiceCurrency] = useState<string | undefined>(undefined);
  
  // Initialize dates and currency from opportunity
  useEffect(() => {
    if (opportunity) {
      // Ensure dates are in YYYY-MM-DD format for date inputs
      const formatDateForInput = (dateStr: string | undefined): string => {
        if (!dateStr) return "";
        // If already in YYYY-MM-DD format, return as-is
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
        // If includes time (ISO format), extract date part
        if (dateStr.includes('T')) return dateStr.split('T')[0];
        // Try to parse and format
        try {
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          }
        } catch {
          // If parsing fails, return as-is
        }
        return dateStr;
      };
      
      setStartDate(formatDateForInput(opportunity.start_date) || "");
      setEndDate(formatDateForInput(opportunity.end_date) || "");
      setInvoiceCurrency(opportunity.default_currency || "USD");
      setInvoiceCustomer(opportunity.invoice_customer !== undefined ? opportunity.invoice_customer : true);
      setBillableExpenses(opportunity.billable_expenses !== undefined ? opportunity.billable_expenses : true);
    }
  }, [opportunity]);
  
  // Store original Invoice Center and Currency when estimate loads (reset when estimate changes)
  useEffect(() => {
    if (opportunity && estimate) {
      setOriginalInvoiceCenterId(opportunity.delivery_center_id);
      setOriginalInvoiceCurrency(opportunity.default_currency || "USD");
    }
  }, [estimate?.id, opportunity?.id]); // Reset when estimate or opportunity ID changes
  
  // Check if opportunity is locked
  const isOpportunityLocked = useMemo(() => {
    return opportunity?.is_locked || false;
  }, [opportunity?.is_locked]);

  // Detect Invoice Center/Currency changes for active estimates
  const hasInvoiceCenterOrCurrencyChange = useMemo(() => {
    if (!opportunity || !estimate || estimate.is_locked || isOpportunityLocked) return false;
    if (!originalInvoiceCenterId || !originalInvoiceCurrency) return false;
    
    const centerChanged = opportunity.delivery_center_id !== originalInvoiceCenterId;
    const currencyChanged = (opportunity.default_currency || "USD") !== originalInvoiceCurrency;
    
    return centerChanged || currencyChanged;
  }, [opportunity, estimate, originalInvoiceCenterId, originalInvoiceCurrency, isOpportunityLocked]);

  // Check for date mismatches
  const hasDateMismatch = useMemo(() => {
    if (!estimate?.line_items || !startDate || !endDate) return false;
    const oppStart = new Date(startDate);
    const oppEnd = new Date(endDate);
    return estimate.line_items.some(item => {
      const itemStart = new Date(item.start_date);
      const itemEnd = new Date(item.end_date);
      return itemStart < oppStart || itemEnd > oppEnd;
    });
  }, [estimate?.line_items, startDate, endDate]);

  // Auto-save opportunity fields when they change (skip if opportunity is locked)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!opportunity || !estimate || isOpportunityLocked) return;
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(async () => {
      const updates: Record<string, unknown> = {};
      let hasChanges = false;

      // Only update start_date if it's a valid non-empty string and different from current
      if (startDate && startDate.trim() !== "" && startDate !== opportunity.start_date) {
        updates.start_date = startDate;
        hasChanges = true;
      }
      // CRITICAL: end_date is required (NOT NULL constraint), so only update if we have a valid value
      // Don't include it in updates if it's empty or null to avoid violating the constraint
      // Also check that opportunity.end_date exists - if it's null in DB, we can't update to empty
      if (endDate && 
          endDate.trim() !== "" && 
          opportunity.end_date && // Ensure opportunity has an end_date before comparing
          endDate !== opportunity.end_date) {
        updates.end_date = endDate;
        hasChanges = true;
      }
      // If endDate is empty or opportunity.end_date is null, don't include end_date in updates
      // This preserves the existing value and avoids NOT NULL constraint violations
      if (invoiceCurrency && invoiceCurrency !== opportunity.default_currency) {
        updates.default_currency = invoiceCurrency;
        hasChanges = true;
      }
      if (invoiceCustomer !== opportunity.invoice_customer) {
        updates.invoice_customer = invoiceCustomer;
        hasChanges = true;
      }
      if (billableExpenses !== opportunity.billable_expenses) {
        updates.billable_expenses = billableExpenses;
        hasChanges = true;
      }

      if (hasChanges) {
        try {
          await updateOpportunity.mutateAsync({
            id: opportunity.id,
            data: updates,
          });
          await refetchOpportunity();
        } catch (err) {
          console.error("Failed to update opportunity:", err);
        }
      }
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [startDate, endDate, invoiceCurrency, invoiceCustomer, billableExpenses, opportunity, estimate, updateOpportunity, refetchOpportunity, isOpportunityLocked]);

  const handleDuplicate = async () => {
    setIsCloning(true);
    try {
      const cloned = await cloneEstimate.mutateAsync({
        estimateId,
        newName: "", // Will be auto-generated by backend
      });
      // Redirect to the new estimate
      router.push(`/estimates/${cloned.id}`);
    } catch (err) {
      console.error("Failed to duplicate estimate:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsCloning(false);
    }
  };

  const handleNew = async () => {
    if (!estimate) return;
    
    setIsCreating(true);
    try {
      const newEstimate = await createEstimate.mutateAsync({
        opportunity_id: estimate.opportunity_id,
        name: "", // Empty name will trigger backend to auto-generate version name
        copy_line_items: false, // Don't copy line items - create empty estimate
      });
      // Invalidate all estimates to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      queryClient.removeQueries({ queryKey: ["estimates", "detail", newEstimate.id] });
      // Redirect to the new estimate and force a fresh fetch
      router.push(`/estimates/${newEstimate.id}`);
      // Force a page reload to ensure we get fresh empty data
      window.location.href = `/estimates/${newEstimate.id}`;
    } catch (err) {
      console.error("Failed to create estimate:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      setIsCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!estimate) return;
    
    if (!confirm(`Are you sure you want to delete estimate "${estimate.name}"?`)) {
      return;
    }
    
    try {
      await deleteEstimate.mutateAsync(estimate.id);
      // Redirect to estimates list
      router.push("/estimates");
    } catch (err) {
      console.error("Failed to delete estimate:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Dates are read-only on estimate page - they come from the opportunity
  // To change dates, edit the opportunity directly

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p>Loading estimate...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !estimate) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-red-600">
              {error
                ? `Error loading estimate: ${error instanceof Error ? error.message : String(error)}`
                : "Estimate not found"}
            </p>
            <Link href="/estimates">
              <Button className="mt-4">Back to Estimates</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden min-w-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <Link href="/estimates" className="text-blue-600 hover:underline mb-2 inline-block">
            ← Back to Estimates
          </Link>
          <h1 className="text-3xl font-bold">{estimate.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Opportunity: {estimate.opportunity_name || estimate.opportunity_id}
          </p>
        </div>
        <div className="flex gap-2">
          {estimate.active_version ? (
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded text-sm font-semibold flex items-center">
              ACTIVE VERSION
            </span>
          ) : (
            <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded text-sm font-semibold flex items-center">
              PENDING VERSION
            </span>
          )}
          {estimate.is_locked && (
            <span className="flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-800 rounded text-sm font-semibold">
              <Lock className="w-4 h-4" />
              LOCKED
            </span>
          )}
          {estimate.is_locked && estimate.locked_by_quote_id && (
            <Link href={`/quotes/${estimate.locked_by_quote_id}`}>
              <Button variant="outline" size="sm">
                View Quote
              </Button>
            </Link>
          )}
          <Button onClick={handleNew} variant="outline" disabled={isCreating} title="">
            {isCreating ? "Creating..." : "NEW"}
          </Button>
          <Button onClick={handleDuplicate} variant="outline" disabled={isCloning} title="">
            {isCloning ? "Duplicating..." : "DUPLICATE"}
          </Button>
          <Button 
            onClick={() => setIsGanttDialogOpen(true)} 
            variant="default"
            size="sm"
            className="flex items-center gap-2"
            title="View Timeline"
          >
            <Calendar className="w-4 h-4" />
            View Timeline
          </Button>
          {!estimate.active_version && (
            <Button 
              onClick={handleDelete} 
              variant="outline" 
              disabled={deleteEstimate.isPending || estimate.is_locked}
              title={estimate.is_locked ? "Active estimate is locked by active quote" : ""}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              {deleteEstimate.isPending ? "Deleting..." : "DELETE"}
            </Button>
          )}
        </div>
      </div>

      <Card className={`mb-6 ${isOpportunityLocked ? 'border-yellow-200 bg-yellow-50' : ''}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isOpportunityLocked && <Lock className="w-5 h-5 text-yellow-800" />}
            Estimate Details
            {isOpportunityLocked && (
              <span className="text-sm font-normal text-yellow-800 ml-2">
                (Locked by active quote - {opportunity?.locked_by_quote_id && (
                  <Link href={`/quotes/${opportunity.locked_by_quote_id}`} className="underline">View quote</Link>
                )} to unlock)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {opportunity?.delivery_center_id && (
              <div className="flex items-center">
                <span className="font-semibold mr-2">Invoice Center:</span>
                <span>{getDeliveryCenterName(opportunity.delivery_center_id)}</span>
              </div>
            )}
            <div>
              <Label htmlFor="invoice_currency">Invoice Currency</Label>
              <Select
                id="invoice_currency"
                value={invoiceCurrency}
                onChange={(e) => setInvoiceCurrency(e.target.value)}
                disabled={estimate.is_locked || isOpportunityLocked}
                className="mt-1"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={estimate.is_locked || isOpportunityLocked}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="end_date">End Date</Label>
              <Input
                id="end_date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={estimate.is_locked || isOpportunityLocked}
                className="mt-1"
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="invoice_customer"
                checked={invoiceCustomer}
                onChange={(e) => setInvoiceCustomer(e.target.checked)}
                disabled={estimate.is_locked || isOpportunityLocked}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <Label htmlFor="invoice_customer" className="cursor-pointer">
                Invoice Customer?
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="billable_expenses"
                checked={billableExpenses}
                onChange={(e) => setBillableExpenses(e.target.checked)}
                disabled={estimate.is_locked || isOpportunityLocked}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <Label htmlFor="billable_expenses" className="cursor-pointer">
                Billable Expenses?
              </Label>
            </div>
            {estimate.description && (
              <div className="col-span-2">
                <span className="font-semibold">Description:</span> {estimate.description}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Warning for date mismatches */}
      {hasInvoiceCenterOrCurrencyChange && (
        <Card className="mb-6 border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-orange-800">
              <AlertCircle className="w-5 h-5" />
              <div>
                <p className="font-semibold">Invoice Center or Currency Changed</p>
                <p className="text-sm">
                  The Opportunity&apos;s Invoice Center or Invoice Currency has been updated. 
                  Estimate line items may need currency conversion updates. 
                  Please review all Cost and Rate values to ensure they reflect the new currency.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {hasDateMismatch && (
        <Card className="mb-6 border-yellow-200 bg-yellow-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-yellow-800">
              <AlertTriangle className="w-5 h-5" />
              <div>
                <p className="font-semibold">Date Range Warning</p>
                <p className="text-sm">
                  Some estimate rows have start or end dates that are outside the Opportunity date range.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <PhaseManagement estimateId={estimate.id} readOnly={estimate.is_locked || false} />

      <EstimateSpreadsheet 
        estimate={estimate} 
        startDate={startDate} 
        endDate={endDate}
        opportunityDeliveryCenterId={opportunity?.delivery_center_id}
        opportunityCurrency={invoiceCurrency}
        invoiceCustomer={invoiceCustomer}
        billableExpenses={billableExpenses}
        readOnly={estimate.is_locked || false}
      />
      
      <GanttViewDialog
        open={isGanttDialogOpen}
        onOpenChange={setIsGanttDialogOpen}
        estimateIds={[estimateId]}
      />
    </div>
  );
}


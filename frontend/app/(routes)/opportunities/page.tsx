"use client";

import { useState, useMemo, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  useOpportunities,
} from "@/hooks/useOpportunities";
import { useOpportunityActions } from "@/hooks/useOpportunityActions";
import { Button } from "@/components/ui/button";
import { Trash2, Calculator, FileCheck, Lock, Briefcase, Pencil, FolderOpen } from "lucide-react";
import { lucideManilaFolderOpen } from "@/lib/manilaFolder";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { highlightText } from "@/lib/utils/highlight";
import { cn } from "@/lib/utils";
import { useAccounts } from "@/hooks/useAccounts";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import {
  formatCurrency,
  getForecastDisplayValue,
  getAccountName,
  getDeliveryCenterName,
  getParentOpportunityName,
  formatOpportunityDateListLong,
  formatOpportunityDateListShort,
} from "@/lib/opportunity-utils";
import Link from "next/link";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { SortableTh, type SortState } from "@/components/ui/sortable-th";

function OpportunitiesPageContent() {
  const searchParams = useSearchParams();
  const accountIdParam = searchParams.get("account_id");
  const [skip, setSkip] = useState(0);
  const [limit] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<SortState>({ column: "name", direction: "asc" });
  const debouncedSearch = useDebouncedValue(searchQuery, 350);

  const router = useRouter();

  // Initialize search query from URL parameter
  useEffect(() => {
    const searchParam = searchParams.get("search");
    if (searchParam) {
      setSearchQuery(searchParam);
    }
  }, [searchParams]);

  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch, sort.column, sort.direction, accountIdParam]);

  const handleSort = (column: string) => {
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" }
    );
  };

  // Redirect ?opportunity_id= to the opportunity detail page
  useEffect(() => {
    const opportunityIdParam = searchParams.get("opportunity_id");
    if (opportunityIdParam) {
      router.replace(`/opportunities/${opportunityIdParam}`);
    }
  }, [searchParams, router]);

  const { data, isLoading, error, refetch } = useOpportunities({
    skip,
    limit,
    account_id: accountIdParam || undefined,
    search: debouncedSearch.trim() || undefined,
    sort_by: sort.column || undefined,
    sort_order: sort.direction,
  });
  const {
    getActiveEstimateId,
    getActiveQuoteId,
    hasQuotes,
    hasActiveQuote,
    handleEstimatesClick,
    handleQuotesClick,
    handleDelete,
  } = useOpportunityActions();

  // Fetch related data for display names
  const { data: accountsData } = useAccounts({ skip: 0, limit: 1000 });

  /** Prefer API account_name; client account list is capped and would show raw UUIDs for missing rows. */
  const accountLabel = useCallback(
    (opportunity: { account_name?: string | null; account_id?: string }) =>
      opportunity.account_name?.trim() || getAccountName(accountsData, opportunity.account_id),
    [accountsData]
  );
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: allOpportunitiesData } = useOpportunities({ limit: 100 });

  const rows = data?.items ?? [];

  // Helper functions for formatting display values
  const formatEnumValue = (value: string | undefined): string => {
    if (!value) return "—";
    return value
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const formatStatus = (status: string | undefined): string => {
    if (!status) return "—";
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Opportunities</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Manage your opportunities and their details
          </p>
        </div>
        <Button onClick={() => router.push("/opportunities/create")} className="w-full sm:w-auto">+ Add Opportunity</Button>
      </div>

      {isLoading && <div className="text-gray-600">Loading opportunities...</div>}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">
              Error: {error instanceof Error ? error.message : String(error)}
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && (
        <>
          <Card>
            <CardHeader className="px-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CardTitle>Opportunities ({data?.total ?? 0})</CardTitle>
                <div className="w-full sm:w-64">
                  <Input
                    type="text"
                    placeholder="Search opportunities..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-2">
              {rows.length > 0 ? (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block w-full overflow-hidden">
                      <table className="w-full text-xs table-fixed border-collapse">
                        <colgroup>
                          <col style={{ width: "14%" }} />
                          <col style={{ width: "9%" }} />
                          <col style={{ width: "10%" }} />
                          <col style={{ width: "4%" }} />
                          <col style={{ width: "7%" }} />
                          <col style={{ width: "7%" }} />
                          <col style={{ width: "8%" }} />
                          <col style={{ width: "6%" }} />
                          <col style={{ width: "8%" }} />
                          <col style={{ width: "8%" }} />
                          <col style={{ width: "6%" }} />
                          <col style={{ width: "11%" }} />
                        </colgroup>
                        <thead>
                          <tr className="border-b">
                            <SortableTh label="Name" column="name" sort={sort} onSort={handleSort} title="Opportunity Name" />
                            <SortableTh label="Account" column="account" sort={sort} onSort={handleSort} title="Account" />
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Parent Opportunity Name">Parent</th>
                            <SortableTh label="Status" column="status" sort={sort} onSort={handleSort} title="Status" />
                            <SortableTh label="Start" column="start_date" sort={sort} onSort={handleSort} title="Start Date" />
                            <SortableTh label="End" column="end_date" sort={sort} onSort={handleSort} title="End Date" />
                            <SortableTh label="IC" column="delivery_center" sort={sort} onSort={handleSort} title="Invoice Center" />
                            <SortableTh label="Deal $" column="deal_value_usd" sort={sort} onSort={handleSort} title="Deal Value (USD)" />
                            <SortableTh label="Forecast $" column="forecast_value_usd" sort={sort} onSort={handleSort} title="Forecast Value (USD)" />
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Plan Revenue (USD)">Plan $</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Actuals from Approved Timesheets (USD)">Actuals $</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Actions">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                        {rows.map((opportunity) => (
                          <tr 
                            key={opportunity.id} 
                            className="border-b hover:bg-gray-50 cursor-pointer"
                            onClick={() => router.push(`/opportunities/${opportunity.id}`)}
                          >
                            <td className="p-1.5 font-medium text-xs overflow-hidden" title={opportunity.name}>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="truncate">{highlightText(opportunity.name, searchQuery)}</span>
                                {(opportunity.is_permanently_locked || hasActiveQuote(opportunity.id)) && (
                                  <span
                                    className={cn(
                                      "inline-flex items-center justify-center w-5 h-5 rounded shrink-0",
                                      opportunity.is_permanently_locked
                                        ? "bg-violet-100 text-violet-700 border border-violet-200"
                                        : "bg-yellow-100 text-yellow-700 border border-yellow-200"
                                    )}
                                    title={opportunity.is_permanently_locked
                                      ? "Permanently Locked by Active Timesheets"
                                      : "Locked by Active Quote"}
                                  >
                                    <Lock className="w-3 h-3 shrink-0" />
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-1.5 truncate text-xs overflow-hidden" title={accountLabel(opportunity)}>
                              <Link
                                href={`/accounts?search=${encodeURIComponent(accountLabel(opportunity))}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                {highlightText(accountLabel(opportunity), searchQuery)}
                              </Link>
                            </td>
                            <td className="p-1.5 truncate text-xs overflow-hidden" title={getParentOpportunityName(allOpportunitiesData, opportunity.parent_opportunity_id)}>
                              {opportunity.parent_opportunity_id ? (
                                <Link
                                  href={`/opportunities/${opportunity.parent_opportunity_id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  {getParentOpportunityName(allOpportunitiesData, opportunity.parent_opportunity_id)}
                                </Link>
                              ) : (
                                "None"
                              )}
                            </td>
                            <td className="p-1.5 overflow-hidden min-w-0">
                              <span
                                className={cn(
                                  "inline-block w-3 h-3 rounded-sm shrink-0",
                                  opportunity.status === "won"
                                    ? "bg-green-500"
                                    : opportunity.status === "lost"
                                    ? "bg-red-500"
                                    : opportunity.status === "cancelled"
                                    ? "bg-gray-500"
                                    : opportunity.status === "negotiation"
                                    ? "bg-orange-500"
                                    : opportunity.status === "proposal"
                                    ? "bg-yellow-500"
                                    : opportunity.status === "qualified"
                                    ? "bg-cyan-500"
                                    : opportunity.status === "discovery"
                                    ? "bg-blue-500"
                                    : "bg-slate-400"
                                )}
                                title={
                                  opportunity.status
                                    ? opportunity.status.charAt(0).toUpperCase() + opportunity.status.slice(1)
                                    : "—"
                                }
                              />
                            </td>
                            <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden min-w-0" title={formatOpportunityDateListLong(opportunity.start_date)}>
                              {opportunity.start_date
                                ? formatOpportunityDateListShort(opportunity.start_date)
                                : "—"}
                            </td>
                            <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden" title={formatOpportunityDateListLong(opportunity.end_date)}>
                              {opportunity.end_date
                                ? formatOpportunityDateListShort(opportunity.end_date)
                                : "—"}
                            </td>
                            <td className="p-1.5 truncate text-xs overflow-hidden" title={getDeliveryCenterName(deliveryCentersData, opportunity.delivery_center_id) || "—"}>
                              <Link
                                href={`/delivery-centers?search=${encodeURIComponent(getDeliveryCenterName(deliveryCentersData, opportunity.delivery_center_id))}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                {getDeliveryCenterName(deliveryCentersData, opportunity.delivery_center_id)}
                              </Link>
                            </td>
                            <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden min-w-0" title={opportunity.deal_value_usd ? formatCurrency(opportunity.deal_value_usd, "USD") : "—"}>
                              {opportunity.deal_value_usd
                                ? formatCurrency(opportunity.deal_value_usd, "USD")
                                : "—"}
                            </td>
                            <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden min-w-0" title={getForecastDisplayValue(opportunity) ? formatCurrency(getForecastDisplayValue(opportunity), "USD") : "—"}>
                              {getForecastDisplayValue(opportunity)
                                ? formatCurrency(getForecastDisplayValue(opportunity), "USD")
                                : "—"}
                            </td>
                            <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden min-w-0" title={opportunity.plan_amount ? formatCurrency(opportunity.plan_amount, "USD") : "—"}>
                              {opportunity.plan_amount != null && opportunity.plan_amount !== undefined && opportunity.plan_amount !== ""
                                ? formatCurrency(opportunity.plan_amount, "USD")
                                : "—"}
                            </td>
                            <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden text-ellipsis min-w-0" title={opportunity.actuals_amount != null ? formatCurrency(opportunity.actuals_amount, "USD") : "—"}>
                              {opportunity.actuals_amount != null && opportunity.actuals_amount !== undefined && String(opportunity.actuals_amount) !== "0"
                                ? formatCurrency(opportunity.actuals_amount, "USD")
                                : "—"}
                            </td>
                            <td className="p-1 overflow-hidden min-w-0">
                              <div className="flex flex-nowrap gap-0.5 justify-start" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => router.push(`/opportunities/${opportunity.id}`)}
                                  className="h-5 w-5 p-0 shrink-0"
                                  title="Edit"
                                >
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/opportunities/${opportunity.id}?tab=documents`);
                                  }}
                                  className="h-5 w-5 p-0 shrink-0"
                                  title="Documents (SharePoint)"
                                >
                                  <FolderOpen className="w-3 h-3" {...lucideManilaFolderOpen} />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => handleEstimatesClick(opportunity.id, e)}
                                  className="h-5 w-5 p-0 shrink-0 text-blue-600 hover:text-blue-700"
                                  title={getActiveEstimateId(opportunity.id) ? "View Active Estimate" : "View Estimates"}
                                >
                                  <Calculator className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => handleQuotesClick(opportunity.id, e)}
                                  className="h-5 w-5 p-0 shrink-0 text-green-600 hover:text-green-700"
                                  title={getActiveQuoteId(opportunity.id) ? "View Active Quote" : hasQuotes(opportunity.id) ? "View Quotes" : "Create Quote"}
                                >
                                  <FileCheck className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (opportunity.engagement_id) {
                                      router.push(`/engagements?opportunity_id=${opportunity.id}`);
                                    }
                                  }}
                                  className={cn(
                                    "h-5 w-5 p-0 shrink-0",
                                    opportunity.engagement_id
                                      ? "text-purple-600 hover:text-purple-700"
                                      : "text-gray-400 cursor-not-allowed"
                                  )}
                                  title={opportunity.engagement_id ? "View Engagement" : "No Engagement"}
                                  disabled={!opportunity.engagement_id}
                                >
                                  <Briefcase className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDelete(opportunity.id, opportunity, refetch)}
                                  disabled={opportunity.is_permanently_locked || opportunity.is_locked}
                                  className={cn(
                                    "h-5 w-5 p-0 shrink-0",
                                    opportunity.is_permanently_locked || opportunity.is_locked
                                      ? "text-gray-400 border-gray-200 cursor-not-allowed hover:bg-white hover:text-gray-400 disabled:opacity-100 disabled:pointer-events-auto"
                                      : "text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                                  )}
                                  title={opportunity.is_permanently_locked || opportunity.is_locked ? "Cannot delete locked or permanently locked opportunity" : "Delete"}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-4">
                      {rows.map((opportunity) => (
                        <Card 
                          key={opportunity.id}
                          className="cursor-pointer"
                          onClick={() => router.push(`/opportunities/${opportunity.id}`)}
                        >
                          <CardContent className="pt-6">
                            <div className="space-y-3">
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Name
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-medium">{highlightText(opportunity.name, searchQuery)}</div>
                                  {(opportunity.is_permanently_locked || hasActiveQuote(opportunity.id)) && (
                                    <span
                                      className={cn(
                                        "inline-flex items-center justify-center w-5 h-5 rounded shrink-0",
                                        opportunity.is_permanently_locked
                                          ? "bg-violet-100 text-violet-700 border border-violet-200"
                                          : "bg-yellow-100 text-yellow-700 border border-yellow-200"
                                      )}
                                      title={opportunity.is_permanently_locked
                                        ? "Permanently Locked by Active Timesheets"
                                        : "Locked by Active Quote"}
                                    >
                                      <Lock className="w-3 h-3 shrink-0" />
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Account
                                </div>
                                <div className="text-sm">{highlightText(accountLabel(opportunity), searchQuery)}</div>
                              </div>
                            <div className="flex gap-2">
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Status
                                </div>
                                <span
                                  className={`px-2 py-1 text-xs rounded ${
                                    opportunity.status === "won"
                                      ? "bg-green-100 text-green-800"
                                      : opportunity.status === "lost"
                                      ? "bg-red-100 text-red-800"
                                      : opportunity.status === "cancelled"
                                      ? "bg-gray-100 text-gray-800"
                                      : opportunity.status === "negotiation"
                                      ? "bg-orange-100 text-orange-800"
                                      : opportunity.status === "proposal"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : opportunity.status === "qualified"
                                      ? "bg-cyan-100 text-cyan-800"
                                      : opportunity.status === "discovery"
                                      ? "bg-blue-100 text-blue-800"
                                      : "bg-slate-100 text-slate-800"
                                  }`}
                                >
                                  {highlightText(
                                    opportunity.status
                                      ? opportunity.status.charAt(0).toUpperCase() + opportunity.status.slice(1)
                                      : "—",
                                    searchQuery
                                  )}
                                </span>
                              </div>
                            </div>
                            {opportunity.start_date && (
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Start Date
                                </div>
                                <div className="text-sm">
                                  {formatOpportunityDateListShort(opportunity.start_date)}
                                </div>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Deal $</div>
                                <div className="text-sm">
                                  {opportunity.deal_value_usd
                                    ? formatCurrency(opportunity.deal_value_usd, "USD")
                                    : "—"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Forecast $</div>
                                <div className="text-sm">
                                  {getForecastDisplayValue(opportunity)
                                    ? formatCurrency(getForecastDisplayValue(opportunity), "USD")
                                    : "—"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Plan $</div>
                                <div className="text-sm">
                                  {opportunity.plan_amount != null && opportunity.plan_amount !== undefined && opportunity.plan_amount !== ""
                                    ? formatCurrency(opportunity.plan_amount, "USD")
                                    : "—"}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Actuals $</div>
                                <div className="text-sm">
                                  {opportunity.actuals_amount != null && opportunity.actuals_amount !== undefined && String(opportunity.actuals_amount) !== "0"
                                    ? formatCurrency(opportunity.actuals_amount, "USD")
                                    : "—"}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.push(`/opportunities/${opportunity.id}`)}
                                className="flex-1"
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/opportunities/${opportunity.id}?tab=documents`);
                                }}
                                className="shrink-0"
                                title="Documents (SharePoint)"
                              >
                                <FolderOpen className="w-4 h-4" {...lucideManilaFolderOpen} />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => handleEstimatesClick(opportunity.id, e)}
                                className="flex-1 text-blue-600 hover:text-blue-700"
                                title={getActiveEstimateId(opportunity.id) ? "View Active Estimate" : "View Estimates"}
                              >
                                <Calculator className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => handleQuotesClick(opportunity.id, e)}
                                className="flex-1 text-green-600 hover:text-green-700"
                                title={getActiveQuoteId(opportunity.id) ? "View Active Quote" : hasQuotes(opportunity.id) ? "View Quotes" : "Create Quote"}
                              >
                                <FileCheck className="w-4 h-4" />
                              </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (opportunity.engagement_id) {
                                      router.push(`/engagements?opportunity_id=${opportunity.id}`);
                                    }
                                  }}
                                className={cn(
                                  "flex-1",
                                  opportunity.engagement_id
                                    ? "text-purple-600 hover:text-purple-700"
                                    : "text-gray-400 cursor-not-allowed"
                                )}
                                title={opportunity.engagement_id ? "View Engagement" : "No Engagement"}
                                disabled={!opportunity.engagement_id}
                              >
                                <Briefcase className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDelete(opportunity.id, opportunity, refetch)}
                                disabled={opportunity.is_permanently_locked || opportunity.is_locked}
                                className={cn(
                                  "flex-1",
                                  opportunity.is_permanently_locked || opportunity.is_locked
                                    ? "text-gray-400 border-gray-200 cursor-not-allowed hover:bg-white hover:text-gray-400 disabled:opacity-100 disabled:pointer-events-auto"
                                    : "text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                                )}
                                title={opportunity.is_permanently_locked || opportunity.is_locked ? "Cannot delete locked or permanently locked opportunity" : "Delete"}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <p>
                      {debouncedSearch.trim()
                        ? `No opportunities found matching "${debouncedSearch}"`
                        : "No opportunities found."}
                    </p>
                    {!debouncedSearch.trim() && (
                      <Button
                        className="mt-4"
                        onClick={() => router.push("/opportunities/create")}
                      >
                        Create First Opportunity
                      </Button>
                    )}
                  </div>
                )}
            </CardContent>
          </Card>

          {data && data.total > limit && (
            <div className="flex justify-center items-center gap-4 mt-4">
              <Button
                variant="outline"
                onClick={() => setSkip(Math.max(0, skip - limit))}
                disabled={skip === 0}
              >
                Previous
              </Button>
              <span className="text-sm text-gray-600">
                Page {Math.floor(skip / limit) + 1} of{" "}
                {Math.ceil(data.total / limit)}
              </span>
              <Button
                variant="outline"
                onClick={() => setSkip(skip + limit)}
                disabled={skip + limit >= data.total}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function OpportunitiesPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <OpportunitiesPageContent />
    </Suspense>
  );
}

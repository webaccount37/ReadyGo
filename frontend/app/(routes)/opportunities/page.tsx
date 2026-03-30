"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
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
import { useBillingTerms } from "@/hooks/useBillingTerms";
import { useEmployees } from "@/hooks/useEmployees";
import { opportunitiesApi } from "@/lib/api/opportunities";
import {
  formatCurrency,
  getForecastDisplayValue,
  getAccountName,
  getDeliveryCenterName,
  getBillingTermName,
  getEmployeeName,
  getParentOpportunityName,
} from "@/lib/opportunity-utils";
import Link from "next/link";

function OpportunitiesPageContent() {
  const searchParams = useSearchParams();
  const accountIdParam = searchParams.get("account_id");
  const [skip, setSkip] = useState(0);
  const [limit] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");

  const router = useRouter();

  // Initialize search query from URL parameter
  useEffect(() => {
    const searchParam = searchParams.get("search");
    if (searchParam) {
      setSearchQuery(searchParam);
    }
  }, [searchParams]);

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
    account_id: accountIdParam || undefined
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
  const { data: accountsData } = useAccounts({ limit: 100 });
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: billingTermsData } = useBillingTerms();
  const { data: employeesData } = useEmployees({ limit: 1000 });
  const { data: allOpportunitiesData } = useOpportunities({ limit: 100 });
  
  // Fetch opportunities with relationships for accurate counts (only for current page)
  const opportunityIdsForCounts = useMemo(() => (data?.items || []).map(opp => opp.id), [data]);
  const opportunityCountsQueries = useQueries({
    queries: opportunityIdsForCounts.map(id => ({
      queryKey: ["opportunities", "detail", id, true],
      queryFn: () => opportunitiesApi.getOpportunity(id, true),
      enabled: !!id,
      staleTime: 30000,
    })),
  });

  // Calculate employee counts per opportunity
  const employeeCounts = useMemo(() => {
    const counts: Record<string, Set<string>> = {};
    
    // Use opportunity data with relationships if available (most accurate)
    opportunityCountsQueries.forEach((query) => {
      if (query.data?.employees) {
        const oppId = query.data.id;
        const employeeIds = new Set(query.data.employees.map((emp: { id: string }) => emp.id));
        counts[oppId] = employeeIds;
      }
    });
    
    // Convert Sets to counts
    const countDict: Record<string, number> = {};
    Object.keys(counts).forEach((oppId) => {
      countDict[oppId] = counts[oppId].size;
    });
    
    return countDict;
  }, [opportunityCountsQueries]);

  const filteredItems = useMemo(() => {
    if (!data?.items || !searchQuery.trim()) {
      return data?.items || [];
    }
    const query = searchQuery.toLowerCase();
    return data.items.filter((opportunity) => {
      // Basic fields
      const name = (opportunity.name || "").toLowerCase();
      const account = (opportunity.account_name || opportunity.account_id || "").toLowerCase();
      const status = (opportunity.status || "").toLowerCase();
      const description = (opportunity.description || "").toLowerCase();
      
      // Get display names for searchable fields
      const accountName = getAccountName(accountsData, opportunity.account_id).toLowerCase();
      const parentName = getParentOpportunityName(allOpportunitiesData, opportunity.parent_opportunity_id).toLowerCase();
      const deliveryCenterName = getDeliveryCenterName(deliveryCentersData, opportunity.delivery_center_id).toLowerCase();
      const ownerName = getEmployeeName(employeesData, opportunity.opportunity_owner_id).toLowerCase();
      
      // Date fields
      const startDate = opportunity.start_date 
        ? new Date(opportunity.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toLowerCase()
        : "";
      const endDate = opportunity.end_date 
        ? new Date(opportunity.end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toLowerCase()
        : "";
      
      // Numeric/currency fields (convert to string for searching)
      const dealValue = opportunity.deal_value_usd 
        ? formatCurrency(opportunity.deal_value_usd, "USD").toLowerCase()
        : "";
      const forecastValue = opportunity.forecast_value_usd 
        ? formatCurrency(opportunity.forecast_value_usd, "USD").toLowerCase()
        : "";
      const dealValueNum = opportunity.deal_value_usd ? String(opportunity.deal_value_usd).toLowerCase() : "";
      const forecastValueNum = opportunity.forecast_value_usd ? String(opportunity.forecast_value_usd).toLowerCase() : "";
      
      // Count fields
      const employeeCount = String(employeeCounts[opportunity.id] ?? 0).toLowerCase();
      
      return (
        name.includes(query) ||
        account.includes(query) ||
        accountName.includes(query) ||
        status.includes(query) ||
        description.includes(query) ||
        parentName.includes(query) ||
        deliveryCenterName.includes(query) ||
        ownerName.includes(query) ||
        startDate.includes(query) ||
        endDate.includes(query) ||
        dealValue.includes(query) ||
        forecastValue.includes(query) ||
        dealValueNum.includes(query) ||
        forecastValueNum.includes(query) ||
        employeeCount.includes(query)
      );
    });
  }, [data, searchQuery, accountsData, deliveryCentersData, employeesData, allOpportunitiesData, employeeCounts]);

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

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString();
  };

  // Compute probability from status (matches form logic); used for Forecast $ display
  const getProbabilityFromStatus = (status: string | undefined): number => {
    const map: Record<string, number> = {
      qualified: 25,
      proposal: 50,
      negotiation: 80,
      won: 100,
    };
    return status ? (map[status] ?? 0) : 0;
  };

  // Compute Forecast $ from status + deal_value_usd (matches Edit form; avoids stale stored value)
  const getForecastDisplayValue = (
    opportunity: { status?: string; deal_value_usd?: string | number }
  ): string | number | undefined => {
    const prob = getProbabilityFromStatus(opportunity.status);
    const dealUsd = opportunity.deal_value_usd;
    if (prob <= 0 || dealUsd == null || dealUsd === "") return undefined;
    const num = typeof dealUsd === "string" ? parseFloat(dealUsd) : dealUsd;
    if (isNaN(num) || num <= 0) return undefined;
    return (num * prob / 100).toFixed(2);
  };

  // Compute Forecast Value in default currency (matches Edit form; avoids stale stored value)
  const getForecastDisplayValueInCurrency = (
    opportunity: { status?: string; deal_value?: string | number }
  ): string | number | undefined => {
    const prob = getProbabilityFromStatus(opportunity.status);
    const dealVal = opportunity.deal_value;
    if (prob <= 0 || dealVal == null || dealVal === "") return undefined;
    const num = typeof dealVal === "string" ? parseFloat(dealVal) : dealVal;
    if (isNaN(num) || num <= 0) return undefined;
    return (num * prob / 100).toFixed(2);
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
              {filteredItems.length > 0 ? (
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
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Opportunity Name">Name</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Account">Account</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Parent Opportunity Name">Parent</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Status">Status</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Start Date">Start</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="End Date">End</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Invoice Center">IC</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Deal Value (USD)">Deal $</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Forecast Value (USD)">Forecast $</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Plan Revenue (USD)">Plan $</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Actuals from Approved Timesheets (USD)">Actuals $</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Actions">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                        {filteredItems.map((opportunity) => (
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
                            <td className="p-1.5 truncate text-xs overflow-hidden" title={getAccountName(accountsData, opportunity.account_id)}>
                              <Link
                                href={`/accounts?search=${encodeURIComponent(getAccountName(accountsData, opportunity.account_id))}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                {highlightText(getAccountName(accountsData, opportunity.account_id), searchQuery)}
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
                                    : "bg-blue-500" // discovery
                                )}
                                title={opportunity.status.charAt(0).toUpperCase() + opportunity.status.slice(1)}
                              />
                            </td>
                            <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden min-w-0" title={opportunity.start_date ? new Date(opportunity.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : "—"}>
                              {opportunity.start_date
                                ? new Date(opportunity.start_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
                                : "—"}
                            </td>
                            <td className="p-1.5 whitespace-nowrap text-xs overflow-hidden" title={opportunity.end_date ? new Date(opportunity.end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : "—"}>
                              {opportunity.end_date
                                ? new Date(opportunity.end_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
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
                      {filteredItems.map((opportunity) => (
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
                                <div className="text-sm">{highlightText(opportunity.account_name || opportunity.account_id, searchQuery)}</div>
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
                                      : "bg-blue-100 text-blue-800" // discovery
                                  }`}
                                >
                                  {highlightText(opportunity.status.charAt(0).toUpperCase() + opportunity.status.slice(1), searchQuery)}
                                </span>
                              </div>
                            </div>
                            {opportunity.start_date && (
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Start Date
                                </div>
                                <div className="text-sm">
                                  {new Date(opportunity.start_date).toLocaleDateString()}
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
                      {searchQuery.trim() 
                        ? `No opportunities found matching "${searchQuery}"` 
                        : "No opportunities found."}
                    </p>
                    {!searchQuery.trim() && (
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

          {data && data.total > limit && !searchQuery.trim() && (
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

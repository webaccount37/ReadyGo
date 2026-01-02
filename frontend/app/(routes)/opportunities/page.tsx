"use client";

import { useState, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  useOpportunities,
  useCreateOpportunity,
  useUpdateOpportunity,
  useDeleteOpportunity,
} from "@/hooks/useOpportunities";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { OpportunityForm } from "@/components/opportunities/opportunity-form";
import { OpportunityRelationships } from "@/components/opportunities/opportunity-relationships";
import type { OpportunityCreate, OpportunityUpdate } from "@/types/opportunity";
import { Input } from "@/components/ui/input";
import { highlightText } from "@/lib/utils/highlight";
import { useOpportunity } from "@/hooks/useOpportunities";
import { useAccounts } from "@/hooks/useAccounts";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useBillingTerms } from "@/hooks/useBillingTerms";
import { useEmployees } from "@/hooks/useEmployees";
import { useEngagements } from "@/hooks/useEngagements";
import { opportunitiesApi } from "@/lib/api/opportunities";
import Link from "next/link";

export default function OpportunitiesPage() {
  const [skip, setSkip] = useState(0);
  const [limit] = useState(10);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<string | null>(null);
  const [viewingOpportunity, setViewingOpportunity] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error, refetch } = useOpportunities({ skip, limit });
  const createOpportunity = useCreateOpportunity();
  const updateOpportunity = useUpdateOpportunity();
  const deleteOpportunity = useDeleteOpportunity();
  
  // Fetch related data for display names
  const { data: accountsData } = useAccounts({ limit: 100 });
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: billingTermsData } = useBillingTerms();
  const { data: employeesData } = useEmployees({ limit: 1000 });
  const { data: allOpportunitiesData } = useOpportunities({ limit: 100 });
  // Fetch all engagements to calculate counts
  const { data: allEngagementsData } = useEngagements({ limit: 10000 });
  
  // Fetch opportunity with relationships for viewing/editing
  const { data: viewingOpportunityData, refetch: refetchViewingOpportunity } = useOpportunity(
    viewingOpportunity || "",
    true, // include relationships
    { enabled: !!viewingOpportunity }
  );
  
  const { data: editingOpportunityData, refetch: refetchEditingOpportunity } = useOpportunity(
    editingOpportunity || "",
    true, // include relationships
    { enabled: !!editingOpportunity }
  );

  const filteredItems = useMemo(() => {
    if (!data?.items || !searchQuery.trim()) {
      return data?.items || [];
    }
    const query = searchQuery.toLowerCase();
    return data.items.filter((opportunity) => {
      const name = (opportunity.name || "").toLowerCase();
      const account = (opportunity.account_name || opportunity.account_id || "").toLowerCase();
      const type = (opportunity.opportunity_type || "").toLowerCase();
      const status = (opportunity.status || "").toLowerCase();
      return (
        name.includes(query) ||
        account.includes(query) ||
        type.includes(query) ||
        status.includes(query)
      );
    });
  }, [data, searchQuery]);

  // Fetch opportunities with relationships for accurate counts (only for current page)
  const opportunityIdsForCounts = useMemo(() => filteredItems.map(opp => opp.id), [filteredItems]);
  const opportunityCountsQueries = useQueries({
    queries: opportunityIdsForCounts.map(id => ({
      queryKey: ["opportunities", "detail", id, true],
      queryFn: () => opportunitiesApi.getOpportunity(id, true),
      enabled: !!id,
      staleTime: 30000,
    })),
  });

  const handleCreate = async (data: OpportunityCreate | OpportunityUpdate) => {
    try {
      await createOpportunity.mutateAsync(data as OpportunityCreate);
      setIsCreateOpen(false);
      refetch();
    } catch (err) {
      console.error("Failed to create opportunity:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUpdate = async (data: OpportunityCreate | OpportunityUpdate) => {
    if (!editingOpportunity) return;
    try {
      await updateOpportunity.mutateAsync({ id: editingOpportunity, data: data as OpportunityUpdate });
      setEditingOpportunity(null);
      refetch();
    } catch (err) {
      console.error("Failed to update opportunity:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this opportunity?")) {
      try {
        await deleteOpportunity.mutateAsync(id);
        refetch();
      } catch (err) {
        console.error("Failed to delete opportunity:", err);
        alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const opportunityToEdit = editingOpportunityData || (editingOpportunity
    ? data?.items.find((e) => e.id === editingOpportunity)
    : null);

  const opportunityToView = viewingOpportunityData || (viewingOpportunity
    ? data?.items.find((e) => e.id === viewingOpportunity)
    : null);

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

  const formatCurrency = (value: string | number | undefined, currency?: string): string => {
    if (value === undefined || value === null || value === "") return "—";
    const numValue = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(numValue)) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numValue);
  };

  const formatMonth = (month: number | undefined): string => {
    if (!month) return "—";
    return new Date(2000, month - 1).toLocaleString("default", { month: "long" });
  };

  // Get display names for IDs
  const getAccountName = (accountId: string | undefined): string => {
    if (!accountId) return "—";
    const account = accountsData?.items.find((a) => a.id === accountId);
    return account?.company_name || accountId;
  };

  const getDeliveryCenterName = (dcId: string | undefined): string => {
    if (!dcId) return "—";
    const dc = deliveryCentersData?.items.find((d) => d.id === dcId);
    return dc?.name || dcId;
  };

  const getBillingTermName = (termId: string | undefined): string => {
    if (!termId) return "—";
    const term = billingTermsData?.items.find((t) => t.id === termId);
    return term?.name || termId;
  };

  const getEmployeeName = (empId: string | undefined): string => {
    if (!empId) return "—";
    const emp = employeesData?.items.find((e) => e.id === empId);
    return emp ? `${emp.first_name} ${emp.last_name}` : empId;
  };

  const getParentOpportunityName = (parentId: string | undefined): string => {
    if (!parentId) return "None";
    const parent = allOpportunitiesData?.items.find((e) => e.id === parentId);
    return parent?.name || parentId;
  };

  // Calculate engagement and employee counts per opportunity
  // Use opportunity data with relationships for accurate counts
  const engagementCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    
    // Use opportunity data with relationships if available (most accurate)
    opportunityCountsQueries.forEach((query) => {
      if (query.data?.engagements) {
        const oppId = query.data.id;
        counts[oppId] = query.data.engagements.length;
      }
    });
    
    // Fallback: use engagement list data for opportunities not yet loaded with relationships
    if (allEngagementsData?.items) {
      const fallbackCounts: Record<string, number> = {};
      allEngagementsData.items.forEach((engagement) => {
        if (engagement.opportunity_id) {
          fallbackCounts[engagement.opportunity_id] = (fallbackCounts[engagement.opportunity_id] || 0) + 1;
        }
      });
      // Only use fallback counts for opportunities we don't have relationship data for
      Object.keys(fallbackCounts).forEach((oppId) => {
        if (counts[oppId] === undefined) {
          counts[oppId] = fallbackCounts[oppId];
        }
      });
    }
    
    return counts;
  }, [opportunityCountsQueries, allEngagementsData]);

  const employeeCounts = useMemo(() => {
    const counts: Record<string, Set<string>> = {};
    
    // Use opportunity data with relationships if available (most accurate)
    opportunityCountsQueries.forEach((query) => {
      if (query.data?.engagements) {
        const oppId = query.data.id;
        const employeeSet = new Set<string>();
        query.data.engagements.forEach((engagement) => {
          if (engagement.employees) {
            engagement.employees.forEach((emp) => {
              employeeSet.add(emp.id);
            });
          }
        });
        counts[oppId] = employeeSet;
      }
    });
    
    const result: Record<string, number> = {};
    Object.keys(counts).forEach((oppId) => {
      result[oppId] = counts[oppId].size;
    });
    return result;
  }, [opportunityCountsQueries]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Opportunities</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Manage your opportunities and their details
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">+ Add Opportunity</Button>
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
            <CardHeader>
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
            <CardContent>
              {filteredItems.length > 0 ? (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2 font-semibold whitespace-nowrap" title="Opportunity Name">Name</th>
                            <th className="text-left p-2 font-semibold whitespace-nowrap" title="Account">Account</th>
                            <th className="text-left p-2 font-semibold whitespace-nowrap" title="Parent Opportunity Name">Parent</th>
                            <th className="text-left p-2 font-semibold whitespace-nowrap" title="Status">Status</th>
                            <th className="text-left p-2 font-semibold whitespace-nowrap" title="Start Date">Start</th>
                            <th className="text-left p-2 font-semibold whitespace-nowrap" title="Delivery Center">DC</th>
                            <th className="text-left p-2 font-semibold whitespace-nowrap" title="Deal Value">Deal Value</th>
                            <th className="text-left p-2 font-semibold whitespace-nowrap" title="Project Start Year">Year</th>
                            <th className="text-left p-2 font-semibold whitespace-nowrap" title="Project Start Month">Month</th>
                            <th className="text-left p-2 font-semibold whitespace-nowrap" title="Project Duration (Months)">Duration</th>
                            <th className="text-left p-2 font-semibold whitespace-nowrap" title="Engagement Count">Eng</th>
                            <th className="text-left p-2 font-semibold whitespace-nowrap" title="Employee Count">Emp</th>
                            <th className="text-left p-2 font-semibold whitespace-nowrap" title="Actions">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                        {filteredItems.map((opportunity) => (
                          <tr 
                            key={opportunity.id} 
                            className="border-b hover:bg-gray-50 cursor-pointer"
                            onClick={() => setViewingOpportunity(opportunity.id)}
                          >
                            <td className="p-2 font-medium max-w-[150px] truncate" title={opportunity.name}>{highlightText(opportunity.name, searchQuery)}</td>
                            <td className="p-2 max-w-[120px] truncate" title={getAccountName(opportunity.account_id)}>{highlightText(getAccountName(opportunity.account_id), searchQuery)}</td>
                            <td className="p-2 max-w-[120px] truncate" title={getParentOpportunityName(opportunity.parent_opportunity_id)}>{getParentOpportunityName(opportunity.parent_opportunity_id)}</td>
                            <td className="p-2">
                              <span
                                className={`px-1.5 py-0.5 text-xs rounded whitespace-nowrap ${
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
                            </td>
                            <td className="p-2 whitespace-nowrap" title={opportunity.start_date ? new Date(opportunity.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : "—"}>
                              {opportunity.start_date
                                ? new Date(opportunity.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                : "—"}
                            </td>
                            <td className="p-2 max-w-[100px] truncate" title={getDeliveryCenterName(opportunity.delivery_center_id) || "—"}>{getDeliveryCenterName(opportunity.delivery_center_id)}</td>
                            <td className="p-2 whitespace-nowrap" title={opportunity.deal_value ? formatCurrency(opportunity.deal_value, opportunity.default_currency) : "—"}>
                              {opportunity.deal_value
                                ? formatCurrency(opportunity.deal_value, opportunity.default_currency)
                                : "—"}
                            </td>
                            <td className="p-2 whitespace-nowrap" title={opportunity.project_start_year ? String(opportunity.project_start_year) : "—"}>{opportunity.project_start_year || "—"}</td>
                            <td className="p-2 whitespace-nowrap" title={opportunity.project_start_month ? formatMonth(opportunity.project_start_month) : "—"}>{opportunity.project_start_month ? formatMonth(opportunity.project_start_month).substring(0, 3) : "—"}</td>
                            <td className="p-2 whitespace-nowrap" title={opportunity.project_duration_months ? `${opportunity.project_duration_months} months` : "—"}>{opportunity.project_duration_months || "—"}</td>
                            <td className="p-2 whitespace-nowrap">
                              <Link
                                href={`/engagements?search=${encodeURIComponent(opportunity.name)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                              >
                                {engagementCounts[opportunity.id] ?? "—"}
                              </Link>
                            </td>
                            <td className="p-2 whitespace-nowrap">
                              <Link
                                href={`/employees?search=${encodeURIComponent(opportunity.name)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                              >
                                {employeeCounts[opportunity.id] ?? "—"}
                              </Link>
                            </td>
                            <td className="p-2">
                              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setViewingOpportunity(opportunity.id)}
                                  className="h-7 px-2 text-xs"
                                >
                                  View
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingOpportunity(opportunity.id)}
                                  className="h-7 px-2 text-xs"
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDelete(opportunity.id)}
                                  className="h-7 px-2 text-red-600 hover:text-red-700"
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
                          onClick={() => setViewingOpportunity(opportunity.id)}
                        >
                          <CardContent className="pt-6">
                            <div className="space-y-3">
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Name
                                </div>
                                <div className="text-sm font-medium">{highlightText(opportunity.name, searchQuery)}</div>
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
                                  Type
                                </div>
                                <span className="px-2 py-1 text-xs rounded bg-purple-100 text-purple-800">
                                  {highlightText(opportunity.opportunity_type, searchQuery)}
                                </span>
                              </div>
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
                            <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setViewingOpportunity(opportunity.id)}
                                className="flex-1"
                              >
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingOpportunity(opportunity.id)}
                                className="flex-1"
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDelete(opportunity.id)}
                                className="flex-1 text-red-600 hover:text-red-700"
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
                        onClick={() => setIsCreateOpen(true)}
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

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogHeader>
          <DialogTitle>Create New Opportunity</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <OpportunityForm
            onSubmit={handleCreate}
            onCancel={() => setIsCreateOpen(false)}
            isLoading={createOpportunity.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      {viewingOpportunity && opportunityToView && (
        <Dialog open={!!viewingOpportunity} onOpenChange={(open) => !open && setViewingOpportunity(null)}>
          <DialogHeader>
            <DialogTitle>Opportunity Details</DialogTitle>
          </DialogHeader>
          <DialogContent className="space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">Basic Information</h3>
              
              <div>
                <p className="text-sm font-semibold text-gray-800">Opportunity Name</p>
                <p className="text-sm text-gray-700">{opportunityToView.name}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Account</p>
                  <p className="text-sm text-gray-700">{getAccountName(opportunityToView.account_id)}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Parent Opportunity</p>
                  <p className="text-sm text-gray-700">{getParentOpportunityName(opportunityToView.parent_opportunity_id)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Status</p>
                  <p className="text-sm text-gray-700">{formatStatus(opportunityToView.status)}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Opportunity Type</p>
                  <p className="text-sm text-gray-700">{formatEnumValue(opportunityToView.opportunity_type)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Start Date</p>
                  <p className="text-sm text-gray-700">{formatDate(opportunityToView.start_date)}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">End Date</p>
                  <p className="text-sm text-gray-700">{formatDate(opportunityToView.end_date)}</p>
                </div>
              </div>

              {opportunityToView.description && (
                <div>
                  <p className="text-sm font-semibold text-gray-800">Description</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{opportunityToView.description}</p>
                </div>
              )}
            </div>

            {/* Financial & Billing Information */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-lg font-semibold border-b pb-2">Financial & Billing Information</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Delivery Center</p>
                  <p className="text-sm text-gray-700">{getDeliveryCenterName(opportunityToView.delivery_center_id)}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Opportunity Owner</p>
                  <p className="text-sm text-gray-700">{getEmployeeName(opportunityToView.opportunity_owner_id)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Default Currency</p>
                  <p className="text-sm text-gray-700">{opportunityToView.default_currency || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Billing Terms</p>
                  <p className="text-sm text-gray-700">{getBillingTermName(opportunityToView.billing_term_id)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Invoice Customer?</p>
                  <p className="text-sm text-gray-700">{opportunityToView.invoice_customer ? "Yes" : "No"}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Billable Expenses?</p>
                  <p className="text-sm text-gray-700">{opportunityToView.billable_expenses ? "Yes" : "No"}</p>
                </div>
              </div>

              {opportunityToView.utilization !== undefined && opportunityToView.utilization !== null && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Utilization</p>
                    <p className="text-sm text-gray-700">{opportunityToView.utilization}%</p>
                  </div>
                  {opportunityToView.margin !== undefined && opportunityToView.margin !== null && (
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Margin</p>
                      <p className="text-sm text-gray-700">{opportunityToView.margin}%</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Deal & Forecast Information */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-lg font-semibold border-b pb-2">Deal & Forecast Information</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Probability</p>
                  <p className="text-sm text-gray-700">
                    {opportunityToView.probability !== undefined && opportunityToView.probability !== null
                      ? `${opportunityToView.probability}%`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Win Probability</p>
                  <p className="text-sm text-gray-700">{formatEnumValue(opportunityToView.win_probability)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Accountability</p>
                  <p className="text-sm text-gray-700">{formatEnumValue(opportunityToView.accountability)}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Strategic Importance</p>
                  <p className="text-sm text-gray-700">{formatEnumValue(opportunityToView.strategic_importance)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Deal Creation Date</p>
                  <p className="text-sm text-gray-700">{formatDate(opportunityToView.deal_creation_date)}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Close Date</p>
                  <p className="text-sm text-gray-700">{formatDate(opportunityToView.close_date)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    Deal Value ({opportunityToView.default_currency || "USD"})
                  </p>
                  <p className="text-sm text-gray-700">
                    {opportunityToView.deal_value
                      ? formatCurrency(opportunityToView.deal_value, opportunityToView.default_currency)
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Deal Value (USD)</p>
                  <p className="text-sm text-gray-700">
                    {opportunityToView.deal_value_usd ? formatCurrency(opportunityToView.deal_value_usd, "USD") : "—"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Deal Length (days)</p>
                  <p className="text-sm text-gray-700">
                    {opportunityToView.deal_length !== undefined && opportunityToView.deal_length !== null
                      ? opportunityToView.deal_length
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    Forecast Value ({opportunityToView.default_currency || "USD"})
                  </p>
                  <p className="text-sm text-gray-700">
                    {opportunityToView.forecast_value
                      ? formatCurrency(opportunityToView.forecast_value, opportunityToView.default_currency)
                      : "—"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Forecast Value (USD)</p>
                  <p className="text-sm text-gray-700">
                    {opportunityToView.forecast_value_usd
                      ? formatCurrency(opportunityToView.forecast_value_usd, "USD")
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Project Start Month</p>
                  <p className="text-sm text-gray-700">{formatMonth(opportunityToView.project_start_month)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Project Start Year</p>
                  <p className="text-sm text-gray-700">
                    {opportunityToView.project_start_year || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Project Duration (Months)</p>
                  <p className="text-sm text-gray-700">
                    {opportunityToView.project_duration_months || "—"}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Relationships Section */}
            {viewingOpportunityData && (
              <div className="pt-4 border-t">
                <OpportunityRelationships
                  opportunity={viewingOpportunityData}
                  onUpdate={async () => {
                    await refetchViewingOpportunity();
                    await refetch();
                  }}
                  readOnly={true}
                />
              </div>
            )}
            
            <div className="flex justify-end pt-4">
              <Button variant="outline" onClick={() => setViewingOpportunity(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Dialog */}
      {editingOpportunity && opportunityToEdit && (
        <Dialog
          open={!!editingOpportunity}
          onOpenChange={(open) => !open && setEditingOpportunity(null)}
        >
          <DialogHeader>
            <DialogTitle>Edit Opportunity</DialogTitle>
          </DialogHeader>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <OpportunityForm
              initialData={opportunityToEdit}
              onSubmit={handleUpdate}
              onCancel={() => setEditingOpportunity(null)}
              isLoading={updateOpportunity.isPending}
            />
            
            {/* Relationships Section */}
            {editingOpportunityData && (
              <div className="pt-6 border-t mt-6">
                <OpportunityRelationships
                  opportunity={editingOpportunityData}
                  onUpdate={async () => {
                    await refetchEditingOpportunity();
                    await refetch();
                  }}
                  readOnly={false}
                />
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}


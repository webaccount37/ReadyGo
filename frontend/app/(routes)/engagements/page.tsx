"use client";

import { useState, useMemo } from "react";
import {
  useEngagements,
  useCreateEngagement,
  useUpdateEngagement,
  useDeleteEngagement,
} from "@/hooks/useEngagements";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { EngagementForm } from "@/components/engagements/engagement-form";
import { EngagementRelationships } from "@/components/engagements/engagement-relationships";
import type { EngagementCreate, EngagementUpdate } from "@/types/engagement";
import { Input } from "@/components/ui/input";
import { highlightText } from "@/lib/utils/highlight";
import { useEngagement } from "@/hooks/useEngagements";
import { useAccounts } from "@/hooks/useAccounts";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useBillingTerms } from "@/hooks/useBillingTerms";
import { useEmployees } from "@/hooks/useEmployees";

export default function EngagementsPage() {
  const [skip, setSkip] = useState(0);
  const [limit] = useState(10);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEngagement, setEditingEngagement] = useState<string | null>(null);
  const [viewingEngagement, setViewingEngagement] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error, refetch } = useEngagements({ skip, limit });
  const createEngagement = useCreateEngagement();
  const updateEngagement = useUpdateEngagement();
  const deleteEngagement = useDeleteEngagement();
  
  // Fetch related data for display names
  const { data: accountsData } = useAccounts({ limit: 100 });
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: billingTermsData } = useBillingTerms();
  const { data: employeesData } = useEmployees({ limit: 1000 });
  const { data: allEngagementsData } = useEngagements({ limit: 100 });
  
  // Fetch engagement with relationships for viewing/editing
  const { data: viewingEngagementData, refetch: refetchViewingEngagement } = useEngagement(
    viewingEngagement || "",
    true, // include relationships
    { enabled: !!viewingEngagement }
  );
  
  const { data: editingEngagementData, refetch: refetchEditingEngagement } = useEngagement(
    editingEngagement || "",
    true, // include relationships
    { enabled: !!editingEngagement }
  );

  const filteredItems = useMemo(() => {
    if (!data?.items || !searchQuery.trim()) {
      return data?.items || [];
    }
    const query = searchQuery.toLowerCase();
    return data.items.filter((engagement) => {
      const name = (engagement.name || "").toLowerCase();
      const account = (engagement.account_name || engagement.account_id || "").toLowerCase();
      const type = (engagement.engagement_type || "").toLowerCase();
      const status = (engagement.status || "").toLowerCase();
      return (
        name.includes(query) ||
        account.includes(query) ||
        type.includes(query) ||
        status.includes(query)
      );
    });
  }, [data, searchQuery]);

  const handleCreate = async (data: EngagementCreate | EngagementUpdate) => {
    try {
      await createEngagement.mutateAsync(data as EngagementCreate);
      setIsCreateOpen(false);
      refetch();
    } catch (err) {
      console.error("Failed to create engagement:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUpdate = async (data: EngagementCreate | EngagementUpdate) => {
    if (!editingEngagement) return;
    try {
      await updateEngagement.mutateAsync({ id: editingEngagement, data: data as EngagementUpdate });
      setEditingEngagement(null);
      refetch();
    } catch (err) {
      console.error("Failed to update engagement:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this engagement?")) {
      try {
        await deleteEngagement.mutateAsync(id);
        refetch();
      } catch (err) {
        console.error("Failed to delete engagement:", err);
        alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const engagementToEdit = editingEngagementData || (editingEngagement
    ? data?.items.find((e) => e.id === editingEngagement)
    : null);

  const engagementToView = viewingEngagementData || (viewingEngagement
    ? data?.items.find((e) => e.id === viewingEngagement)
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

  const getParentEngagementName = (parentId: string | undefined): string => {
    if (!parentId) return "None";
    const parent = allEngagementsData?.items.find((e) => e.id === parentId);
    return parent?.name || parentId;
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Engagements</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Manage your engagements and their details
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">+ Add Engagement</Button>
      </div>

      {isLoading && <div className="text-gray-600">Loading engagements...</div>}

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
                <CardTitle>Engagements ({data?.total ?? 0})</CardTitle>
                <div className="w-full sm:w-64">
                  <Input
                    type="text"
                    placeholder="Search engagements..."
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
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-3 font-semibold">Name</th>
                            <th className="text-left p-3 font-semibold">Account</th>
                            <th className="text-left p-3 font-semibold">Type</th>
                            <th className="text-left p-3 font-semibold">Status</th>
                            <th className="text-left p-3 font-semibold">Start Date</th>
                            <th className="text-left p-3 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                        {filteredItems.map((engagement) => (
                          <tr 
                            key={engagement.id} 
                            className="border-b hover:bg-gray-50 cursor-pointer"
                            onClick={() => setViewingEngagement(engagement.id)}
                          >
                            <td className="p-3 font-medium">{highlightText(engagement.name, searchQuery)}</td>
                            <td className="p-3">{highlightText(engagement.account_name || engagement.account_id, searchQuery)}</td>
                            <td className="p-3">
                              <span className="px-2 py-1 text-xs rounded bg-purple-100 text-purple-800">
                                {highlightText(engagement.engagement_type, searchQuery)}
                              </span>
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-1 text-xs rounded ${
                                  engagement.status === "won"
                                    ? "bg-green-100 text-green-800"
                                    : engagement.status === "lost"
                                    ? "bg-red-100 text-red-800"
                                    : engagement.status === "cancelled"
                                    ? "bg-gray-100 text-gray-800"
                                    : engagement.status === "negotiation"
                                    ? "bg-orange-100 text-orange-800"
                                    : engagement.status === "proposal"
                                    ? "bg-yellow-100 text-yellow-800"
                                    : engagement.status === "qualified"
                                    ? "bg-cyan-100 text-cyan-800"
                                    : "bg-blue-100 text-blue-800" // discovery
                                }`}
                              >
                                {highlightText(engagement.status.charAt(0).toUpperCase() + engagement.status.slice(1), searchQuery)}
                              </span>
                            </td>
                            <td className="p-3">
                              {engagement.start_date
                                ? new Date(engagement.start_date).toLocaleDateString()
                                : "—"}
                            </td>
                            <td className="p-3">
                              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setViewingEngagement(engagement.id)}
                                >
                                  View
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingEngagement(engagement.id)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDelete(engagement.id)}
                                >
                                  Delete
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
                      {filteredItems.map((engagement) => (
                        <Card 
                          key={engagement.id}
                          className="cursor-pointer"
                          onClick={() => setViewingEngagement(engagement.id)}
                        >
                          <CardContent className="pt-6">
                            <div className="space-y-3">
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Name
                                </div>
                                <div className="text-sm font-medium">{highlightText(engagement.name, searchQuery)}</div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Account
                                </div>
                                <div className="text-sm">{highlightText(engagement.account_name || engagement.account_id, searchQuery)}</div>
                              </div>
                            <div className="flex gap-2">
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Type
                                </div>
                                <span className="px-2 py-1 text-xs rounded bg-purple-100 text-purple-800">
                                  {highlightText(engagement.engagement_type, searchQuery)}
                                </span>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Status
                                </div>
                                <span
                                  className={`px-2 py-1 text-xs rounded ${
                                    engagement.status === "won"
                                      ? "bg-green-100 text-green-800"
                                      : engagement.status === "lost"
                                      ? "bg-red-100 text-red-800"
                                      : engagement.status === "cancelled"
                                      ? "bg-gray-100 text-gray-800"
                                      : engagement.status === "negotiation"
                                      ? "bg-orange-100 text-orange-800"
                                      : engagement.status === "proposal"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : engagement.status === "qualified"
                                      ? "bg-cyan-100 text-cyan-800"
                                      : "bg-blue-100 text-blue-800" // discovery
                                  }`}
                                >
                                  {highlightText(engagement.status.charAt(0).toUpperCase() + engagement.status.slice(1), searchQuery)}
                                </span>
                              </div>
                            </div>
                            {engagement.start_date && (
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Start Date
                                </div>
                                <div className="text-sm">
                                  {new Date(engagement.start_date).toLocaleDateString()}
                                </div>
                              </div>
                            )}
                            <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setViewingEngagement(engagement.id)}
                                className="flex-1"
                              >
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingEngagement(engagement.id)}
                                className="flex-1"
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDelete(engagement.id)}
                                className="flex-1"
                              >
                                Delete
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
                        ? `No engagements found matching "${searchQuery}"` 
                        : "No engagements found."}
                    </p>
                    {!searchQuery.trim() && (
                      <Button
                        className="mt-4"
                        onClick={() => setIsCreateOpen(true)}
                      >
                        Create First Engagement
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
          <DialogTitle>Create New Engagement</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <EngagementForm
            onSubmit={handleCreate}
            onCancel={() => setIsCreateOpen(false)}
            isLoading={createEngagement.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      {viewingEngagement && engagementToView && (
        <Dialog open={!!viewingEngagement} onOpenChange={(open) => !open && setViewingEngagement(null)}>
          <DialogHeader>
            <DialogTitle>Engagement Details</DialogTitle>
          </DialogHeader>
          <DialogContent className="space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">Basic Information</h3>
              
              <div>
                <p className="text-sm font-semibold text-gray-800">Engagement Name</p>
                <p className="text-sm text-gray-700">{engagementToView.name}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Account</p>
                  <p className="text-sm text-gray-700">{getAccountName(engagementToView.account_id)}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Parent Engagement</p>
                  <p className="text-sm text-gray-700">{getParentEngagementName(engagementToView.parent_engagement_id)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Status</p>
                  <p className="text-sm text-gray-700">{formatStatus(engagementToView.status)}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Engagement Type</p>
                  <p className="text-sm text-gray-700">{formatEnumValue(engagementToView.engagement_type)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Start Date</p>
                  <p className="text-sm text-gray-700">{formatDate(engagementToView.start_date)}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">End Date</p>
                  <p className="text-sm text-gray-700">{formatDate(engagementToView.end_date)}</p>
                </div>
              </div>

              {engagementToView.description && (
                <div>
                  <p className="text-sm font-semibold text-gray-800">Description</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{engagementToView.description}</p>
                </div>
              )}
            </div>

            {/* Financial & Billing Information */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-lg font-semibold border-b pb-2">Financial & Billing Information</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Delivery Center</p>
                  <p className="text-sm text-gray-700">{getDeliveryCenterName(engagementToView.delivery_center_id)}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Engagement Owner</p>
                  <p className="text-sm text-gray-700">{getEmployeeName(engagementToView.engagement_owner_id)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Default Currency</p>
                  <p className="text-sm text-gray-700">{engagementToView.default_currency || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Billing Terms</p>
                  <p className="text-sm text-gray-700">{getBillingTermName(engagementToView.billing_term_id)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Invoice Customer?</p>
                  <p className="text-sm text-gray-700">{engagementToView.invoice_customer ? "Yes" : "No"}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Billable Expenses?</p>
                  <p className="text-sm text-gray-700">{engagementToView.billable_expenses ? "Yes" : "No"}</p>
                </div>
              </div>

              {engagementToView.utilization !== undefined && engagementToView.utilization !== null && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Utilization</p>
                    <p className="text-sm text-gray-700">{engagementToView.utilization}%</p>
                  </div>
                  {engagementToView.margin !== undefined && engagementToView.margin !== null && (
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Margin</p>
                      <p className="text-sm text-gray-700">{engagementToView.margin}%</p>
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
                    {engagementToView.probability !== undefined && engagementToView.probability !== null
                      ? `${engagementToView.probability}%`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Win Probability</p>
                  <p className="text-sm text-gray-700">{formatEnumValue(engagementToView.win_probability)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Accountability</p>
                  <p className="text-sm text-gray-700">{formatEnumValue(engagementToView.accountability)}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Strategic Importance</p>
                  <p className="text-sm text-gray-700">{formatEnumValue(engagementToView.strategic_importance)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Deal Creation Date</p>
                  <p className="text-sm text-gray-700">{formatDate(engagementToView.deal_creation_date)}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Close Date</p>
                  <p className="text-sm text-gray-700">{formatDate(engagementToView.close_date)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    Deal Value ({engagementToView.default_currency || "USD"})
                  </p>
                  <p className="text-sm text-gray-700">
                    {engagementToView.deal_value
                      ? formatCurrency(engagementToView.deal_value, engagementToView.default_currency)
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Deal Value (USD)</p>
                  <p className="text-sm text-gray-700">
                    {engagementToView.deal_value_usd ? formatCurrency(engagementToView.deal_value_usd, "USD") : "—"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Deal Length (days)</p>
                  <p className="text-sm text-gray-700">
                    {engagementToView.deal_length !== undefined && engagementToView.deal_length !== null
                      ? engagementToView.deal_length
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    Forecast Value ({engagementToView.default_currency || "USD"})
                  </p>
                  <p className="text-sm text-gray-700">
                    {engagementToView.forecast_value
                      ? formatCurrency(engagementToView.forecast_value, engagementToView.default_currency)
                      : "—"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Forecast Value (USD)</p>
                  <p className="text-sm text-gray-700">
                    {engagementToView.forecast_value_usd
                      ? formatCurrency(engagementToView.forecast_value_usd, "USD")
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Project Start Month</p>
                  <p className="text-sm text-gray-700">{formatMonth(engagementToView.project_start_month)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Project Start Year</p>
                  <p className="text-sm text-gray-700">
                    {engagementToView.project_start_year || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Project Duration (Months)</p>
                  <p className="text-sm text-gray-700">
                    {engagementToView.project_duration_months || "—"}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Relationships Section */}
            {viewingEngagementData && (
              <div className="pt-4 border-t">
                <EngagementRelationships
                  engagement={viewingEngagementData}
                  onUpdate={async () => {
                    await refetchViewingEngagement();
                    await refetch();
                  }}
                  readOnly={true}
                />
              </div>
            )}
            
            <div className="flex justify-end pt-4">
              <Button variant="outline" onClick={() => setViewingEngagement(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Dialog */}
      {editingEngagement && engagementToEdit && (
        <Dialog
          open={!!editingEngagement}
          onOpenChange={(open) => !open && setEditingEngagement(null)}
        >
          <DialogHeader>
            <DialogTitle>Edit Engagement</DialogTitle>
          </DialogHeader>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <EngagementForm
              initialData={engagementToEdit}
              onSubmit={handleUpdate}
              onCancel={() => setEditingEngagement(null)}
              isLoading={updateEngagement.isPending}
            />
            
            {/* Relationships Section */}
            {editingEngagementData && (
              <div className="pt-6 border-t mt-6">
                <EngagementRelationships
                  engagement={editingEngagementData}
                  onUpdate={async () => {
                    await refetchEditingEngagement();
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


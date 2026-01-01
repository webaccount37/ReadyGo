"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  useEngagements,
  useCreateEngagement,
  useUpdateEngagement,
  useDeleteEngagement,
} from "@/hooks/useEngagements";
import { estimatesApi } from "@/lib/api/estimates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { EngagementForm } from "@/components/engagements/engagement-form";
import type { EngagementCreate, EngagementUpdate } from "@/types/engagement";
import { Input } from "@/components/ui/input";
import { highlightText } from "@/lib/utils/highlight";
import { useBillingTerms } from "@/hooks/useBillingTerms";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useEngagement } from "@/hooks/useEngagements";
import { EngagementRelationships } from "@/components/engagements/engagement-relationships";
import { Calculator } from "lucide-react";

export default function EngagementsPage() {
  const router = useRouter();
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
  
  // Fetch billing terms and delivery centers for display names
  const { data: billingTermsData } = useBillingTerms();
  const { data: deliveryCentersData } = useDeliveryCenters();

  // Helper function to format date without timezone conversion
  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return "—";
    // Parse date string as local date (avoid timezone conversion)
    const datePart = dateStr.split("T")[0];
    const [year, month, day] = datePart.split("-").map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed in JS
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

  // Helper function to handle opening estimate
  const handleOpenEstimate = async (engagementId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Fetch estimates for this engagement
      const estimatesData = await estimatesApi.getEstimates({ engagement_id: engagementId });
      
      // Find the active estimate
      const activeEstimate = estimatesData.items?.find((est) => est.active_version === true);
      
      if (activeEstimate) {
        router.push(`/estimates/${activeEstimate.id}`);
      } else {
        alert("No active estimate found for this engagement");
      }
    } catch (err) {
      console.error("Failed to open estimate:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const filteredItems = useMemo(() => {
    if (!data?.items || !searchQuery.trim()) {
      return data?.items || [];
    }
    const query = searchQuery.toLowerCase();
    return data.items.filter((engagement) => {
      const name = (engagement.name || "").toLowerCase();
      const opportunity = (engagement.opportunity_name || engagement.opportunity_id || "").toLowerCase();
      const status = (engagement.status || "").toLowerCase();
      return (
        name.includes(query) ||
        opportunity.includes(query) ||
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

  // Fetch engagement with relationships for editing
  const { data: editingEngagementData, refetch: refetchEditingEngagement } = useEngagement(
    editingEngagement || "",
    true, // include relationships
    { enabled: !!editingEngagement }
  );

  // Fetch engagement with relationships for viewing
  const { data: viewingEngagementData, refetch: refetchViewingEngagement } = useEngagement(
    viewingEngagement || "",
    true, // include relationships
    { enabled: !!viewingEngagement }
  );

  const engagementToEdit = editingEngagementData || (editingEngagement
    ? data?.items.find((r) => r.id === editingEngagement)
    : null);

  const engagementToView = viewingEngagementData || (viewingEngagement
    ? data?.items.find((r) => r.id === viewingEngagement)
    : null);

  // Helper function to get billing term name
  const getBillingTermName = (termId: string | undefined): string => {
    if (!termId) return "—";
    const term = billingTermsData?.items.find((t) => t.id === termId);
    return term?.name || engagementToView?.billing_term_name || termId;
  };

  // Helper function to get delivery center name
  const getDeliveryCenterName = (dcId: string | undefined): string => {
    if (!dcId) return "—";
    const dc = deliveryCentersData?.items.find((d) => d.id === dcId);
    return dc?.name || engagementToView?.delivery_center_name || dcId;
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Engagements</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Manage opportunity engagements and iterations
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
                            <th className="text-left p-3 font-semibold">Opportunity</th>
                            <th className="text-left p-3 font-semibold">Name</th>
                            <th className="text-left p-3 font-semibold">Status</th>
                            <th className="text-left p-3 font-semibold">Start Date</th>
                            <th className="text-left p-3 font-semibold">End Date</th>
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
                            <td className="p-3">{highlightText(engagement.opportunity_name || engagement.opportunity_id, searchQuery)}</td>
                            <td className="p-3 font-medium">{highlightText(engagement.name, searchQuery)}</td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-1 text-xs rounded ${
                                  engagement.status === "active"
                                    ? "bg-green-100 text-green-800"
                                    : engagement.status === "completed"
                                    ? "bg-blue-100 text-blue-800"
                                    : engagement.status === "on-hold"
                                    ? "bg-yellow-100 text-yellow-800"
                                    : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {highlightText(engagement.status, searchQuery)}
                              </span>
                            </td>
                            <td className="p-3">
                              {formatDate(engagement.start_date)}
                            </td>
                            <td className="p-3">
                              {formatDate(engagement.end_date)}
                            </td>
                            <td className="p-3">
                              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  title="Open Estimate"
                                  onClick={(e) => handleOpenEstimate(engagement.id, e)}
                                >
                                  <Calculator className="w-4 h-4" />
                                </Button>
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
                                  Opportunity
                                </div>
                                <div className="text-sm">{highlightText(engagement.opportunity_name || engagement.opportunity_id, searchQuery)}</div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Name
                                </div>
                                <div className="text-sm font-medium">{highlightText(engagement.name, searchQuery)}</div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Status
                                </div>
                                <span
                                  className={`px-2 py-1 text-xs rounded ${
                                    engagement.status === "active"
                                      ? "bg-green-100 text-green-800"
                                      : engagement.status === "completed"
                                      ? "bg-blue-100 text-blue-800"
                                      : engagement.status === "on-hold"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : "bg-gray-100 text-gray-800"
                                  }`}
                                >
                                  {highlightText(engagement.status, searchQuery)}
                                </span>
                              </div>
                            <div className="grid grid-cols-2 gap-2">
                              {engagement.start_date && (
                                <div>
                                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                    Start Date
                                  </div>
                                  <div className="text-sm">
                                    {formatDate(engagement.start_date)}
                                  </div>
                                </div>
                              )}
                              {engagement.end_date && (
                                <div>
                                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                    End Date
                                  </div>
                                  <div className="text-sm">
                                    {formatDate(engagement.end_date)}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                title="Open Estimate"
                                onClick={(e) => handleOpenEstimate(engagement.id, e)}
                              >
                                <Calculator className="w-4 h-4" />
                              </Button>
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
          <DialogContent className="max-h-[90vh] overflow-y-auto space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">Name</p>
              <p className="text-sm text-gray-700">{engagementToView.name}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Opportunity</p>
              <p className="text-sm text-gray-700">{engagementToView.opportunity_name || engagementToView.opportunity_id}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-800">Status</p>
                <p className="text-sm text-gray-700 capitalize">{engagementToView.status}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Default Currency</p>
                <p className="text-sm text-gray-700">{engagementToView.default_currency || "—"}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {engagementToView.start_date && (
                <div>
                  <p className="text-sm font-semibold text-gray-800">Start Date</p>
                  <p className="text-sm text-gray-700">
                    {formatDate(engagementToView.start_date)}
                  </p>
                </div>
              )}
              {engagementToView.end_date && (
                <div>
                  <p className="text-sm font-semibold text-gray-800">End Date</p>
                  <p className="text-sm text-gray-700">
                    {formatDate(engagementToView.end_date)}
                  </p>
                </div>
              )}
            </div>
            {engagementToView.description && (
              <div>
                <p className="text-sm font-semibold text-gray-800">Description</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{engagementToView.description}</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {engagementToView.budget && (
                <div>
                  <p className="text-sm font-semibold text-gray-800">Budget</p>
                  <p className="text-sm text-gray-700">{engagementToView.budget}</p>
                </div>
              )}
              {engagementToView.delivery_center_id && (
                <div>
                  <p className="text-sm font-semibold text-gray-800">Delivery Center</p>
                  <p className="text-sm text-gray-700">{getDeliveryCenterName(engagementToView.delivery_center_id)}</p>
                </div>
              )}
              {engagementToView.billing_term_id && (
                <div>
                  <p className="text-sm font-semibold text-gray-800">Billing Terms</p>
                  <p className="text-sm text-gray-700">{getBillingTermName(engagementToView.billing_term_id)}</p>
                </div>
              )}
            </div>
            
            {/* Relationships Section */}
            {viewingEngagementData && (
              <div className="pt-6 border-t mt-6">
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


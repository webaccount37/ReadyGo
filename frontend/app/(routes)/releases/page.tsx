"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  useReleases,
  useCreateRelease,
  useUpdateRelease,
  useDeleteRelease,
} from "@/hooks/useReleases";
import { estimatesApi } from "@/lib/api/estimates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { ReleaseForm } from "@/components/releases/release-form";
import type { ReleaseCreate, ReleaseUpdate } from "@/types/release";
import { Input } from "@/components/ui/input";
import { highlightText } from "@/lib/utils/highlight";
import { useBillingTerms } from "@/hooks/useBillingTerms";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useRelease } from "@/hooks/useReleases";
import { ReleaseRelationships } from "@/components/releases/release-relationships";
import { Calculator } from "lucide-react";

export default function ReleasesPage() {
  const router = useRouter();
  const [skip, setSkip] = useState(0);
  const [limit] = useState(10);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRelease, setEditingRelease] = useState<string | null>(null);
  const [viewingRelease, setViewingRelease] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error, refetch } = useReleases({ skip, limit });
  const createRelease = useCreateRelease();
  const updateRelease = useUpdateRelease();
  const deleteRelease = useDeleteRelease();
  
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
  const handleOpenEstimate = async (releaseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Fetch estimates for this release
      const estimatesData = await estimatesApi.getEstimates({ release_id: releaseId });
      
      // Find the active estimate
      const activeEstimate = estimatesData.items?.find((est) => est.active_version === true);
      
      if (activeEstimate) {
        router.push(`/estimates/${activeEstimate.id}`);
      } else {
        alert("No active estimate found for this release");
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
    return data.items.filter((release) => {
      const name = (release.name || "").toLowerCase();
      const opportunity = (release.opportunity_name || release.opportunity_id || "").toLowerCase();
      const status = (release.status || "").toLowerCase();
      return (
        name.includes(query) ||
        opportunity.includes(query) ||
        status.includes(query)
      );
    });
  }, [data, searchQuery]);

  const handleCreate = async (data: ReleaseCreate | ReleaseUpdate) => {
    try {
      await createRelease.mutateAsync(data as ReleaseCreate);
      setIsCreateOpen(false);
      refetch();
    } catch (err) {
      console.error("Failed to create release:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUpdate = async (data: ReleaseCreate | ReleaseUpdate) => {
    if (!editingRelease) return;
    try {
      await updateRelease.mutateAsync({ id: editingRelease, data: data as ReleaseUpdate });
      setEditingRelease(null);
      refetch();
    } catch (err) {
      console.error("Failed to update release:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this release?")) {
      try {
        await deleteRelease.mutateAsync(id);
        refetch();
      } catch (err) {
        console.error("Failed to delete release:", err);
        alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  // Fetch release with relationships for editing
  const { data: editingReleaseData, refetch: refetchEditingRelease } = useRelease(
    editingRelease || "",
    true, // include relationships
    { enabled: !!editingRelease }
  );

  // Fetch release with relationships for viewing
  const { data: viewingReleaseData, refetch: refetchViewingRelease } = useRelease(
    viewingRelease || "",
    true, // include relationships
    { enabled: !!viewingRelease }
  );

  const releaseToEdit = editingReleaseData || (editingRelease
    ? data?.items.find((r) => r.id === editingRelease)
    : null);

  const releaseToView = viewingReleaseData || (viewingRelease
    ? data?.items.find((r) => r.id === viewingRelease)
    : null);

  // Helper function to get billing term name
  const getBillingTermName = (termId: string | undefined): string => {
    if (!termId) return "—";
    const term = billingTermsData?.items.find((t) => t.id === termId);
    return term?.name || releaseToView?.billing_term_name || termId;
  };

  // Helper function to get delivery center name
  const getDeliveryCenterName = (dcId: string | undefined): string => {
    if (!dcId) return "—";
    const dc = deliveryCentersData?.items.find((d) => d.id === dcId);
    return dc?.name || releaseToView?.delivery_center_name || dcId;
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Releases</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Manage opportunity releases and iterations
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">+ Add Release</Button>
      </div>

      {isLoading && <div className="text-gray-600">Loading releases...</div>}

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
                <CardTitle>Releases ({data?.total ?? 0})</CardTitle>
                <div className="w-full sm:w-64">
                  <Input
                    type="text"
                    placeholder="Search releases..."
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
                        {filteredItems.map((release) => (
                          <tr 
                            key={release.id} 
                            className="border-b hover:bg-gray-50 cursor-pointer"
                            onClick={() => setViewingRelease(release.id)}
                          >
                            <td className="p-3">{highlightText(release.opportunity_name || release.opportunity_id, searchQuery)}</td>
                            <td className="p-3 font-medium">{highlightText(release.name, searchQuery)}</td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-1 text-xs rounded ${
                                  release.status === "active"
                                    ? "bg-green-100 text-green-800"
                                    : release.status === "completed"
                                    ? "bg-blue-100 text-blue-800"
                                    : release.status === "on-hold"
                                    ? "bg-yellow-100 text-yellow-800"
                                    : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {highlightText(release.status, searchQuery)}
                              </span>
                            </td>
                            <td className="p-3">
                              {formatDate(release.start_date)}
                            </td>
                            <td className="p-3">
                              {formatDate(release.end_date)}
                            </td>
                            <td className="p-3">
                              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  title="Open Estimate"
                                  onClick={(e) => handleOpenEstimate(release.id, e)}
                                >
                                  <Calculator className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setViewingRelease(release.id)}
                                >
                                  View
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingRelease(release.id)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDelete(release.id)}
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
                      {filteredItems.map((release) => (
                        <Card 
                          key={release.id}
                          className="cursor-pointer"
                          onClick={() => setViewingRelease(release.id)}
                        >
                          <CardContent className="pt-6">
                            <div className="space-y-3">
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Opportunity
                                </div>
                                <div className="text-sm">{highlightText(release.opportunity_name || release.opportunity_id, searchQuery)}</div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Name
                                </div>
                                <div className="text-sm font-medium">{highlightText(release.name, searchQuery)}</div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Status
                                </div>
                                <span
                                  className={`px-2 py-1 text-xs rounded ${
                                    release.status === "active"
                                      ? "bg-green-100 text-green-800"
                                      : release.status === "completed"
                                      ? "bg-blue-100 text-blue-800"
                                      : release.status === "on-hold"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : "bg-gray-100 text-gray-800"
                                  }`}
                                >
                                  {highlightText(release.status, searchQuery)}
                                </span>
                              </div>
                            <div className="grid grid-cols-2 gap-2">
                              {release.start_date && (
                                <div>
                                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                    Start Date
                                  </div>
                                  <div className="text-sm">
                                    {formatDate(release.start_date)}
                                  </div>
                                </div>
                              )}
                              {release.end_date && (
                                <div>
                                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                    End Date
                                  </div>
                                  <div className="text-sm">
                                    {formatDate(release.end_date)}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                title="Open Estimate"
                                onClick={(e) => handleOpenEstimate(release.id, e)}
                              >
                                <Calculator className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setViewingRelease(release.id)}
                                className="flex-1"
                              >
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingRelease(release.id)}
                                className="flex-1"
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDelete(release.id)}
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
                        ? `No releases found matching "${searchQuery}"` 
                        : "No releases found."}
                    </p>
                    {!searchQuery.trim() && (
                      <Button
                        className="mt-4"
                        onClick={() => setIsCreateOpen(true)}
                      >
                        Create First Release
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
          <DialogTitle>Create New Release</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <ReleaseForm
            onSubmit={handleCreate}
            onCancel={() => setIsCreateOpen(false)}
            isLoading={createRelease.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      {viewingRelease && releaseToView && (
        <Dialog open={!!viewingRelease} onOpenChange={(open) => !open && setViewingRelease(null)}>
          <DialogHeader>
            <DialogTitle>Release Details</DialogTitle>
          </DialogHeader>
          <DialogContent className="max-h-[90vh] overflow-y-auto space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">Name</p>
              <p className="text-sm text-gray-700">{releaseToView.name}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Opportunity</p>
              <p className="text-sm text-gray-700">{releaseToView.opportunity_name || releaseToView.opportunity_id}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-800">Status</p>
                <p className="text-sm text-gray-700 capitalize">{releaseToView.status}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Default Currency</p>
                <p className="text-sm text-gray-700">{releaseToView.default_currency || "—"}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {releaseToView.start_date && (
                <div>
                  <p className="text-sm font-semibold text-gray-800">Start Date</p>
                  <p className="text-sm text-gray-700">
                    {formatDate(releaseToView.start_date)}
                  </p>
                </div>
              )}
              {releaseToView.end_date && (
                <div>
                  <p className="text-sm font-semibold text-gray-800">End Date</p>
                  <p className="text-sm text-gray-700">
                    {formatDate(releaseToView.end_date)}
                  </p>
                </div>
              )}
            </div>
            {releaseToView.description && (
              <div>
                <p className="text-sm font-semibold text-gray-800">Description</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{releaseToView.description}</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {releaseToView.budget && (
                <div>
                  <p className="text-sm font-semibold text-gray-800">Budget</p>
                  <p className="text-sm text-gray-700">{releaseToView.budget}</p>
                </div>
              )}
              {releaseToView.delivery_center_id && (
                <div>
                  <p className="text-sm font-semibold text-gray-800">Delivery Center</p>
                  <p className="text-sm text-gray-700">{getDeliveryCenterName(releaseToView.delivery_center_id)}</p>
                </div>
              )}
              {releaseToView.billing_term_id && (
                <div>
                  <p className="text-sm font-semibold text-gray-800">Billing Terms</p>
                  <p className="text-sm text-gray-700">{getBillingTermName(releaseToView.billing_term_id)}</p>
                </div>
              )}
            </div>
            
            {/* Relationships Section */}
            {viewingReleaseData && (
              <div className="pt-6 border-t mt-6">
                <ReleaseRelationships
                  release={viewingReleaseData}
                  onUpdate={async () => {
                    await refetchViewingRelease();
                    await refetch();
                  }}
                  readOnly={true}
                />
              </div>
            )}
            
            <div className="flex justify-end pt-4">
              <Button variant="outline" onClick={() => setViewingRelease(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Dialog */}
      {editingRelease && releaseToEdit && (
        <Dialog
          open={!!editingRelease}
          onOpenChange={(open) => !open && setEditingRelease(null)}
        >
          <DialogHeader>
            <DialogTitle>Edit Release</DialogTitle>
          </DialogHeader>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <ReleaseForm
              initialData={releaseToEdit}
              onSubmit={handleUpdate}
              onCancel={() => setEditingRelease(null)}
              isLoading={updateRelease.isPending}
            />
            
            {/* Relationships Section */}
            {editingReleaseData && (
              <div className="pt-6 border-t mt-6">
                <ReleaseRelationships
                  release={editingReleaseData}
                  onUpdate={async () => {
                    await refetchEditingRelease();
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

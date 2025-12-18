"use client";

import { useState, useMemo } from "react";
import {
  useEstimates,
  useEstimate,
  useCreateEstimate,
  useUpdateEstimate,
  useDeleteEstimate,
} from "@/hooks/useEstimates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { EstimateForm } from "@/components/estimates/estimate-form";
import type { EstimateCreate, EstimateUpdate } from "@/types/estimate";
import { Input } from "@/components/ui/input";
import { highlightText } from "@/lib/utils/highlight";
import { useReleases } from "@/hooks/useReleases";
import Link from "next/link";

export default function EstimatesPage() {
  const [skip] = useState(0);
  const [limit] = useState(10);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEstimate, setEditingEstimate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [releaseFilter, setReleaseFilter] = useState<string>("");

  const { data, isLoading, error, refetch } = useEstimates({
    skip,
    limit,
    release_id: releaseFilter || undefined,
  });
  const createEstimate = useCreateEstimate();
  const updateEstimate = useUpdateEstimate();
  const deleteEstimate = useDeleteEstimate();

  // Fetch releases for filter dropdown
  const { data: releasesData } = useReleases({ limit: 100 });

  const filteredItems = useMemo(() => {
    if (!data?.items || !searchQuery.trim()) {
      return data?.items || [];
    }
    const query = searchQuery.toLowerCase();
    return data.items.filter((estimate) => {
      const name = (estimate.name || "").toLowerCase();
      const release = (estimate.release_name || estimate.release_id || "").toLowerCase();
      const engagement = (estimate.engagement_name || estimate.engagement_id || "").toLowerCase();
      const status = (estimate.status || "").toLowerCase();
      return (
        name.includes(query) ||
        release.includes(query) ||
        engagement.includes(query) ||
        status.includes(query)
      );
    });
  }, [data, searchQuery]);

  const handleCreate = async (data: EstimateCreate | EstimateUpdate) => {
    try {
      await createEstimate.mutateAsync(data as EstimateCreate);
      setIsCreateOpen(false);
      refetch();
    } catch (err) {
      console.error("Failed to create estimate:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUpdate = async (data: EstimateCreate | EstimateUpdate) => {
    if (!editingEstimate) return;
    try {
      await updateEstimate.mutateAsync({ id: editingEstimate, data: data as EstimateUpdate });
      setEditingEstimate(null);
      refetch();
    } catch (err) {
      console.error("Failed to update estimate:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this estimate?")) {
      try {
        await deleteEstimate.mutateAsync(id);
        refetch();
      } catch (err) {
        console.error("Failed to delete estimate:", err);
        alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  // Fetch estimate for editing
  const { data: editingEstimateItem } = useEstimate(
    editingEstimate || "",
    false,
    { enabled: !!editingEstimate }
  );

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-red-600">
              Error loading estimates: {error instanceof Error ? error.message : String(error)}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Estimates</h1>
        <Button onClick={() => setIsCreateOpen(true)}>Create Estimate</Button>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search estimates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="w-64">
              <select
                value={releaseFilter}
                onChange={(e) => setReleaseFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">All Releases</option>
                {releasesData?.items?.map((release) => (
                  <option key={release.id} value={release.id}>
                    {release.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <p>Loading estimates...</p>
          </CardContent>
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-gray-500">No estimates found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((estimate) => (
            <Card key={estimate.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>
                      <Link
                        href={`/estimates/${estimate.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {highlightText(estimate.name, searchQuery)}
                      </Link>
                    </CardTitle>
                    <p className="text-sm text-gray-500 mt-1">
                      Release: {estimate.release_name || estimate.release_id}
                      {estimate.engagement_name && (
                        <> • Engagement: {estimate.engagement_name}</>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        estimate.status === "approved"
                          ? "bg-green-100 text-green-800"
                          : estimate.status === "submitted"
                          ? "bg-blue-100 text-blue-800"
                          : estimate.status === "rejected"
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {estimate.status}
                    </span>
                    <Button
                      onClick={() => setEditingEstimate(estimate.id)}
                      variant="outline"
                      size="sm"
                    >
                      Edit
                    </Button>
                    <Button
                      onClick={() => handleDelete(estimate.id)}
                      variant="outline"
                      size="sm"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {estimate.description && (
                  <p className="text-sm text-gray-600 mb-2">{estimate.description}</p>
                )}
                <div className="flex gap-4 text-sm text-gray-500">
                  <span>Currency: {estimate.currency}</span>
                  {estimate.phases && estimate.phases.length > 0 && (
                    <span>Phases: {estimate.phases.map(p => p.name).join(", ")}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogHeader>
          <DialogTitle>Create Estimate</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <EstimateForm
            onSubmit={handleCreate}
            onCancel={() => setIsCreateOpen(false)}
            isLoading={createEstimate.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingEstimate} onOpenChange={(open) => !open && setEditingEstimate(null)}>
        <DialogHeader>
          <DialogTitle>Edit Estimate</DialogTitle>
        </DialogHeader>
        <DialogContent>
          {editingEstimateItem && (
            <EstimateForm
              initialData={editingEstimateItem}
              onSubmit={handleUpdate}
              onCancel={() => setEditingEstimate(null)}
              isLoading={updateEstimate.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


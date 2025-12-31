"use client";

import { useState, useMemo } from "react";
import {
  useEstimates,
  useSetActiveVersion,
  useDeleteEstimate,
} from "@/hooks/useEstimates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { highlightText } from "@/lib/utils/highlight";
import { useReleases } from "@/hooks/useReleases";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Estimate } from "@/types/estimate";

export default function EstimatesPage() {
  const [skip] = useState(0);
  const [limit] = useState(1000); // Get all estimates to group properly
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  const { data, isLoading, error, refetch } = useEstimates({
    skip,
    limit,
  });
  const setActiveVersion = useSetActiveVersion();
  const deleteEstimate = useDeleteEstimate();

  const handleDelete = async (estimateId: string, estimateName: string) => {
    if (!confirm(`Are you sure you want to delete estimate "${estimateName}"?`)) {
      return;
    }
    
    try {
      await deleteEstimate.mutateAsync(estimateId);
      refetch();
    } catch (err) {
      console.error("Failed to delete estimate:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Fetch releases to get engagement and delivery center info
  const { data: releasesData } = useReleases({ limit: 1000 });

  // Group estimates by release
  const groupedByRelease = useMemo(() => {
    if (!data?.items || !releasesData?.items) return {};

    const grouped: Record<
      string,
      {
        release: {
          id: string;
          name: string;
          engagement_id?: string;
          engagement_name?: string;
          delivery_center_id?: string;
          delivery_center_name?: string;
        };
        estimates: Estimate[];
      }
    > = {};

    // Create a map of releases for quick lookup
    const releasesMap = new Map(
      releasesData.items.map((r) => [r.id, r])
    );

    // Group estimates by release_id
    data.items.forEach((estimate) => {
      const releaseId = estimate.release_id;
      if (!grouped[releaseId]) {
        const release = releasesMap.get(releaseId);
        if (release) {
          grouped[releaseId] = {
            release: {
              id: release.id,
              name: release.name,
              engagement_id: release.engagement_id,
              engagement_name: release.engagement_name,
              delivery_center_id: release.delivery_center_id,
              delivery_center_name: release.delivery_center_name,
            },
            estimates: [],
          };
        }
      }
      if (grouped[releaseId]) {
        grouped[releaseId].estimates.push(estimate);
      }
    });

    // Sort estimates within each release by name
    Object.values(grouped).forEach((group) => {
      group.estimates.sort((a, b) => a.name.localeCompare(b.name));
    });

    return grouped;
  }, [data, releasesData]);

  // Filter grouped data by search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) {
      return groupedByRelease;
    }

    const query = searchQuery.toLowerCase();
    const filtered: typeof groupedByRelease = {};

    Object.entries(groupedByRelease).forEach(([releaseId, group]) => {
      const releaseMatches =
        group.release.name.toLowerCase().includes(query) ||
        group.release.engagement_name?.toLowerCase().includes(query) ||
        group.release.delivery_center_name?.toLowerCase().includes(query);

      const matchingEstimates = group.estimates.filter(
        (estimate) =>
          estimate.name.toLowerCase().includes(query) ||
          estimate.description?.toLowerCase().includes(query)
      );

      if (releaseMatches || matchingEstimates.length > 0) {
        filtered[releaseId] = {
          ...group,
          estimates: releaseMatches ? group.estimates : matchingEstimates,
        };
      }
    });

    return filtered;
  }, [groupedByRelease, searchQuery]);

  const handleSetActive = async (estimateId: string) => {
    try {
      await setActiveVersion.mutateAsync(estimateId);
      refetch();
    } catch (err) {
      console.error("Failed to set active version:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-red-600">
              Error loading estimates:{" "}
              {error instanceof Error ? error.message : String(error)}
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
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by release, engagement, delivery center, or estimate name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
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
      ) : Object.keys(filteredGroups).length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-gray-500">No estimates found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.values(filteredGroups).map((group) => (
            <Card key={group.release.id}>
              <CardHeader>
                <CardTitle className="text-xl">
                  {highlightText(group.release.name, searchQuery)}
                </CardTitle>
                <div className="flex gap-4 text-sm text-gray-600 mt-2">
                  {group.release.engagement_name && (
                    <span>
                      <span className="font-semibold">Engagement:</span>{" "}
                      {group.release.engagement_name}
                    </span>
                  )}
                  {group.release.delivery_center_name && (
                    <span>
                      <span className="font-semibold">Delivery Center:</span>{" "}
                      {group.release.delivery_center_name}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {group.estimates.length === 0 ? (
                    <p className="text-sm text-gray-500">No estimates found.</p>
                  ) : (
                    <div className="space-y-2">
                      {group.estimates.map((estimate) => (
                        <div
                          key={estimate.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <Link
                              href={`/estimates/${estimate.id}`}
                              className="text-blue-600 hover:underline font-medium"
                            >
                              {highlightText(estimate.name, searchQuery)}
                            </Link>
                            {estimate.active_version ? (
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">
                                ACTIVE VERSION
                              </span>
                            ) : (
                              <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-semibold">
                                PENDING VERSION
                              </span>
                            )}
                            {estimate.description && (
                              <span className="text-sm text-gray-500">
                                {estimate.description}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {!estimate.active_version && (
                              <>
                                <Button
                                  onClick={() => handleSetActive(estimate.id)}
                                  variant="outline"
                                  size="sm"
                                  disabled={setActiveVersion.isPending}
                                >
                                  Set Active
                                </Button>
                                <Button
                                  onClick={() => handleDelete(estimate.id, estimate.name)}
                                  variant="outline"
                                  size="sm"
                                  disabled={deleteEstimate.isPending}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  {deleteEstimate.isPending ? "Deleting..." : "Delete"}
                                </Button>
                              </>
                            )}
                            <Button
                              onClick={() => router.push(`/estimates/${estimate.id}`)}
                              variant="outline"
                              size="sm"
                            >
                              Edit
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

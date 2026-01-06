"use client";

import { useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  useEstimates,
  useSetActiveVersion,
  useDeleteEstimate,
} from "@/hooks/useEstimates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { highlightText } from "@/lib/utils/highlight";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Lock, FileCheck, Calendar } from "lucide-react";
import type { Estimate } from "@/types/estimate";
import { OpportunityKPIs } from "@/components/estimates/opportunity-kpis";
import { GanttViewDialog } from "@/components/estimates/gantt-view-dialog";

function EstimatesPageContent() {
  const searchParams = useSearchParams();
  const [skip] = useState(0);
  const [limit] = useState(1000); // Get all estimates to group properly
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEstimateIds, setSelectedEstimateIds] = useState<Set<string>>(new Set());
  const [isGanttDialogOpen, setIsGanttDialogOpen] = useState(false);
  const router = useRouter();
  const opportunityIdFilter = searchParams.get("opportunity_id") || undefined;

  const { data, isLoading, error, refetch } = useEstimates({
    skip,
    limit,
    opportunity_id: opportunityIdFilter,
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

  // Fetch opportunities and delivery centers to get display info
  const { data: opportunitiesData } = useOpportunities({ limit: 1000 });
  const { data: deliveryCentersData } = useDeliveryCenters();

  // Group estimates by opportunity
  const groupedByOpportunity = useMemo(() => {
    if (!data?.items || !opportunitiesData?.items) return {};

    const grouped: Record<
      string,
      {
        opportunity: {
          id: string;
          name: string;
          account_name?: string;
          delivery_center_id?: string;
          delivery_center_name?: string;
        };
        estimates: Estimate[];
      }
    > = {};

    // Create a map of opportunities for quick lookup
    const opportunitiesMap = new Map(
      opportunitiesData.items.map((o) => [o.id, o])
    );

    // Helper to get delivery center name
    const getDeliveryCenterName = (dcId: string | undefined): string | undefined => {
      if (!dcId || !deliveryCentersData?.items) return undefined;
      const dc = deliveryCentersData.items.find(d => d.id === dcId);
      return dc?.name;
    };

    // Group estimates by opportunity_id
    data.items.forEach((estimate) => {
      const opportunityId = estimate.opportunity_id;
      if (!grouped[opportunityId]) {
        const opportunity = opportunitiesMap.get(opportunityId);
        if (opportunity) {
          grouped[opportunityId] = {
            opportunity: {
              id: opportunity.id,
              name: opportunity.name,
              account_name: opportunity.account_name,
              delivery_center_id: opportunity.delivery_center_id,
              delivery_center_name: getDeliveryCenterName(opportunity.delivery_center_id),
            },
            estimates: [],
          };
        }
      }
      if (grouped[opportunityId]) {
        grouped[opportunityId].estimates.push(estimate);
      }
    });

    // Sort estimates within each opportunity by name
    Object.values(grouped).forEach((group) => {
      group.estimates.sort((a, b) => a.name.localeCompare(b.name));
    });

    return grouped;
  }, [data, opportunitiesData, deliveryCentersData]);

  // Filter grouped data by search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) {
      return groupedByOpportunity;
    }

    const query = searchQuery.toLowerCase();
    const filtered: typeof groupedByOpportunity = {};

    Object.entries(groupedByOpportunity).forEach(([opportunityId, group]) => {
      const opportunityMatches =
        group.opportunity.name.toLowerCase().includes(query) ||
        group.opportunity.account_name?.toLowerCase().includes(query) ||
        group.opportunity.delivery_center_name?.toLowerCase().includes(query);

      const matchingEstimates = group.estimates.filter(
        (estimate) =>
          estimate.name.toLowerCase().includes(query) ||
          estimate.description?.toLowerCase().includes(query)
      );

      if (opportunityMatches || matchingEstimates.length > 0) {
        filtered[opportunityId] = {
          ...group,
          estimates: opportunityMatches ? group.estimates : matchingEstimates,
        };
      }
    });

    return filtered;
  }, [groupedByOpportunity, searchQuery]);

  const handleSetActive = async (estimateId: string) => {
    try {
      await setActiveVersion.mutateAsync(estimateId);
      refetch();
    } catch (err) {
      console.error("Failed to set active version:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Selection handlers
  const toggleEstimateSelection = (estimateId: string) => {
    setSelectedEstimateIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(estimateId)) {
        newSet.delete(estimateId);
      } else {
        newSet.add(estimateId);
      }
      return newSet;
    });
  };

  const selectAllEstimates = () => {
    if (!data?.items) return;
    const allIds = new Set(data.items.map((e) => e.id));
    setSelectedEstimateIds(allIds);
  };

  const clearSelection = () => {
    setSelectedEstimateIds(new Set());
  };

  const selectOpportunityEstimates = (opportunityId: string) => {
    if (!data?.items) return;
    const opportunityEstimates = data.items.filter((e) => e.opportunity_id === opportunityId);
    setSelectedEstimateIds((prev) => {
      const newSet = new Set(prev);
      opportunityEstimates.forEach((e) => newSet.add(e.id));
      return newSet;
    });
  };

  // Get all visible estimate IDs (for select all)
  const visibleEstimateIds = useMemo(() => {
    return Object.values(filteredGroups).flatMap((group) =>
      group.estimates.map((e) => e.id)
    );
  }, [filteredGroups]);

  const allVisibleSelected = useMemo(() => {
    return visibleEstimateIds.length > 0 && visibleEstimateIds.every((id) => selectedEstimateIds.has(id));
  }, [visibleEstimateIds, selectedEstimateIds]);

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
        <div className="flex items-center gap-4">
          {selectedEstimateIds.size > 0 && (
            <>
              <Badge variant="default" className="text-sm px-3 py-1">
                {selectedEstimateIds.size} selected
              </Badge>
              <Button
                onClick={() => setIsGanttDialogOpen(true)}
                variant="default"
                size="sm"
                className="flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                View Timeline
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <Input
                placeholder="Search by opportunity, account, invoice center, or estimate name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={allVisibleSelected ? clearSelection : selectAllEstimates}
                variant="outline"
                size="sm"
              >
                {allVisibleSelected ? "Clear All" : "Select All"}
              </Button>
              {selectedEstimateIds.size > 0 && (
                <Button onClick={clearSelection} variant="outline" size="sm">
                  Clear Selection
                </Button>
              )}
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
          {Object.values(filteredGroups).map((group) => {
            const opportunityEstimateIds = group.estimates.map((e) => e.id);
            const allOpportunitySelected = opportunityEstimateIds.length > 0 && opportunityEstimateIds.every((id) => selectedEstimateIds.has(id));
            const someOpportunitySelected = opportunityEstimateIds.some((id) => selectedEstimateIds.has(id));
            
            return (
              <div key={group.opportunity.id} className="flex gap-4">
                <Card className="flex-1">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-xl">
                          {highlightText(group.opportunity.name, searchQuery)}
                        </CardTitle>
                        <div className="flex gap-4 text-sm text-gray-600 mt-2">
                          {group.opportunity.account_name && (
                            <span>
                              <span className="font-semibold">Account:</span>{" "}
                              {group.opportunity.account_name}
                            </span>
                          )}
                          {group.opportunity.delivery_center_name && (
                            <span>
                              <span className="font-semibold">Invoice Center:</span>{" "}
                              {group.opportunity.delivery_center_name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={allOpportunitySelected}
                          onChange={() => {
                            if (allOpportunitySelected) {
                              // Deselect all in this opportunity
                              setSelectedEstimateIds((prev) => {
                                const newSet = new Set(prev);
                                opportunityEstimateIds.forEach((id) => newSet.delete(id));
                                return newSet;
                              });
                            } else {
                              // Select all in this opportunity
                              selectOpportunityEstimates(group.opportunity.id);
                            }
                          }}
                          aria-label={`Select all estimates for ${group.opportunity.name}`}
                          style={{
                            ...(someOpportunitySelected && !allOpportunitySelected
                              ? { opacity: 0.6 }
                              : {}),
                          }}
                        />
                        <span className="text-sm text-gray-600">Select opportunity</span>
                      </div>
                    </div>
                  </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {group.estimates.length === 0 ? (
                      <p className="text-sm text-gray-500">No estimates found.</p>
                    ) : (
                      <div className="space-y-2">
                        {group.estimates.map((estimate) => {
                          // Check if any estimate in this opportunity is locked (to disable Set Active for all)
                          const hasAnyLockedEstimate = group.estimates.some(e => e.is_locked);
                          
                          return (
                            <div
                              key={estimate.id}
                              className={`flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 ${
                                selectedEstimateIds.has(estimate.id) ? "bg-blue-50 border-blue-300" : ""
                              }`}
                            >
                              <div className="flex items-center gap-3 flex-1">
                                <Checkbox
                                  checked={selectedEstimateIds.has(estimate.id)}
                                  onChange={() => toggleEstimateSelection(estimate.id)}
                                  aria-label={`Select estimate ${estimate.name}`}
                                />
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
                                {estimate.is_locked && (
                                  <span className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-semibold">
                                    <Lock className="w-3 h-3" />
                                    LOCKED
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
                                      disabled={setActiveVersion.isPending || hasAnyLockedEstimate}
                                      title={hasAnyLockedEstimate ? "Cannot change active version while quote is active" : ""}
                                    >
                                      Set Active
                                    </Button>
                                    <Button
                                      onClick={() => handleDelete(estimate.id, estimate.name)}
                                      variant="outline"
                                      size="sm"
                                      disabled={deleteEstimate.isPending || estimate.is_locked}
                                      title={estimate.is_locked ? "Active estimate is locked by active quote" : ""}
                                      className="text-red-600 hover:text-red-700"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                                <Button
                                  onClick={() => router.push(`/estimates/${estimate.id}`)}
                                  variant="outline"
                                  size="sm"
                                  disabled={estimate.is_locked}
                                  title={estimate.is_locked ? "Active estimate is locked by active quote" : ""}
                                >
                                  Edit
                                </Button>
                                {estimate.is_locked && estimate.locked_by_quote_id && (
                                  <Link href={`/quotes/${estimate.locked_by_quote_id}`}>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      title="View Quote"
                                      className="text-green-600 hover:text-green-700"
                                    >
                                      <FileCheck className="w-4 h-4" />
                                    </Button>
                                  </Link>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              {/* KPIs Section */}
              <div className="w-64 flex-shrink-0">
                <Card className="h-full bg-green-50 border-green-200">
                  <CardContent className="p-4">
                    <OpportunityKPIs estimates={group.estimates} />
                  </CardContent>
                </Card>
              </div>
            </div>
            );
          })}
        </div>
      )}
      
      <GanttViewDialog
        open={isGanttDialogOpen}
        onOpenChange={setIsGanttDialogOpen}
        estimateIds={Array.from(selectedEstimateIds)}
      />
    </div>
  );
}

export default function EstimatesPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <EstimatesPageContent />
    </Suspense>
  );
}

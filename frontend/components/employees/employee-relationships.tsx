"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useLinkEmployeeToOpportunity,
  useUnlinkEmployeeFromOpportunity,
  useLinkEmployeeToRelease,
  useUnlinkEmployeeFromRelease,
} from "@/hooks/useEmployees";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useReleases } from "@/hooks/useReleases";
import { useRoles } from "@/hooks/useRoles";
import { useAccounts } from "@/hooks/useAccounts";
import { normalizeDateForInput } from "@/lib/utils";
import type { Employee } from "@/types/employee";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";

interface EmployeeRelationshipsProps {
  employee: Employee;
  onUpdate: () => void;
  readOnly?: boolean;
}

interface ReleaseFormData {
  release_id: string;
  role_id: string;
  start_date: string;
  end_date: string;
  project_rate: string;
  delivery_center: string;
}

interface LinkOpportunityFormData {
  releases: ReleaseFormData[]; // Each release has its own fields
}

interface LinkReleaseFormData {
  role_id: string;
  start_date: string;
  end_date: string;
  project_rate: string;
  delivery_center: string;
}

export function EmployeeRelationships({
  employee,
  onUpdate,
  readOnly = false,
}: EmployeeRelationshipsProps) {
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string>("");
  const [selectedReleaseId, setSelectedReleaseId] = useState<string>("");
  const [showReleaseForm, setShowReleaseForm] = useState<Record<string, boolean>>({});
  
  const [opportunityFormData, setOpportunityFormData] = useState<LinkOpportunityFormData>({
    releases: [],
  });
  
  const [releaseFormData, setReleaseFormData] = useState<LinkReleaseFormData>({
    role_id: "",
    start_date: "",
    end_date: "",
    project_rate: employee.external_bill_rate?.toString() || "",
    delivery_center: "",
  });

  const { data: opportunitiesData } = useOpportunities({ limit: 1000 });
  const { data: releasesData } = useReleases({ limit: 1000 });
  const { data: rolesData } = useRoles({ limit: 1000 });
  const { data: accountsData } = useAccounts({ limit: 1000 });
  const { data: deliveryCentersData } = useDeliveryCenters();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  const linkToOpportunity = useLinkEmployeeToOpportunity({
    onSuccess: async () => {
      setSelectedOpportunityId("");
      setOpportunityFormData({
        releases: [],
      });
      await new Promise(resolve => setTimeout(resolve, 100));
      await onUpdate();
    },
    onError: (error) => {
      console.error("Link opportunity error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes("Network error") && !errorMessage.includes("fetch")) {
        alert(`Failed to link opportunity: ${errorMessage}`);
      }
    },
  });

  const rolesForDeliveryCenter = (dc: string) =>
    rolesData?.items.filter((role) =>
      role.role_rates?.some((r) => r.delivery_center_code === dc)
    ) || [];

  const unlinkFromOpportunity = useUnlinkEmployeeFromOpportunity({
    onSuccess: async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      await onUpdate();
    },
    onError: (error) => {
      console.error("Unlink opportunity error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes("Network error") && !errorMessage.includes("fetch")) {
        alert(`Failed to unlink opportunity: ${errorMessage}`);
      }
    },
  });

  const linkToRelease = useLinkEmployeeToRelease({
    onSuccess: async () => {
      setSelectedReleaseId("");
      setShowReleaseForm({});
      setReleaseFormData({
        role_id: "",
        start_date: "",
        end_date: "",
        project_rate: employee.external_bill_rate?.toString() || "",
        delivery_center: "",
      });
      await new Promise(resolve => setTimeout(resolve, 100));
      await onUpdate();
    },
    onError: (error) => {
      console.error("Failed to link release:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to link release: ${errorMessage}`);
    },
  });

  const unlinkFromRelease = useUnlinkEmployeeFromRelease({
    onSuccess: () => {
      onUpdate();
    },
    onError: (error) => {
      console.error("Failed to unlink release:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to unlink release: ${errorMessage}`);
    },
  });

  const handleLinkOpportunity = async () => {
    if (!selectedOpportunityId) {
      alert("Please select an opportunity to link");
      return;
    }
    if (!opportunityFormData.releases || opportunityFormData.releases.length === 0) {
      alert("Please add at least one release with all required fields");
      return;
    }
    if (!employee?.id) {
      alert("Error: Employee ID is missing");
      return;
    }
    
    // Validate all releases have required fields
    for (const release of opportunityFormData.releases) {
      if (!release.role_id || !release.start_date || !release.end_date || !release.project_rate || !release.delivery_center) {
        alert(`Please fill in all required fields for release: Role, Start Date, End Date, Project Rate, and Delivery Center`);
        return;
      }
      const projectRate = parseFloat(release.project_rate);
      if (isNaN(projectRate) || projectRate < 0) {
        alert(`Please enter a valid project rate for release (must be a number >= 0)`);
        return;
      }
    }
    
    // Convert to API format
    const linkPayload = {
      releases: opportunityFormData.releases.map(r => ({
        release_id: r.release_id,
        role_id: r.role_id,
        start_date: r.start_date,
        end_date: r.end_date,
        project_rate: parseFloat(r.project_rate),
        delivery_center: r.delivery_center,
      })),
    };
    console.log("Linking opportunity with data:", linkPayload);
    
    try {
      await linkToOpportunity.mutateAsync({
        employeeId: employee.id,
        opportunityId: selectedOpportunityId,
        linkData: linkPayload,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("handleLinkOpportunity error:", err);
      console.error("Error details:", err);
      
      // Show detailed error message
      if (err instanceof Error && 'data' in err) {
        const errorData = (err as { data?: unknown }).data;
        console.error("Full error data:", errorData);
        
        // FastAPI validation errors are in errorData.detail array
        if (errorData && typeof errorData === 'object' && 'detail' in errorData) {
          const detail = (errorData as { detail?: unknown }).detail;
          if (Array.isArray(detail)) {
            const errorMessages = detail
              .map((d: { loc?: unknown[]; msg?: string }) => {
                const field = Array.isArray(d.loc) ? d.loc.slice(1).join('.') : 'unknown';
                return `${field}: ${d.msg || 'Unknown error'}`;
              })
              .join('\n');
            alert(`Validation error:\n${errorMessages}\n\nPayload sent:\n${JSON.stringify(linkPayload, null, 2)}`);
          } else if (typeof detail === 'string') {
            // Single error message
            alert(`Error: ${detail}\n\nPayload sent:\n${JSON.stringify(linkPayload, null, 2)}`);
          }
        } else if (errorData && typeof errorData === 'object' && 'error' in errorData) {
          const errorObj = (errorData as { error?: { details?: unknown } }).error;
          if (errorObj?.details) {
            const details = errorObj.details;
            const errorMessages = Array.isArray(details) 
              ? details.map((d: { loc?: unknown[]; msg?: string }) => `${Array.isArray(d.loc) ? d.loc.join('.') : 'unknown'}: ${d.msg || 'Unknown error'}`).join('\n')
              : JSON.stringify(details, null, 2);
            alert(`Validation error:\n${errorMessages}\n\nPayload sent:\n${JSON.stringify(linkPayload, null, 2)}`);
          }
        } else {
          alert(`Failed to link project: ${errorMessage}\n\nError data: ${JSON.stringify(errorData, null, 2)}\n\nPayload sent:\n${JSON.stringify(linkPayload, null, 2)}`);
        }
      } else if (!errorMessage.includes("Network error") && !errorMessage.includes("fetch")) {
        alert(`Failed to link project: ${errorMessage}\n\nPayload sent:\n${JSON.stringify(linkPayload, null, 2)}`);
      } else {
        console.warn("Network error during link (operation may have succeeded):", err);
        await onUpdate();
      }
    }
  };

  const handleUnlinkOpportunity = async (opportunityId: string) => {
    if (confirm("Are you sure you want to unlink this opportunity? This will also unlink all associated releases.")) {
      try {
        await unlinkFromOpportunity.mutateAsync({
          employeeId: employee.id,
          opportunityId,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (!errorMessage.includes("Network error") && !errorMessage.includes("fetch")) {
          console.error("Failed to unlink opportunity:", err);
          alert(`Error: ${errorMessage}`);
        } else {
          console.warn("Network error during unlink (operation may have succeeded):", err);
          await onUpdate();
        }
      }
    }
  };

  const handleLinkRelease = async (_projectId: string) => {
    if (!selectedReleaseId) {
      alert("Please select a release to link");
      return;
    }
    if (!releaseFormData.role_id || !releaseFormData.start_date || !releaseFormData.end_date || !releaseFormData.project_rate || !releaseFormData.delivery_center) {
      alert("Please fill in all required fields: Role, Start Date, End Date, Project Rate, and Delivery Center");
      return;
    }
    try {
      await linkToRelease.mutateAsync({
        employeeId: employee.id,
        releaseId: selectedReleaseId,
        linkData: {
          role_id: releaseFormData.role_id,
          start_date: releaseFormData.start_date,
          end_date: releaseFormData.end_date,
          project_rate: parseFloat(releaseFormData.project_rate),
          delivery_center: releaseFormData.delivery_center,
        },
      });
    } catch (err) {
      console.error("Failed to link release:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUnlinkRelease = async (releaseId: string) => {
    if (confirm("Are you sure you want to unlink this release?")) {
      try {
        await unlinkFromRelease.mutateAsync({
          employeeId: employee.id,
          releaseId,
        });
      } catch (err) {
        console.error("Failed to unlink release:", err);
        alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  // Group releases by opportunity
  const releasesByOpportunity = useMemo(() => {
    const grouped: Record<string, Array<{ id: string; name: string; opportunity_id: string }>> = {};
    if (employee.releases && Array.isArray(employee.releases) && employee.releases.length > 0) {
      employee.releases.forEach((release) => {
        if (release && release.opportunity_id) {
          const opportunityId = String(release.opportunity_id); // Ensure it's a string for comparison
          if (!grouped[opportunityId]) {
            grouped[opportunityId] = [];
          }
          grouped[opportunityId].push(release);
        }
      });
    }
    return grouped;
  }, [employee.releases]);

  // Get all unique opportunity IDs from releases (since every release belongs to an opportunity)
  const opportunityIdsFromReleases = useMemo(() => {
    const ids = new Set<string>();
    if (employee.releases && Array.isArray(employee.releases)) {
      employee.releases.forEach((release) => {
        if (release && release.opportunity_id) {
          ids.add(String(release.opportunity_id));
        }
      });
    }
    return Array.from(ids);
  }, [employee.releases]);

  const linkedOpportunityIds = new Set(employee.opportunities?.map((e) => String(e.id)) || []);
  const linkedReleaseIds = new Set(employee.releases?.map((r) => String(r.id)) || []);
  
  // Combine opportunity IDs from both direct links and releases
  const allOpportunityIds = useMemo(() => {
    const ids = new Set<string>();
    employee.opportunities?.forEach(e => ids.add(String(e.id)));
    opportunityIdsFromReleases.forEach(id => ids.add(id));
    return Array.from(ids);
  }, [employee.opportunities, opportunityIdsFromReleases]);

  const availableOpportunities =
    opportunitiesData?.items.filter((e) => {
      if (linkedOpportunityIds.has(e.id)) return false;
      if (selectedAccountId && e.account_id !== selectedAccountId) return false;
      return true;
    }) || [];

  return (
    <div className="space-y-6">
      {/* Opportunities Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Associated Opportunities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {allOpportunityIds.length > 0 ? (
            <div className="space-y-4">
              {allOpportunityIds.map((opportunityId) => {
                // Find opportunity from opportunitiesData (since releases always have an opportunity)
                const opportunity = opportunitiesData?.items.find(e => String(e.id) === opportunityId);
                if (!opportunity) return null;
                
                const isDirectlyLinked = linkedOpportunityIds.has(opportunityId);
                const opportunityReleases = releasesByOpportunity[opportunityId] || [];
                return (
                  <div
                    key={opportunityId}
                    className="border rounded-lg p-4 space-y-3 bg-gray-50"
                  >
                    {/* Opportunity Header */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <div className="flex-1">
                        <span
                          className="text-blue-600 font-semibold text-base cursor-default"
                          title={`Opportunity: ${opportunity.name}`}
                        >
                          {opportunity.name}
                        </span>
                        {!isDirectlyLinked && (
                          <span className="ml-2 text-xs text-gray-500">(via Release)</span>
                        )}
                      </div>
                      {!readOnly && isDirectlyLinked && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUnlinkOpportunity(opportunityId)}
                          disabled={unlinkFromOpportunity.isPending}
                          className="w-full sm:w-auto"
                        >
                          Unlink Opportunity
                        </Button>
                      )}
                    </div>

                    {/* Releases for this opportunity */}
                    {opportunityReleases.length > 0 ? (
                      <div className="ml-4 space-y-2">
                        <div className="text-sm font-medium text-gray-700">Associated Releases:</div>
                        {opportunityReleases.map((release) => {
                          const releaseData = employee.releases?.find(r => String(r.id) === String(release.id));
                          return (
                            <div
                              key={release.id}
                              className="flex flex-col gap-2 p-2 bg-white border rounded-md"
                            >
                              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                                <div className="flex-1">
                                  <span
                                    className="text-blue-600 font-medium text-sm cursor-default"
                                    title={`Release: ${release.name}`}
                                  >
                                    {release.name}
                                  </span>
                                  {/* Display association fields */}
                                  {releaseData && (
                                    <div className="mt-1 text-xs text-gray-600 space-y-1">
                                      {releaseData.role_name && (
                                        <div><strong>Role:</strong> {releaseData.role_name}</div>
                                      )}
                                      {releaseData.start_date && (
                                        <div><strong>Start Date:</strong> {normalizeDateForInput(releaseData.start_date)}</div>
                                      )}
                                      {releaseData.end_date && (
                                        <div><strong>End Date:</strong> {normalizeDateForInput(releaseData.end_date)}</div>
                                      )}
                                      {releaseData.project_rate !== undefined && (
                                        <div><strong>Project Rate:</strong> ${releaseData.project_rate.toFixed(2)}</div>
                                      )}
                                      {releaseData.delivery_center && (
                                        <div><strong>Delivery Center:</strong> {deliveryCentersData?.items.find(dc => dc.code === releaseData.delivery_center)?.name || releaseData.delivery_center}</div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                {!readOnly && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleUnlinkRelease(release.id)}
                                    disabled={unlinkFromRelease.isPending}
                                    className="w-full sm:w-auto text-red-600 hover:text-red-800"
                                  >
                                    Unlink
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="ml-4 text-sm text-gray-500">No releases associated with this opportunity</div>
                    )}

                    {/* Link Release for this opportunity */}
                    {!readOnly && (() => {
                      const availableReleasesForThisOpportunity = releasesData?.items.filter(
                        (r) => r.opportunity_id === opportunity.id && !linkedReleaseIds.has(r.id)
                      ) || [];
                      
                      if (availableReleasesForThisOpportunity.length === 0) {
                        return null;
                      }
                      
                      const showForm = showReleaseForm[opportunity.id] || false;
                      
                      return (
                        <div className="ml-4 space-y-3 pt-2 border-t">
                          {!showForm ? (
                            <Button
                              onClick={() => {
                                setShowReleaseForm({ ...showReleaseForm, [opportunity.id]: true });
                                // Reset form data with default project rate
                                setReleaseFormData({
                                  role_id: "",
                                  start_date: "",
                                  end_date: "",
                                  project_rate: employee.external_bill_rate?.toString() || "",
                                  delivery_center: "",
                                });
                              }}
                              variant="outline"
                              size="sm"
                              className="w-full sm:w-auto"
                            >
                              Link Release
                            </Button>
                          ) : (
                            <div className="space-y-3 p-3 bg-white border rounded-md">
                              <div className="text-sm font-medium mb-2">Link Release</div>
                              <Select
                                value={selectedReleaseId}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSelectedReleaseId(value);
                                  if (value) {
                                    // Opportunity selection handled by selectedOpportunityId
                                  }
                                }}
                                className="w-full"
                              >
                                <option value="">Select a release</option>
                                {availableReleasesForThisOpportunity.map((release) => (
                                  <option key={release.id} value={release.id}>
                                    {release.name}
                                  </option>
                                ))}
                              </Select>
                              
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <Label htmlFor={`release-delivery-center-${opportunity.id}`}>Delivery Center *</Label>
                                  <Select
                                    id={`release-delivery-center-${opportunity.id}`}
                                    value={releaseFormData.delivery_center}
                                    onChange={(e) => {
                                      const dc = e.target.value;
                                      setReleaseFormData({
                                        ...releaseFormData,
                                        delivery_center: dc,
                                        role_id: "",
                                      });
                                    }}
                                    className="w-full"
                                  >
                                    <option value="">Select delivery center</option>
                                    {deliveryCentersData?.items.map((dc) => (
                                      <option key={dc.code} value={dc.code}>
                                        {dc.name}
                                      </option>
                                    ))}
                                  </Select>
                                </div>
                                
                                <div>
                                  <Label htmlFor={`release-role-${opportunity.id}`}>Role *</Label>
                                  <Select
                                    id={`release-role-${opportunity.id}`}
                                    value={releaseFormData.role_id}
                                    onChange={(e) => setReleaseFormData({ ...releaseFormData, role_id: e.target.value })}
                                    className="w-full"
                                    disabled={!releaseFormData.delivery_center}
                                  >
                                    <option value="">Select role</option>
                                    {rolesForDeliveryCenter(releaseFormData.delivery_center).map((role) => (
                                      <option key={role.id} value={role.id}>
                                        {role.role_name}
                                      </option>
                                    ))}
                                  </Select>
                                </div>
                                
                                <div>
                                  <Label htmlFor={`release-start-date-${opportunity.id}`}>Start Date *</Label>
                                  <Input
                                    id={`release-start-date-${opportunity.id}`}
                                    type="date"
                                    value={releaseFormData.start_date}
                                    onChange={(e) => setReleaseFormData({ ...releaseFormData, start_date: e.target.value })}
                                    className="w-full"
                                  />
                                </div>
                                
                                <div>
                                  <Label htmlFor={`release-end-date-${opportunity.id}`}>End Date *</Label>
                                  <Input
                                    id={`release-end-date-${opportunity.id}`}
                                    type="date"
                                    value={releaseFormData.end_date}
                                    onChange={(e) => setReleaseFormData({ ...releaseFormData, end_date: e.target.value })}
                                    className="w-full"
                                  />
                                </div>
                                
                                <div className="sm:col-span-2">
                                  <Label htmlFor={`release-rate-${opportunity.id}`}>Project Rate *</Label>
                                  <Input
                                    id={`release-rate-${opportunity.id}`}
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={releaseFormData.project_rate}
                                    onChange={(e) => setReleaseFormData({ ...releaseFormData, project_rate: e.target.value })}
                                    className="w-full"
                                    placeholder="0.00"
                                  />
                                </div>
                              </div>
                              
                              <div className="flex gap-2">
                                <Button
                                  onClick={() => handleLinkRelease(opportunity.id)}
                                  disabled={!selectedReleaseId || !releaseFormData.role_id || !releaseFormData.start_date || !releaseFormData.end_date || !releaseFormData.project_rate || !releaseFormData.delivery_center || linkToRelease.isPending}
                                  size="sm"
                                  className="flex-1"
                                >
                                  {linkToRelease.isPending ? "Linking..." : "Link Release"}
                                </Button>
                                <Button
                                  onClick={() => {
                                    setShowReleaseForm({ ...showReleaseForm, [opportunity.id]: false });
                                    setSelectedReleaseId("");
                                    setReleaseFormData({
                                      role_id: "",
                                      start_date: "",
                                      end_date: "",
                                      project_rate: employee.external_bill_rate?.toString() || "",
                                      delivery_center: "",
                                    });
                                  }}
                                  variant="outline"
                                  size="sm"
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No opportunities associated</p>
          )}

          {/* Link New Opportunity */}
          {!readOnly && availableOpportunities.length > 0 && (
            <div className="pt-4 border-t space-y-3">
              <div className="text-sm font-semibold mb-3 text-gray-700">Link New Opportunity</div>
              
              <div className="space-y-3 p-3 bg-gray-50 border rounded-md">
                <div>
                  <Label htmlFor="account-select">Select Account *</Label>
                  <Select
                    id="account-select"
                    value={selectedAccountId}
                    onChange={(e) => {
                      setSelectedAccountId(e.target.value);
                      setSelectedOpportunityId("");
                    }}
                    className="w-full mt-1"
                  >
                    <option value="">Select an account</option>
                    {accountsData?.items.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.company_name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label htmlFor="opportunity-select">Select Opportunity *</Label>
                  <Select
                    id="opportunity-select"
                    value={selectedOpportunityId}
                    onChange={(e) => setSelectedOpportunityId(e.target.value)}
                    className="w-full mt-1"
                    disabled={!selectedAccountId}
                  >
                    <option value="">Select an opportunity to link</option>
                    {availableOpportunities.map((opportunity) => (
                      <option key={opportunity.id} value={opportunity.id}>
                        {opportunity.name}
                      </option>
                    ))}
                  </Select>
                </div>
                
                {selectedOpportunityId && (
                  <>
                    <div className="text-sm font-medium mb-3 text-gray-700">
                      Opportunity: {opportunitiesData?.items.find(e => e.id === selectedOpportunityId)?.name}
                    </div>
                    
                    {/* Releases for this opportunity - each with its own fields */}
                    <div className="space-y-4">
                      <div className="text-sm font-semibold text-gray-700 mb-2">
                        Releases * (Add at least one release with all fields)
                      </div>
                      
                      {releasesData?.items
                        .filter((r) => r.opportunity_id === selectedOpportunityId)
                        .map((release) => {
                          const releaseFormIndex = opportunityFormData.releases.findIndex(r => r.release_id === release.id);
                          const releaseForm = releaseFormIndex >= 0 ? opportunityFormData.releases[releaseFormIndex] : null;
                          
                          return (
                            <div key={release.id} className="border rounded-lg p-4 bg-white space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-sm">{release.name}</div>
                                {releaseForm ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setOpportunityFormData({
                                        releases: opportunityFormData.releases.filter(r => r.release_id !== release.id),
                                      });
                                    }}
                                    className="text-red-600 hover:text-red-800"
                                  >
                                    Remove
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setOpportunityFormData({
                                        releases: [
                                          ...opportunityFormData.releases,
                                          {
                                            release_id: release.id,
                                            role_id: "",
                                            start_date: "",
                                            end_date: "",
                                            project_rate: employee.external_bill_rate?.toString() || "",
                                            delivery_center: "",
                                          },
                                        ],
                                      });
                                    }}
                                  >
                                    Add Release
                                  </Button>
                                )}
                              </div>
                              
                              {releaseForm && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                                  <div>
                                    <Label htmlFor={`release-delivery-center-${release.id}`}>Delivery Center *</Label>
                                    <Select
                                      id={`release-delivery-center-${release.id}`}
                                      value={releaseForm.delivery_center}
                                      onChange={(e) => {
                                        const dc = e.target.value;
                                        const updated = [...opportunityFormData.releases];
                                        updated[releaseFormIndex] = { ...releaseForm, delivery_center: dc, role_id: "" };
                                        setOpportunityFormData({ releases: updated });
                                      }}
                                      className="w-full"
                                      required
                                    >
                                      <option value="">Select delivery center</option>
                                      {deliveryCentersData?.items.map((dc) => (
                                        <option key={dc.code} value={dc.code}>
                                          {dc.name}
                                        </option>
                                      ))}
                                    </Select>
                                  </div>

                                  <div>
                                    <Label htmlFor={`release-role-${release.id}`}>Role *</Label>
                                    <Select
                                      id={`release-role-${release.id}`}
                                      value={releaseForm.role_id}
                                      onChange={(e) => {
                                        const updated = [...opportunityFormData.releases];
                                        updated[releaseFormIndex] = { ...releaseForm, role_id: e.target.value };
                                        setOpportunityFormData({ releases: updated });
                                      }}
                                      className="w-full"
                                      required
                                      disabled={!releaseForm.delivery_center}
                                    >
                                      <option value="">Select role</option>
                                      {rolesForDeliveryCenter(releaseForm.delivery_center).map((role) => (
                                        <option key={role.id} value={role.id}>
                                          {role.role_name}
                                        </option>
                                      ))}
                                    </Select>
                                  </div>
                                  
                                  <div>
                                    <Label htmlFor={`release-start-date-${release.id}`}>Start Date *</Label>
                                    <Input
                                      id={`release-start-date-${release.id}`}
                                      type="date"
                                      value={releaseForm.start_date}
                                      onChange={(e) => {
                                        const updated = [...opportunityFormData.releases];
                                        updated[releaseFormIndex] = { ...releaseForm, start_date: e.target.value };
                                        setOpportunityFormData({ releases: updated });
                                      }}
                                      className="w-full"
                                      required
                                    />
                                  </div>
                                  
                                  <div>
                                    <Label htmlFor={`release-end-date-${release.id}`}>End Date *</Label>
                                    <Input
                                      id={`release-end-date-${release.id}`}
                                      type="date"
                                      value={releaseForm.end_date}
                                      onChange={(e) => {
                                        const updated = [...opportunityFormData.releases];
                                        updated[releaseFormIndex] = { ...releaseForm, end_date: e.target.value };
                                        setOpportunityFormData({ releases: updated });
                                      }}
                                      className="w-full"
                                      required
                                    />
                                  </div>
                                  
                                  <div className="sm:col-span-2">
                                    <Label htmlFor={`release-rate-${release.id}`}>Project Rate ($) *</Label>
                                    <Input
                                      id={`release-rate-${release.id}`}
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={releaseForm.project_rate}
                                      onChange={(e) => {
                                        const updated = [...opportunityFormData.releases];
                                        updated[releaseFormIndex] = { ...releaseForm, project_rate: e.target.value };
                                        setOpportunityFormData({ releases: updated });
                                      }}
                                      className="w-full"
                                      placeholder="0.00"
                                      required
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      
                      {releasesData?.items.filter((r) => r.opportunity_id === selectedOpportunityId).length === 0 && (
                        <div className="text-sm text-gray-500 italic p-2">No releases available for this opportunity</div>
                      )}
                    </div>
                    
                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={handleLinkOpportunity}
                        disabled={
                          !selectedAccountId ||
                          !selectedOpportunityId ||
                          !opportunityFormData.releases ||
                          opportunityFormData.releases.length === 0 ||
                          linkToOpportunity.isPending
                        }
                        className="flex-1"
                      >
                        {linkToOpportunity.isPending ? "Linking..." : "Link Opportunity"}
                      </Button>
                      <Button
                        onClick={() => {
                          setSelectedOpportunityId("");
                          setOpportunityFormData({
                            releases: [],
                          });
                        }}
                        variant="outline"
                      >
                        Clear
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

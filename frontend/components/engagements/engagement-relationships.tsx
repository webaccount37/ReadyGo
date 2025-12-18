"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useLinkEmployeeToRelease,
  useUnlinkEmployeeFromRelease,
} from "@/hooks/useEmployees";
import { useReleases, useCreateRelease, useUpdateRelease } from "@/hooks/useReleases";
import { useEmployees } from "@/hooks/useEmployees";
import { useRoles } from "@/hooks/useRoles";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { normalizeDateForInput } from "@/lib/utils";
import type { Engagement } from "@/types/engagement";

interface EngagementRelationshipsProps {
  engagement: Engagement;
  onUpdate: () => void;
  readOnly?: boolean;
}

interface ReleaseFormData {
  release_id?: string; // undefined if creating new
  name: string; // required for new releases
  start_date?: string; // optional for new releases
  end_date?: string; // optional for new releases
}

interface LinkEmployeeFormData {
  employee_id: string;
  release_id: string;
  role_id: string;
  start_date: string;
  end_date: string;
  project_rate: string;
  delivery_center: string;
}

export function EngagementRelationships({
  engagement,
  onUpdate,
  readOnly = false,
}: EngagementRelationshipsProps) {
  const [showReleaseForm, setShowReleaseForm] = useState(false);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [selectedReleaseForEmployee, setSelectedReleaseForEmployee] = useState<string | null>(null);
  const employeeFormRef = useRef<HTMLDivElement>(null);
  
  const [releaseFormData, setReleaseFormData] = useState<ReleaseFormData>({
    release_id: undefined,
    name: "",
    start_date: normalizeDateForInput(engagement.start_date),
    end_date: normalizeDateForInput(engagement.end_date),
  });
  
  const [employeeFormData, setEmployeeFormData] = useState<LinkEmployeeFormData>({
    employee_id: "",
    release_id: "",
    role_id: "",
    start_date: "",
    end_date: "",
    project_rate: "",
    delivery_center: "",
  });

  // Use releases from engagement relationships if available, otherwise fetch separately
  const { data: releasesData, refetch: refetchReleases } = useReleases({ 
    engagement_id: engagement.id,
    limit: 1000 
  });
  // Fetch all releases for selection (not filtered by engagement)
  const { data: allReleasesData } = useReleases({ limit: 1000 });
  const { data: employeesData } = useEmployees({ limit: 1000 });
  const { data: rolesData } = useRoles({ limit: 1000 });
  const { data: deliveryCentersData } = useDeliveryCenters();
  
  // Debug: Log engagement data to see what we're receiving
  useEffect(() => {
    console.log("Engagement Relationships - Engagement data:", {
      id: engagement.id,
      name: engagement.name,
      hasReleases: !!engagement.releases,
      releasesCount: engagement.releases?.length || 0,
      releases: engagement.releases?.map(r => ({
        id: r.id,
        name: r.name,
        engagement_id: r.engagement_id,
        engagement_id_matches: r.engagement_id === engagement.id,
        employees_count: (r as any).employees?.length || 0,
      })),
    });
    
    // Also log releasesData for comparison
    if (releasesData?.items) {
      console.log("Engagement Relationships - ReleasesData:", {
        total: releasesData.items.length,
        filtered_by_engagement: releasesData.items.filter(r => r.engagement_id === engagement.id).length,
        releases: releasesData.items.map(r => ({
          id: r.id,
          name: r.name,
          engagement_id: r.engagement_id,
          engagement_id_matches: r.engagement_id === engagement.id,
        })),
      });
    }
  }, [engagement, releasesData]);
  
  const createRelease = useCreateRelease({
    onSuccess: async (newRelease) => {
      // After creating release, reset form and close
      setReleaseFormData({
        release_id: undefined,
        name: "",
        start_date: normalizeDateForInput(engagement.start_date),
        end_date: normalizeDateForInput(engagement.end_date),
      });
      await refetchReleases();
      setShowReleaseForm(false);
      await new Promise(resolve => setTimeout(resolve, 100));
      await onUpdate();
    },
  });

  const updateRelease = useUpdateRelease({
    onSuccess: async () => {
      // After updating release to link it, reset form and close
      setReleaseFormData({
        release_id: undefined,
        name: "",
        start_date: normalizeDateForInput(engagement.start_date),
        end_date: normalizeDateForInput(engagement.end_date),
      });
      await refetchReleases();
      setShowReleaseForm(false);
      await new Promise(resolve => setTimeout(resolve, 100));
      await onUpdate();
    },
  });

  const linkToRelease = useLinkEmployeeToRelease({
    onSuccess: async () => {
      setEmployeeFormData({
        employee_id: "",
        release_id: "",
        role_id: "",
        start_date: "",
        end_date: "",
        project_rate: "",
        delivery_center: "",
      });
      setShowEmployeeForm(false);
      setSelectedReleaseForEmployee(null);
      await new Promise(resolve => setTimeout(resolve, 100));
      await onUpdate();
    },
    onError: (error) => {
      console.error("Link employee to release error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes("Network error") && !errorMessage.includes("fetch")) {
        alert(`Failed to link employee: ${errorMessage}`);
      }
    },
  });

  const unlinkFromRelease = useUnlinkEmployeeFromRelease({
    onSuccess: async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      await onUpdate();
    },
    onError: (error) => {
      console.error("Unlink employee from release error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes("Network error") && !errorMessage.includes("fetch")) {
        alert(`Failed to unlink employee: ${errorMessage}`);
      }
    },
  });

  const rolesForDeliveryCenter = (dc: string) =>
    rolesData?.items.filter((role) =>
      role.role_rates?.some((r) => r.delivery_center_code === dc)
    ) || [];

  // Get employees linked to this engagement (through engagement associations)
  // Note: This would come from the engagement data if include_relationships is true
  // For now, we'll display employees as they're linked through releases

  const handleCreateOrSelectRelease = async () => {
    if (!releaseFormData.name && !releaseFormData.release_id) {
      alert("Please either create a new release (enter name) or select an existing release");
      return;
    }

    // If creating new release, create it first
    if (!releaseFormData.release_id && releaseFormData.name) {
      try {
        await createRelease.mutateAsync({
          name: releaseFormData.name,
          engagement_id: engagement.id,
          start_date: releaseFormData.start_date || engagement.start_date,
          end_date: releaseFormData.end_date || engagement.end_date,
          status: "planning",
        });
        // Form will be reset and closed in onSuccess callback
      } catch (err) {
        console.error("Failed to create release:", err);
        alert(`Error creating release: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (releaseFormData.release_id) {
      // If selecting existing release, check if it's already linked to this engagement
      const selectedRelease = allReleasesData?.items.find(r => r.id === releaseFormData.release_id);
      
      if (!selectedRelease) {
        alert("Selected release not found");
        return;
      }

      // If release already belongs to this engagement, we're done
      if (selectedRelease.engagement_id === engagement.id) {
        setReleaseFormData({
          release_id: undefined,
          name: "",
          start_date: engagement.start_date || "",
          end_date: engagement.end_date || "",
        });
        setShowReleaseForm(false);
        await refetchReleases();
        await new Promise(resolve => setTimeout(resolve, 100));
        await onUpdate();
        return;
      }

      // Otherwise, update the release to link it to this engagement
      try {
        await updateRelease.mutateAsync({
          id: releaseFormData.release_id,
          data: {
            engagement_id: engagement.id,
          },
        });
        // Form will be reset and closed in onSuccess callback
      } catch (err) {
        console.error("Failed to link release:", err);
        alert(`Error linking release: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const handleLinkEmployeeToRelease = (releaseId: string) => {
    const selectedRelease = engagement.releases?.find(r => r.id === releaseId) 
      || releasesData?.items.find(r => r.id === releaseId && r.engagement_id === engagement.id);
    
    setSelectedReleaseForEmployee(releaseId);
    setEmployeeFormData({
      employee_id: "",
      release_id: releaseId,
      role_id: "",
      start_date: normalizeDateForInput(selectedRelease?.start_date || engagement.start_date),
      end_date: normalizeDateForInput(selectedRelease?.end_date || engagement.end_date),
      project_rate: "",
      delivery_center: "",
    });
    setShowEmployeeForm(true);
    
    // Scroll to the form after a brief delay to ensure it's rendered
    setTimeout(() => {
      employeeFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Focus the first input field
      const firstInput = employeeFormRef.current?.querySelector('select, input') as HTMLElement;
      firstInput?.focus();
    }, 100);
  };

  const handleLinkEmployee = async () => {
    if (!employeeFormData.employee_id || !employeeFormData.release_id) {
      alert("Please select an employee and release");
      return;
    }

    if (!employeeFormData.role_id || !employeeFormData.start_date || !employeeFormData.end_date || !employeeFormData.project_rate || !employeeFormData.delivery_center) {
      alert("Please fill in all required fields: Role, Start Date, End Date, Project Rate, and Delivery Center");
      return;
    }

    try {
      await linkToRelease.mutateAsync({
        employeeId: employeeFormData.employee_id,
        releaseId: employeeFormData.release_id,
        linkData: {
          role_id: employeeFormData.role_id,
          start_date: employeeFormData.start_date,
          end_date: employeeFormData.end_date,
          project_rate: parseFloat(employeeFormData.project_rate),
          delivery_center: employeeFormData.delivery_center,
        },
      });
    } catch (err) {
      console.error("Failed to link employee:", err);
    }
  };

  // Note: Unlinking functionality can be added later when displaying linked employees
  // For now, employees are linked through releases, so they can be unlinked via the release

  return (
    <div className="space-y-6">
      {/* Releases Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Associated Releases</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Only use releases from engagement.releases (which includes employees) */}
          {/* Only fallback to releasesData if engagement.releases is not available */}
          {((engagement.releases && engagement.releases.length > 0) || (releasesData?.items && releasesData.items.length > 0)) ? (
            <div className="space-y-4">
              {/* Prioritize engagement.releases if available, otherwise use releasesData but filter by engagement_id */}
              {/* IMPORTANT: Always filter by engagement_id to ensure data integrity */}
              {((engagement.releases && engagement.releases.length > 0) 
                ? engagement.releases.filter(r => {
                    // Strict filtering: only include releases that belong to this engagement
                    const matches = r.engagement_id === engagement.id;
                    if (!matches) {
                      console.warn(`[FILTER] Excluding release ${r.id} (${r.name}) - engagement_id ${r.engagement_id} != ${engagement.id}`);
                    }
                    return matches;
                  })
                : (releasesData?.items || []).filter(r => {
                    const matches = r.engagement_id === engagement.id;
                    if (!matches) {
                      console.warn(`[FILTER] Excluding release ${r.id} (${r.name}) from releasesData - engagement_id ${r.engagement_id} != ${engagement.id}`);
                    }
                    return matches;
                  })
              ).map((release) => {
                // Double-check that this release belongs to this engagement
                if (release.engagement_id !== engagement.id) {
                  console.error(`[ERROR] Release ${release.id} (${release.name}) does not belong to engagement ${engagement.id} (${engagement.name})`);
                  return null;
                }
                
                // If release comes from engagement.releases, it has employees embedded
                // IMPORTANT: Filter employees to ensure they're actually linked to THIS release
                const releaseFromEngagement = engagement.releases?.find(r => r.id === release.id && r.engagement_id === engagement.id);
                let releaseEmployees: any[] = [];
                if (releaseFromEngagement && 'employees' in releaseFromEngagement) {
                  releaseEmployees = (releaseFromEngagement.employees || []).filter((emp: any) => {
                    // Additional safety: verify employee is actually linked to this release
                    // We can't verify this directly from the frontend, but we trust the backend
                    // The backend safety checks should have filtered this already
                    return true;
                  });
                  console.log(`[DEBUG] Release ${release.id} (${release.name}) has ${releaseEmployees.length} employees from engagement.releases`);
                } else {
                  console.log(`[DEBUG] Release ${release.id} (${release.name}) not found in engagement.releases, using empty employee list`);
                }
                
                // Skip if release doesn't belong to this engagement (shouldn't happen after filtering, but safety check)
                if (!release || release.engagement_id !== engagement.id) {
                  return null;
                }
                
                return (
                  <div
                    key={release.id}
                    className="border rounded-lg p-4 space-y-3 bg-gray-50"
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <div className="flex-1">
                        <span
                          className="text-blue-600 font-semibold text-base cursor-default"
                          title={`Release: ${release.name}`}
                        >
                          {release.name}
                        </span>
                        {release.start_date && (
                          <div className="text-sm text-gray-600 mt-1">
                            {new Date(release.start_date).toLocaleDateString()} - {release.end_date ? new Date(release.end_date).toLocaleDateString() : "Ongoing"}
                          </div>
                        )}
                      </div>
                      {!readOnly && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleLinkEmployeeToRelease(release.id)}
                            className="w-full sm:w-auto"
                          >
                            + Link Employee
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              // TODO: Implement release deletion or unlinking
                              alert("Release unlinking not yet implemented");
                            }}
                            className="w-full sm:w-auto"
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    {/* Show employees linked to this release */}
                    {releaseEmployees.length > 0 && (
                      <div className="ml-4 mt-2 space-y-2">
                        <div className="text-xs font-medium text-gray-600">Employees on this release:</div>
                        {releaseEmployees.map((employee) => {
                          // Log dates for debugging (similar to Quotes page)
                          if (employee.start_date && employee.end_date) {
                            const startDateStr = normalizeDateForInput(employee.start_date);
                            const endDateStr = normalizeDateForInput(employee.end_date);
                            console.log(`[EngagementRelationships ${release.id}-${employee.id}] Received dates:`, {
                              raw_start_date: employee.start_date,
                              raw_end_date: employee.end_date,
                              parsed_start_date: startDateStr,
                              parsed_end_date: endDateStr,
                            });
                          }
                          return (
                            <div
                              key={`${release.id}-${employee.id}`}
                              className="flex flex-col gap-1 p-2 bg-white border rounded-md text-xs"
                            >
                              <span className="text-blue-600 font-medium">
                                {employee.first_name} {employee.last_name} ({employee.email})
                              </span>
                              {employee.role_name && (
                                <span className="text-gray-600">Role: {employee.role_name}</span>
                              )}
                              {employee.start_date && employee.end_date && (
                                <span className="text-gray-600">
                                  Dates: {normalizeDateForInput(employee.start_date)} - {normalizeDateForInput(employee.end_date)}
                                </span>
                              )}
                              {employee.project_rate !== undefined && employee.project_rate !== null && (
                                <span className="text-gray-600">Rate: ${employee.project_rate.toFixed(2)}</span>
                              )}
                              {employee.delivery_center && (
                                <span className="text-gray-600">
                                  Delivery Center: {deliveryCentersData?.items.find(dc => dc.code === employee.delivery_center)?.name || employee.delivery_center}
                                </span>
                              )}
                              {!readOnly && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={async () => {
                                    if (confirm("Are you sure you want to unlink this employee from the release?")) {
                                      try {
                                        await unlinkFromRelease.mutateAsync({
                                          employeeId: employee.id,
                                          releaseId: release.id,
                                        });
                                      } catch (err) {
                                        console.error("Failed to unlink employee:", err);
                                      }
                                    }
                                  }}
                                  disabled={unlinkFromRelease.isPending}
                                  className="w-full sm:w-auto text-red-600 hover:text-red-800 mt-1"
                                >
                                  Unlink
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Show employee form inline under this release when selected */}
                    {!readOnly && showEmployeeForm && selectedReleaseForEmployee === release.id && (
                      <div ref={employeeFormRef} className="mt-4 pt-4 border-t space-y-3">
                        <div className="space-y-3 p-3 bg-blue-50 border-2 border-blue-200 rounded-md">
                          <div className="text-sm font-medium mb-2">
                            Link Employee to Release: <span className="text-blue-700 font-semibold">{release.name}</span>
                          </div>
                          
                          <div>
                            <Label>Select Employee *</Label>
                            <Select
                              value={employeeFormData.employee_id}
                              onChange={(e) => {
                                const selectedEmployeeId = e.target.value;
                                const selectedEmployee = employeesData?.items.find(emp => emp.id === selectedEmployeeId);
                                
                                setEmployeeFormData({
                                  ...employeeFormData,
                                  employee_id: selectedEmployeeId,
                                  // Default delivery center to employee's delivery center if available
                                  delivery_center: selectedEmployee?.delivery_center || employeeFormData.delivery_center,
                                  // Default project rate to employee's external bill rate if available
                                  project_rate: selectedEmployee?.external_bill_rate 
                                    ? selectedEmployee.external_bill_rate.toString() 
                                    : employeeFormData.project_rate,
                                  // Clear role_id when delivery center changes
                                  role_id: selectedEmployee?.delivery_center !== employeeFormData.delivery_center ? "" : employeeFormData.role_id,
                                });
                              }}
                              className="w-full mt-1"
                            >
                              <option value="">Select an employee</option>
                              {employeesData?.items.map((employee) => (
                                <option key={employee.id} value={employee.id}>
                                  {employee.first_name} {employee.last_name} ({employee.email})
                                </option>
                              ))}
                            </Select>
                          </div>

                          {/* Required fields */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <Label>Delivery Center *</Label>
                              <Select
                                value={employeeFormData.delivery_center}
                                onChange={(e) => {
                                  const dc = e.target.value;
                                  setEmployeeFormData({
                                    ...employeeFormData,
                                    delivery_center: dc,
                                    role_id: "",
                                  });
                                }}
                                className="w-full mt-1"
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
                              <Label>Role *</Label>
                              <Select
                                value={employeeFormData.role_id}
                                onChange={(e) => setEmployeeFormData({ ...employeeFormData, role_id: e.target.value })}
                                className="w-full mt-1"
                                disabled={!employeeFormData.delivery_center}
                              >
                                <option value="">Select role</option>
                                {rolesForDeliveryCenter(employeeFormData.delivery_center).map((role) => (
                                  <option key={role.id} value={role.id}>
                                    {role.role_name}
                                  </option>
                                ))}
                              </Select>
                            </div>

                            <div>
                              <Label>Start Date *</Label>
                              <Input
                                type="date"
                                value={employeeFormData.start_date}
                                onChange={(e) => setEmployeeFormData({ ...employeeFormData, start_date: e.target.value })}
                                className="w-full mt-1"
                              />
                            </div>

                            <div>
                              <Label>End Date *</Label>
                              <Input
                                type="date"
                                value={employeeFormData.end_date}
                                onChange={(e) => setEmployeeFormData({ ...employeeFormData, end_date: e.target.value })}
                                className="w-full mt-1"
                              />
                            </div>

                            <div className="sm:col-span-2">
                              <Label>Project Rate ($) *</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={employeeFormData.project_rate}
                                onChange={(e) => setEmployeeFormData({ ...employeeFormData, project_rate: e.target.value })}
                                className="w-full mt-1"
                                placeholder="0.00"
                              />
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <Button
                              onClick={handleLinkEmployee}
                              disabled={
                                !employeeFormData.employee_id ||
                                !employeeFormData.release_id ||
                                !employeeFormData.role_id ||
                                !employeeFormData.start_date ||
                                !employeeFormData.end_date ||
                                !employeeFormData.project_rate ||
                                !employeeFormData.delivery_center ||
                                linkToRelease.isPending
                              }
                              size="sm"
                              className="flex-1"
                            >
                              {linkToRelease.isPending ? "Linking..." : "Link Employee"}
                            </Button>
                            <Button
                              onClick={() => {
                                setShowEmployeeForm(false);
                                setSelectedReleaseForEmployee(null);
                                setEmployeeFormData({
                                  employee_id: "",
                                  release_id: "",
                                  role_id: "",
                                  start_date: "",
                                  end_date: "",
                                  project_rate: "",
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No releases associated</p>
          )}

          {/* Link/Create Release */}
          {!readOnly && (
            <div className="pt-4 border-t space-y-3">
              {!showReleaseForm ? (
                <Button
                  onClick={() => setShowReleaseForm(true)}
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  + Add Release
                </Button>
              ) : (
                <div className="space-y-3 p-3 bg-gray-50 border rounded-md">
                  <div className="text-sm font-medium mb-2">Add Release</div>
                  
                  {/* Option to create new or select existing */}
                  <div>
                    <Label>Release Name (for new release) *</Label>
                    <Input
                      type="text"
                      value={releaseFormData.name}
                      onChange={(e) => setReleaseFormData({ ...releaseFormData, name: e.target.value, release_id: undefined })}
                      placeholder="Enter release name to create new"
                      className="w-full mt-1"
                    />
                  </div>
                  
                  <div className="text-sm text-gray-600 text-center">OR</div>
                  
                  <div>
                    <Label>Select Existing Release</Label>
                    <Select
                      value={releaseFormData.release_id || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Find release from all releases
                        const selectedRelease = allReleasesData?.items.find(r => r.id === value);
                        setReleaseFormData({ 
                          ...releaseFormData, 
                          release_id: value || undefined,
                          name: value ? (selectedRelease?.name || "") : "",
                          start_date: normalizeDateForInput(selectedRelease?.start_date || engagement.start_date),
                          end_date: normalizeDateForInput(selectedRelease?.end_date || engagement.end_date),
                        });
                      }}
                      className="w-full mt-1"
                    >
                      <option value="">Select an existing release</option>
                      {/* Show all releases, but indicate which ones are already linked */}
                      {(allReleasesData?.items || []).map((release) => {
                        const isAlreadyLinked = release.engagement_id === engagement.id;
                        return (
                          <option key={release.id} value={release.id}>
                            {release.name}{isAlreadyLinked ? " (already linked)" : ""}
                          </option>
                        );
                      })}
                    </Select>
                  </div>

                  {/* Optional fields for new release */}
                  {!releaseFormData.release_id && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label>Start Date (optional)</Label>
                        <Input
                          type="date"
                          value={releaseFormData.start_date}
                          onChange={(e) => setReleaseFormData({ ...releaseFormData, start_date: e.target.value })}
                          className="w-full mt-1"
                        />
                      </div>

                      <div>
                        <Label>End Date (optional)</Label>
                        <Input
                          type="date"
                          value={releaseFormData.end_date}
                          onChange={(e) => setReleaseFormData({ ...releaseFormData, end_date: e.target.value })}
                          className="w-full mt-1"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={handleCreateOrSelectRelease}
                      disabled={
                        (!releaseFormData.name && !releaseFormData.release_id) ||
                        createRelease.isPending ||
                        updateRelease.isPending
                      }
                      size="sm"
                      className="flex-1"
                    >
                      {createRelease.isPending || updateRelease.isPending 
                        ? (createRelease.isPending ? "Creating..." : "Linking...") 
                        : "Link Release"}
                    </Button>
                    <Button
                      onClick={() => {
                        setShowReleaseForm(false);
                        setReleaseFormData({
                          release_id: undefined,
                          name: "",
                          start_date: engagement.start_date || "",
                          end_date: engagement.end_date || "",
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
          )}
        </CardContent>
      </Card>

      {/* Employees Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Associated Employees</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Employees are linked through releases, not directly to engagements */}
          {/* Summary: Show count of employees linked through releases */}
          {engagement.releases && engagement.releases.some(r => r.employees && r.employees.length > 0) ? (
            <div className="text-sm text-gray-600">
              {engagement.releases.reduce((total, r) => total + (r.employees?.length || 0), 0)} employee(s) linked through releases (shown above under each release)
            </div>
          ) : (
            <p className="text-sm text-gray-500">No employees associated. Employees must be linked through releases.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


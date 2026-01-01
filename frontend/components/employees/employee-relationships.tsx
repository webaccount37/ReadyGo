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
  useLinkEmployeeToEngagement,
  useUnlinkEmployeeFromEngagement,
} from "@/hooks/useEmployees";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useEngagements } from "@/hooks/useEngagements";
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

interface EngagementFormData {
  engagement_id: string;
  role_id: string;
  start_date: string;
  end_date: string;
  project_rate: string;
  delivery_center: string;
}

interface LinkOpportunityFormData {
  engagements: EngagementFormData[]; // Each engagement has its own fields
}

interface LinkEngagementFormData {
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
  const [selectedEngagementId, setSelectedEngagementId] = useState<string>("");
  const [showEngagementForm, setShowEngagementForm] = useState<Record<string, boolean>>({});
  
  const [opportunityFormData, setOpportunityFormData] = useState<LinkOpportunityFormData>({
    engagements: [],
  });
  
  const [engagementFormData, setEngagementFormData] = useState<LinkEngagementFormData>({
    role_id: "",
    start_date: "",
    end_date: "",
    project_rate: employee.external_bill_rate?.toString() || "",
    delivery_center: "",
  });

  const { data: opportunitiesData } = useOpportunities({ limit: 1000 });
  const { data: engagementsData } = useEngagements({ limit: 1000 });
  const { data: rolesData } = useRoles({ limit: 1000 });
  const { data: accountsData } = useAccounts({ limit: 1000 });
  const { data: deliveryCentersData } = useDeliveryCenters();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  const linkToOpportunity = useLinkEmployeeToOpportunity({
    onSuccess: async () => {
      setSelectedOpportunityId("");
      setOpportunityFormData({
        engagements: [],
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

  const linkToEngagement = useLinkEmployeeToEngagement({
    onSuccess: async () => {
      setSelectedEngagementId("");
      setShowEngagementForm({});
      setEngagementFormData({
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
      console.error("Failed to link engagement:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to link engagement: ${errorMessage}`);
    },
  });

  const unlinkFromEngagement = useUnlinkEmployeeFromEngagement({
    onSuccess: () => {
      onUpdate();
    },
    onError: (error) => {
      console.error("Failed to unlink engagement:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to unlink engagement: ${errorMessage}`);
    },
  });

  const handleLinkOpportunity = async () => {
    if (!selectedOpportunityId) {
      alert("Please select an opportunity to link");
      return;
    }
    if (!opportunityFormData.engagements || opportunityFormData.engagements.length === 0) {
      alert("Please add at least one engagement with all required fields");
      return;
    }
    if (!employee?.id) {
      alert("Error: Employee ID is missing");
      return;
    }
    
    // Validate all engagements have required fields
    for (const engagement of opportunityFormData.engagements) {
      if (!engagement.role_id || !engagement.start_date || !engagement.end_date || !engagement.project_rate || !engagement.delivery_center) {
        alert(`Please fill in all required fields for engagement: Role, Start Date, End Date, Project Rate, and Delivery Center`);
        return;
      }
      const projectRate = parseFloat(engagement.project_rate);
      if (isNaN(projectRate) || projectRate < 0) {
        alert(`Please enter a valid project rate for engagement (must be a number >= 0)`);
        return;
      }
    }
    
    // Convert to API format
    const linkPayload = {
      engagements: opportunityFormData.engagements.map(r => ({
        engagement_id: r.engagement_id,
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
    if (confirm("Are you sure you want to unlink this opportunity? This will also unlink all associated engagements.")) {
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

  const handleLinkEngagement = async (_projectId: string) => {
    if (!selectedEngagementId) {
      alert("Please select an engagement to link");
      return;
    }
    if (!engagementFormData.role_id || !engagementFormData.start_date || !engagementFormData.end_date || !engagementFormData.project_rate || !engagementFormData.delivery_center) {
      alert("Please fill in all required fields: Role, Start Date, End Date, Project Rate, and Delivery Center");
      return;
    }
    try {
      await linkToEngagement.mutateAsync({
        employeeId: employee.id,
        engagementId: selectedEngagementId,
        linkData: {
          role_id: engagementFormData.role_id,
          start_date: engagementFormData.start_date,
          end_date: engagementFormData.end_date,
          project_rate: parseFloat(engagementFormData.project_rate),
          delivery_center: engagementFormData.delivery_center,
        },
      });
    } catch (err) {
      console.error("Failed to link engagement:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUnlinkEngagement = async (engagementId: string) => {
    if (confirm("Are you sure you want to unlink this engagement?")) {
      try {
        await unlinkFromEngagement.mutateAsync({
          employeeId: employee.id,
          engagementId,
        });
      } catch (err) {
        console.error("Failed to unlink engagement:", err);
        alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  // Group engagements by opportunity
  const engagementsByOpportunity = useMemo(() => {
    const grouped: Record<string, Array<{ id: string; name: string; opportunity_id: string }>> = {};
    if (employee.engagements && Array.isArray(employee.engagements) && employee.engagements.length > 0) {
      employee.engagements.forEach((engagement) => {
        if (engagement && engagement.opportunity_id) {
          const opportunityId = String(engagement.opportunity_id); // Ensure it's a string for comparison
          if (!grouped[opportunityId]) {
            grouped[opportunityId] = [];
          }
          grouped[opportunityId].push(engagement);
        }
      });
    }
    return grouped;
  }, [employee.engagements]);

  // Get all unique opportunity IDs from engagements (since every engagement belongs to an opportunity)
  const opportunityIdsFromEngagements = useMemo(() => {
    const ids = new Set<string>();
    if (employee.engagements && Array.isArray(employee.engagements)) {
      employee.engagements.forEach((engagement) => {
        if (engagement && engagement.opportunity_id) {
          ids.add(String(engagement.opportunity_id));
        }
      });
    }
    return Array.from(ids);
  }, [employee.engagements]);

  const linkedOpportunityIds = new Set(employee.opportunities?.map((e) => String(e.id)) || []);
  const linkedEngagementIds = new Set(employee.engagements?.map((r) => String(r.id)) || []);
  
  // Combine opportunity IDs from both direct links and engagements
  const allOpportunityIds = useMemo(() => {
    const ids = new Set<string>();
    employee.opportunities?.forEach(e => ids.add(String(e.id)));
    opportunityIdsFromEngagements.forEach(id => ids.add(id));
    return Array.from(ids);
  }, [employee.opportunities, opportunityIdsFromEngagements]);

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
                // Find opportunity from opportunitiesData (since engagements always have an opportunity)
                const opportunity = opportunitiesData?.items.find(e => String(e.id) === opportunityId);
                if (!opportunity) return null;
                
                const isDirectlyLinked = linkedOpportunityIds.has(opportunityId);
                const opportunityEngagements = engagementsByOpportunity[opportunityId] || [];
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
                          <span className="ml-2 text-xs text-gray-500">(via Engagement)</span>
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

                    {/* Engagements for this opportunity */}
                    {opportunityEngagements.length > 0 ? (
                      <div className="ml-4 space-y-2">
                        <div className="text-sm font-medium text-gray-700">Associated Engagements:</div>
                        {opportunityEngagements.map((engagement) => {
                          const engagementData = employee.engagements?.find(e => String(e.id) === String(engagement.id));
                          return (
                            <div
                              key={engagement.id}
                              className="flex flex-col gap-2 p-2 bg-white border rounded-md"
                            >
                              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                                <div className="flex-1">
                                  <span
                                    className="text-blue-600 font-medium text-sm cursor-default"
                                    title={`Engagement: ${engagement.name}`}
                                  >
                                    {engagement.name}
                                  </span>
                                  {/* Display association fields */}
                                  {engagementData && (
                                    <div className="mt-1 text-xs text-gray-600 space-y-1">
                                      {engagementData.role_name && (
                                        <div><strong>Role:</strong> {engagementData.role_name}</div>
                                      )}
                                      {engagementData.start_date && (
                                        <div><strong>Start Date:</strong> {normalizeDateForInput(engagementData.start_date)}</div>
                                      )}
                                      {engagementData.end_date && (
                                        <div><strong>End Date:</strong> {normalizeDateForInput(engagementData.end_date)}</div>
                                      )}
                                      {engagementData.project_rate !== undefined && (
                                        <div><strong>Project Rate:</strong> ${engagementData.project_rate.toFixed(2)}</div>
                                      )}
                                      {engagementData.delivery_center && (
                                        <div><strong>Delivery Center:</strong> {deliveryCentersData?.items.find(dc => dc.code === engagementData.delivery_center)?.name || engagementData.delivery_center}</div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                {!readOnly && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleUnlinkEngagement(engagement.id)}
                                    disabled={unlinkFromEngagement.isPending}
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
                      <div className="ml-4 text-sm text-gray-500">No engagements associated with this opportunity</div>
                    )}

                    {/* Link Release for this opportunity */}
                    {!readOnly && (() => {
                      const availableEngagementsForThisOpportunity = engagementsData?.items.filter(
                        (r) => r.opportunity_id === opportunity.id && !linkedEngagementIds.has(r.id)
                      ) || [];
                      
                      if (availableEngagementsForThisOpportunity.length === 0) {
                        return null;
                      }
                      
                      const showForm = showEngagementForm[opportunity.id] || false;
                      
                      return (
                        <div className="ml-4 space-y-3 pt-2 border-t">
                          {!showForm ? (
                            <Button
                              onClick={() => {
                                setShowEngagementForm({ ...showEngagementForm, [opportunity.id]: true });
                                // Reset form data with default project rate
                                setEngagementFormData({
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
                              Link Engagement
                            </Button>
                          ) : (
                            <div className="space-y-3 p-3 bg-white border rounded-md">
                              <div className="text-sm font-medium mb-2">Link Engagement</div>
                              <Select
                                value={selectedEngagementId}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSelectedEngagementId(value);
                                  if (value) {
                                    // Opportunity selection handled by selectedOpportunityId
                                  }
                                }}
                                className="w-full"
                              >
                                <option value="">Select an engagement</option>
                                {availableEngagementsForThisOpportunity.map((engagement) => (
                                  <option key={engagement.id} value={engagement.id}>
                                    {engagement.name}
                                  </option>
                                ))}
                              </Select>
                              
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <Label htmlFor={`engagement-delivery-center-${opportunity.id}`}>Delivery Center *</Label>
                                  <Select
                                    id={`engagement-delivery-center-${opportunity.id}`}
                                    value={engagementFormData.delivery_center}
                                    onChange={(e) => {
                                      const dc = e.target.value;
                                      setEngagementFormData({
                                        ...engagementFormData,
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
                                  <Label htmlFor={`engagement-role-${opportunity.id}`}>Role *</Label>
                                  <Select
                                    id={`engagement-role-${opportunity.id}`}
                                    value={engagementFormData.role_id}
                                    onChange={(e) => setEngagementFormData({ ...engagementFormData, role_id: e.target.value })}
                                    className="w-full"
                                    disabled={!engagementFormData.delivery_center}
                                  >
                                    <option value="">Select role</option>
                                    {rolesForDeliveryCenter(engagementFormData.delivery_center).map((role) => (
                                      <option key={role.id} value={role.id}>
                                        {role.role_name}
                                      </option>
                                    ))}
                                  </Select>
                                </div>
                                
                                <div>
                                  <Label htmlFor={`engagement-start-date-${opportunity.id}`}>Start Date *</Label>
                                  <Input
                                    id={`engagement-start-date-${opportunity.id}`}
                                    type="date"
                                    value={engagementFormData.start_date}
                                    onChange={(e) => setEngagementFormData({ ...engagementFormData, start_date: e.target.value })}
                                    className="w-full"
                                  />
                                </div>
                                
                                <div>
                                  <Label htmlFor={`engagement-end-date-${opportunity.id}`}>End Date *</Label>
                                  <Input
                                    id={`engagement-end-date-${opportunity.id}`}
                                    type="date"
                                    value={engagementFormData.end_date}
                                    onChange={(e) => setEngagementFormData({ ...engagementFormData, end_date: e.target.value })}
                                    className="w-full"
                                  />
                                </div>
                                
                                <div className="sm:col-span-2">
                                  <Label htmlFor={`engagement-rate-${opportunity.id}`}>Project Rate *</Label>
                                  <Input
                                    id={`engagement-rate-${opportunity.id}`}
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={engagementFormData.project_rate}
                                    onChange={(e) => setEngagementFormData({ ...engagementFormData, project_rate: e.target.value })}
                                    className="w-full"
                                    placeholder="0.00"
                                  />
                                </div>
                              </div>
                              
                              <div className="flex gap-2">
                                <Button
                                  onClick={() => handleLinkEngagement(opportunity.id)}
                                  disabled={!selectedEngagementId || !engagementFormData.role_id || !engagementFormData.start_date || !engagementFormData.end_date || !engagementFormData.project_rate || !engagementFormData.delivery_center || linkToEngagement.isPending}
                                  size="sm"
                                  className="flex-1"
                                >
                                  {linkToEngagement.isPending ? "Linking..." : "Link Engagement"}
                                </Button>
                                <Button
                                  onClick={() => {
                                    setShowEngagementForm({ ...showEngagementForm, [opportunity.id]: false });
                                    setSelectedEngagementId("");
                                    setEngagementFormData({
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
                    
                    {/* Engagements for this opportunity - each with its own fields */}
                    <div className="space-y-4">
                      <div className="text-sm font-semibold text-gray-700 mb-2">
                        Engagements * (Add at least one engagement with all fields)
                      </div>
                      
                      {engagementsData?.items
                        .filter((e) => e.opportunity_id === selectedOpportunityId)
                        .map((engagement) => {
                          const engagementFormIndex = opportunityFormData.engagements.findIndex(e => e.engagement_id === engagement.id);
                          const engagementForm = engagementFormIndex >= 0 ? opportunityFormData.engagements[engagementFormIndex] : null;
                          
                          return (
                            <div key={engagement.id} className="border rounded-lg p-4 bg-white space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-sm">{engagement.name}</div>
                                {engagementForm ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setOpportunityFormData({
                                        engagements: opportunityFormData.engagements.filter(e => e.engagement_id !== engagement.id),
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
                                        engagements: [
                                          ...opportunityFormData.engagements,
                                          {
                                            engagement_id: engagement.id,
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
                                    Add Engagement
                                  </Button>
                                )}
                              </div>
                              
                              {engagementForm && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                                  <div>
                                    <Label htmlFor={`engagement-delivery-center-${engagement.id}`}>Delivery Center *</Label>
                                    <Select
                                      id={`engagement-delivery-center-${engagement.id}`}
                                      value={engagementForm.delivery_center}
                                      onChange={(e) => {
                                        const dc = e.target.value;
                                        const updated = [...opportunityFormData.engagements];
                                        updated[engagementFormIndex] = { ...engagementForm, delivery_center: dc, role_id: "" };
                                        setOpportunityFormData({ engagements: updated });
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
                                    <Label htmlFor={`engagement-role-${engagement.id}`}>Role *</Label>
                                    <Select
                                      id={`engagement-role-${engagement.id}`}
                                      value={engagementForm.role_id}
                                      onChange={(e) => {
                                        const updated = [...opportunityFormData.engagements];
                                        updated[engagementFormIndex] = { ...engagementForm, role_id: e.target.value };
                                        setOpportunityFormData({ engagements: updated });
                                      }}
                                      className="w-full"
                                      required
                                      disabled={!engagementForm.delivery_center}
                                    >
                                      <option value="">Select role</option>
                                      {rolesForDeliveryCenter(engagementForm.delivery_center).map((role) => (
                                        <option key={role.id} value={role.id}>
                                          {role.role_name}
                                        </option>
                                      ))}
                                    </Select>
                                  </div>
                                  
                                  <div>
                                    <Label htmlFor={`engagement-start-date-${engagement.id}`}>Start Date *</Label>
                                    <Input
                                      id={`engagement-start-date-${engagement.id}`}
                                      type="date"
                                      value={engagementForm.start_date}
                                      onChange={(e) => {
                                        const updated = [...opportunityFormData.engagements];
                                        updated[engagementFormIndex] = { ...engagementForm, start_date: e.target.value };
                                        setOpportunityFormData({ engagements: updated });
                                      }}
                                      className="w-full"
                                      required
                                    />
                                  </div>
                                  
                                  <div>
                                    <Label htmlFor={`engagement-end-date-${engagement.id}`}>End Date *</Label>
                                    <Input
                                      id={`engagement-end-date-${engagement.id}`}
                                      type="date"
                                      value={engagementForm.end_date}
                                      onChange={(e) => {
                                        const updated = [...opportunityFormData.engagements];
                                        updated[engagementFormIndex] = { ...engagementForm, end_date: e.target.value };
                                        setOpportunityFormData({ engagements: updated });
                                      }}
                                      className="w-full"
                                      required
                                    />
                                  </div>
                                  
                                  <div className="sm:col-span-2">
                                    <Label htmlFor={`engagement-rate-${engagement.id}`}>Project Rate ($) *</Label>
                                    <Input
                                      id={`engagement-rate-${engagement.id}`}
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={engagementForm.project_rate}
                                      onChange={(e) => {
                                        const updated = [...opportunityFormData.engagements];
                                        updated[engagementFormIndex] = { ...engagementForm, project_rate: e.target.value };
                                        setOpportunityFormData({ engagements: updated });
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
                      
                      {engagementsData?.items.filter((e) => e.opportunity_id === selectedOpportunityId).length === 0 && (
                        <div className="text-sm text-gray-500 italic p-2">No engagements available for this opportunity</div>
                      )}
                    </div>
                    
                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={handleLinkOpportunity}
                        disabled={
                          !selectedAccountId ||
                          !selectedOpportunityId ||
                          !opportunityFormData.engagements ||
                          opportunityFormData.engagements.length === 0 ||
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
                            engagements: [],
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

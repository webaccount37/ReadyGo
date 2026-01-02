"use client";

import { useState, useMemo, useEffect } from "react";
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
  useEmployee,
} from "@/hooks/useEmployees";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useEngagements } from "@/hooks/useEngagements";
import { useRoles, useRole } from "@/hooks/useRoles";
import { useAccounts } from "@/hooks/useAccounts";
import { useCurrencyRates } from "@/hooks/useCurrencyRates";
import { normalizeDateForInput } from "@/lib/utils";
import { convertCurrency, setCurrencyRates } from "@/lib/utils/currency";
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
  project_cost: string;
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
  project_cost: string;
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
    project_cost: employee.internal_cost_rate?.toString() || "",
    delivery_center: "",
  });

  const { data: opportunitiesData } = useOpportunities({ limit: 1000 });
  const { data: engagementsData } = useEngagements({ limit: 1000 });
  const { data: rolesData } = useRoles({ limit: 1000 });
  const { data: accountsData } = useAccounts({ limit: 1000 });
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: currencyRatesData } = useCurrencyRates({ limit: 1000 });
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  
  // Update currency rates cache when rates are fetched
  useEffect(() => {
    if (currencyRatesData?.items) {
      const rates: Record<string, number> = {};
      currencyRatesData.items.forEach((rate) => {
        rates[rate.currency_code.toUpperCase()] = rate.rate_to_usd;
      });
      setCurrencyRates(rates);
    }
  }, [currencyRatesData]);
  
  // Get selected role and employee data for auto-fill (for direct engagement linking)
  const { data: selectedRoleData } = useRole(
    engagementFormData.role_id || "",
    false,
    {
      enabled: !!engagementFormData.role_id && !!selectedEngagementId,
    }
  );
  const { data: selectedEmployeeData } = useEmployee(
    employee?.id || "",
    false,
    {
      enabled: !!employee?.id,
    }
  );
  const selectedEngagement = useMemo(() => {
    return selectedEngagementId 
      ? engagementsData?.items.find(e => e.id === selectedEngagementId)
      : null;
  }, [selectedEngagementId, engagementsData?.items]);

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

  // Get delivery center code from engagement's delivery_center_id (Invoice Center)
  const getInvoiceCenterCodeForEngagement = (engagementId: string): string | null => {
    if (!engagementId || !engagementsData?.items || !deliveryCentersData?.items) return null;
    const engagement = engagementsData.items.find(e => e.id === engagementId);
    if (!engagement?.delivery_center_id) return null;
    const invoiceCenter = deliveryCentersData.items.find(dc => dc.id === engagement.delivery_center_id);
    return invoiceCenter?.code || null;
  };

  const rolesForInvoiceCenter = (engagementId: string) => {
    const invoiceCenterCode = getInvoiceCenterCodeForEngagement(engagementId);
    if (!invoiceCenterCode) return [];
    return rolesData?.items.filter((role) =>
      role.role_rates?.some((r) => r.delivery_center_code === invoiceCenterCode)
    ) || [];
  };

  // Auto-fill Project Rate when Role changes (for direct engagement linking) - Rate always comes from Role
  useEffect(() => {
    if (!engagementFormData.role_id || !selectedEngagementId || !selectedEngagement) {
      return;
    }

    if (!selectedEngagement.delivery_center_id) return;

    // Wait for selectedRoleData to load - this is critical for the effect to work
    if (!selectedRoleData) return;

    // Find the role rate that matches engagement delivery center and currency
    const matchingRate = selectedRoleData.role_rates?.find(
      (rate) =>
        String(rate.delivery_center_id) === String(selectedEngagement.delivery_center_id) &&
        rate.default_currency === (selectedEngagement.default_currency || "USD")
    );

    let newRate: string;

    if (matchingRate) {
      newRate = String(matchingRate.external_rate || "0");
    } else {
      // Fallback to role default rate if no matching rate found
      newRate = String(selectedRoleData.role_external_rate || "0");
    }

    // Update Project Rate only (Rate always comes from Role)
    setEngagementFormData((prev) => ({
      ...prev,
      project_rate: newRate,
    }));
  }, [engagementFormData.role_id, selectedEngagementId, selectedRoleData, selectedEngagement]);

  // Auto-fill Project Cost when Employee or Engagement changes (for direct engagement linking) - Cost always comes from Employee
  useEffect(() => {
    if (!employee?.id || !selectedEmployeeData || !selectedEngagement) {
      return;
    }

    // Get employee's delivery center ID from code
    const employeeDeliveryCenterId = selectedEmployeeData.delivery_center 
      ? deliveryCentersData?.items.find(dc => dc.code === selectedEmployeeData.delivery_center)?.id
      : null;
    
    // Compare Engagement Invoice Center with Employee Delivery Center
    const centersMatch = selectedEngagement.delivery_center_id && employeeDeliveryCenterId 
      ? selectedEngagement.delivery_center_id === employeeDeliveryCenterId
      : false;

    // Determine which rate to use and whether to convert currency
    let employeeCost: number;
    const employeeCurrency = selectedEmployeeData.default_currency || "USD";
    const engagementCurrency = selectedEngagement.default_currency || "USD";

    if (centersMatch) {
      // Centers match: use internal_cost_rate with NO currency conversion
      employeeCost = selectedEmployeeData.internal_cost_rate || 0;
    } else {
      // Centers don't match: use internal_bill_rate with currency conversion
      employeeCost = selectedEmployeeData.internal_bill_rate || 0;
      
      // Convert to Engagement Invoice Center Currency if different
      if (employeeCurrency.toUpperCase() !== engagementCurrency.toUpperCase()) {
        employeeCost = convertCurrency(employeeCost, employeeCurrency, engagementCurrency);
      }
    }

    setEngagementFormData((prev) => ({
      ...prev,
      project_cost: String(employeeCost),
    }));
  }, [employee?.id, selectedEmployeeData, selectedEngagement, deliveryCentersData]);

  // Auto-fill for Opportunity form engagements: Project Cost with currency conversion and default dates when engagement is added
  useEffect(() => {
    if (!selectedEmployeeData || !opportunityFormData.engagements.length || !engagementsData?.items) {
      return;
    }

    // Get employee's delivery center ID from code
    const employeeDeliveryCenterId = selectedEmployeeData.delivery_center 
      ? deliveryCentersData?.items.find(dc => dc.code === selectedEmployeeData.delivery_center)?.id
      : null;

    const updated = opportunityFormData.engagements.map((engagementForm) => {
      const engagement = engagementsData.items.find(e => e.id === engagementForm.engagement_id);
      if (!engagement) return engagementForm;

      // Compare Engagement Invoice Center with Employee Delivery Center
      const centersMatch = engagement.delivery_center_id && employeeDeliveryCenterId 
        ? engagement.delivery_center_id === employeeDeliveryCenterId
        : false;

      // Apply cost calculation based on center matching
      let projectCost = engagementForm.project_cost;
      const shouldUpdateCost = !projectCost || 
        projectCost === employee.internal_cost_rate?.toString() || 
        projectCost === employee.internal_bill_rate?.toString();
      
      if (shouldUpdateCost) {
        let employeeCost: number;
        const employeeCurrency = selectedEmployeeData.default_currency || "USD";
        const engagementCurrency = engagement.default_currency || "USD";

        if (centersMatch) {
          // Centers match: use internal_cost_rate with NO currency conversion
          employeeCost = selectedEmployeeData.internal_cost_rate || 0;
        } else {
          // Centers don't match: use internal_bill_rate with currency conversion
          employeeCost = selectedEmployeeData.internal_bill_rate || 0;
          
          if (employeeCurrency.toUpperCase() !== engagementCurrency.toUpperCase()) {
            employeeCost = convertCurrency(employeeCost, employeeCurrency, engagementCurrency);
          }
        }
        projectCost = String(employeeCost);
      }

      // Default dates if not set
      let startDate = engagementForm.start_date;
      let endDate = engagementForm.end_date;
      if (!startDate && engagement.start_date) {
        startDate = normalizeDateForInput(engagement.start_date);
      }
      if (!endDate && engagement.end_date) {
        endDate = normalizeDateForInput(engagement.end_date);
      }

      return {
        ...engagementForm,
        project_cost: projectCost,
        start_date: startDate,
        end_date: endDate,
      };
    });

    // Only update if something changed
    const hasChanges = updated.some((newForm, index) => {
      const oldForm = opportunityFormData.engagements[index];
      return newForm.project_cost !== oldForm.project_cost ||
             newForm.start_date !== oldForm.start_date ||
             newForm.end_date !== oldForm.end_date;
    });

    if (hasChanges) {
      setOpportunityFormData({ engagements: updated });
    }
  }, [opportunityFormData.engagements.length, selectedEmployeeData, engagementsData?.items, employee?.internal_cost_rate, employee?.internal_bill_rate, deliveryCentersData]);

  // Auto-fill Project Rate when Role changes in Opportunity form engagements
  useEffect(() => {
    if (!opportunityFormData.engagements.length || !engagementsData?.items || !rolesData?.items) {
      return;
    }

    const updated = opportunityFormData.engagements.map((engagementForm) => {
      if (!engagementForm.role_id || !engagementForm.engagement_id) {
        return engagementForm;
      }

      const engagement = engagementsData.items.find(e => e.id === engagementForm.engagement_id);
      if (!engagement || !engagement.delivery_center_id) {
        return engagementForm;
      }

      const role = rolesData.items.find(r => r.id === engagementForm.role_id);
      if (!role) {
        return engagementForm;
      }

      // Find the role rate that matches engagement delivery center and currency
      const matchingRate = role.role_rates?.find(
        (rate) =>
          String(rate.delivery_center_id) === String(engagement.delivery_center_id) &&
          rate.default_currency === (engagement.default_currency || "USD")
      );

      const newRate = matchingRate 
        ? String(matchingRate.external_rate || "0")
        : String(role.role_external_rate || "0");

      // Only update if rate changed
      if (newRate !== engagementForm.project_rate) {
        return {
          ...engagementForm,
          project_rate: newRate,
        };
      }

      return engagementForm;
    });

    // Only update if something changed
    const hasChanges = updated.some((newForm, index) => {
      return newForm.project_rate !== opportunityFormData.engagements[index].project_rate;
    });

    if (hasChanges) {
      setOpportunityFormData({ engagements: updated });
    }
  }, [opportunityFormData.engagements, engagementsData?.items, rolesData?.items]);

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
    project_cost: employee.internal_cost_rate?.toString() || "",
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
        alert(`Please fill in all required fields for engagement: Role, Start Date, End Date, Project Rate, and Payable Center`);
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
        project_cost: r.project_cost ? parseFloat(r.project_cost) : undefined,
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
      alert("Please fill in all required fields: Role, Start Date, End Date, Project Rate, and Payable Center");
      return;
    }
    const projectCost = engagementFormData.project_cost ? parseFloat(engagementFormData.project_cost) : undefined;
    try {
      await linkToEngagement.mutateAsync({
        employeeId: employee.id,
        engagementId: selectedEngagementId,
        linkData: {
          role_id: engagementFormData.role_id,
          start_date: engagementFormData.start_date,
          end_date: engagementFormData.end_date,
          project_rate: parseFloat(engagementFormData.project_rate),
          project_cost: projectCost,
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

  // Get all unique opportunity IDs from opportunities (loaded from active estimates)
  const allOpportunityIds = useMemo(() => {
    const ids = new Set<string>();
    if (employee.opportunities && Array.isArray(employee.opportunities)) {
      employee.opportunities.forEach((opp) => {
        if (opp && opp.id) {
          ids.add(String(opp.id));
        }
      });
    }
    return Array.from(ids);
  }, [employee.opportunities]);

  const linkedOpportunityIds = new Set(employee.opportunities?.map((e) => String(e.id)) || []);
  const linkedEngagementIds = new Set(employee.engagements?.map((r) => String(r.id)) || []);

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
                        <span className="ml-2 text-xs text-gray-500">(via Active Estimates)</span>
                      </div>
                      {!readOnly && (
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
                                        <div><strong>Payable Center:</strong> {deliveryCentersData?.items.find(dc => dc.code === engagementData.delivery_center)?.name || engagementData.delivery_center}</div>
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
    project_cost: employee.internal_cost_rate?.toString() || "",
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
                                  // Default Start Date and End Date to Engagement dates when engagement is selected
                                  if (value) {
                                    const selectedEngagement = engagementsData?.items.find(e => e.id === value);
                                    if (selectedEngagement) {
                                      setEngagementFormData(prev => ({
                                        ...prev,
                                        start_date: normalizeDateForInput(selectedEngagement.start_date || ""),
                                        end_date: normalizeDateForInput(selectedEngagement.end_date || ""),
                                      }));
                                    }
                                  } else {
                                    // Clear dates when engagement is cleared
                                    setEngagementFormData(prev => ({
                                      ...prev,
                                      start_date: "",
                                      end_date: "",
                                    }));
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
                                  <Label htmlFor={`engagement-delivery-center-${opportunity.id}`}>Payable Center *</Label>
                                  <Select
                                    id={`engagement-delivery-center-${opportunity.id}`}
                                    value={engagementFormData.delivery_center}
                                    onChange={(e) => {
                                      const dc = e.target.value;
                                      setEngagementFormData({
                                        ...engagementFormData,
                                        delivery_center: dc,
                                        // Do NOT clear role_id - Payable Center is reference only and doesn't affect Role
                                      });
                                    }}
                                    className="w-full"
                                  >
                                    <option value="">Select payable center</option>
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
                                    disabled={!selectedEngagementId}
                                  >
                                    <option value="">Select role</option>
                                    {rolesForInvoiceCenter(selectedEngagementId).map((role) => (
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
                                
                                <div>
                                  <Label htmlFor={`engagement-cost-${opportunity.id}`}>Project Cost</Label>
                                  <Input
                                    id={`engagement-cost-${opportunity.id}`}
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={engagementFormData.project_cost}
                                    onChange={(e) => setEngagementFormData({ ...engagementFormData, project_cost: e.target.value })}
                                    className="w-full"
                                    placeholder="0.00"
                                  />
                                </div>

                                <div>
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
    project_cost: employee.internal_cost_rate?.toString() || "",
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
                                      // Get employee's delivery center ID from code
                                      const employeeDeliveryCenterId = (selectedEmployeeData?.delivery_center || employee.delivery_center)
                                        ? deliveryCentersData?.items.find(dc => dc.code === (selectedEmployeeData?.delivery_center || employee.delivery_center))?.id
                                        : null;
                                      
                                      // Compare Engagement Invoice Center with Employee Delivery Center
                                      const centersMatch = engagement.delivery_center_id && employeeDeliveryCenterId 
                                        ? engagement.delivery_center_id === employeeDeliveryCenterId
                                        : false;
                                      
                                      // Determine which rate to use and whether to convert currency
                                      const engagementCurrency = engagement.default_currency || "USD";
                                      const employeeCurrency = selectedEmployeeData?.default_currency || employee.default_currency || "USD";
                                      let projectCost: string;
                                      
                                      if (centersMatch) {
                                        // Centers match: use internal_cost_rate with NO currency conversion
                                        const employeeCost = selectedEmployeeData?.internal_cost_rate ?? employee.internal_cost_rate ?? 0;
                                        projectCost = String(employeeCost);
                                      } else {
                                        // Centers don't match: use internal_bill_rate with currency conversion
                                        let employeeCost = selectedEmployeeData?.internal_bill_rate ?? employee.internal_bill_rate ?? 0;
                                        
                                        // Convert to Engagement Invoice Center Currency if different
                                        if (employeeCurrency.toUpperCase() !== engagementCurrency.toUpperCase()) {
                                          employeeCost = convertCurrency(employeeCost, employeeCurrency, engagementCurrency);
                                        }
                                        projectCost = String(employeeCost);
                                      }

                                      setOpportunityFormData({
                                        engagements: [
                                          ...opportunityFormData.engagements,
                                          {
                                            engagement_id: engagement.id,
                                            role_id: "",
                                            start_date: normalizeDateForInput(engagement.start_date || ""),
                                            end_date: normalizeDateForInput(engagement.end_date || ""),
                                            project_rate: employee.external_bill_rate?.toString() || "",
                                            project_cost: projectCost,
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
                                    <Label htmlFor={`engagement-delivery-center-${engagement.id}`}>Payable Center *</Label>
                                    <Select
                                      id={`engagement-delivery-center-${engagement.id}`}
                                      value={engagementForm.delivery_center}
                                      onChange={(e) => {
                                        const dc = e.target.value;
                                        const updated = [...opportunityFormData.engagements];
                                        updated[engagementFormIndex] = { ...engagementForm, delivery_center: dc };
                                        // Do NOT clear role_id - Payable Center is reference only and doesn't affect Role
                                        setOpportunityFormData({ engagements: updated });
                                      }}
                                      className="w-full"
                                      required
                                    >
                                      <option value="">Select payable center</option>
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
                                      disabled={!engagement.id}
                                    >
                                      <option value="">Select role</option>
                                      {rolesForInvoiceCenter(engagement.id).map((role) => (
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
                                  
                                  <div>
                                    <Label htmlFor={`engagement-cost-${engagement.id}`}>Project Cost ($)</Label>
                                    <Input
                                      id={`engagement-cost-${engagement.id}`}
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={engagementForm.project_cost}
                                      onChange={(e) => {
                                        const updated = [...opportunityFormData.engagements];
                                        updated[engagementFormIndex] = { ...engagementForm, project_cost: e.target.value };
                                        setOpportunityFormData({ engagements: updated });
                                      }}
                                      className="w-full"
                                      placeholder="0.00"
                                    />
                                  </div>

                                  <div>
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


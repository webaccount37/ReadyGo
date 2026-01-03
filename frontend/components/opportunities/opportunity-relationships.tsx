"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useLinkEmployeeToEngagement,
  useUnlinkEmployeeFromEngagement,
} from "@/hooks/useEmployees";
import { useEngagements, useCreateEngagement, useUpdateEngagement } from "@/hooks/useEngagements";
import { useEmployees, useEmployee } from "@/hooks/useEmployees";
import { useRoles, useRole } from "@/hooks/useRoles";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useCurrencyRates } from "@/hooks/useCurrencyRates";
import { normalizeDateForInput } from "@/lib/utils";
import { convertCurrency, setCurrencyRates } from "@/lib/utils/currency";
import type { Opportunity } from "@/types/opportunity";

interface OpportunityRelationshipsProps {
  opportunity: Opportunity;
  onUpdate: () => void;
  readOnly?: boolean;
}

interface EngagementFormData {
  engagement_id?: string; // undefined if creating new
  name: string; // required for new engagements
  start_date?: string; // optional for new engagements
  end_date?: string; // optional for new engagements
  delivery_center_id: string; // required for new engagements (Invoice Center)
}

interface LinkEmployeeFormData {
  employee_id: string;
  engagement_id: string;
  role_id: string;
  start_date: string;
  end_date: string;
  project_rate: string;
  project_cost: string;
  delivery_center: string;
}

export function OpportunityRelationships({
  opportunity,
  onUpdate,
  readOnly = false,
}: OpportunityRelationshipsProps) {
  const [showEngagementForm, setShowEngagementForm] = useState(false);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [selectedEngagementForEmployee, setSelectedEngagementForEmployee] = useState<string | null>(null);
  const employeeFormRef = useRef<HTMLDivElement>(null);
  
  const [engagementFormData, setEngagementFormData] = useState<EngagementFormData>({
    engagement_id: undefined,
    name: "",
    start_date: normalizeDateForInput(opportunity.start_date),
    end_date: normalizeDateForInput(opportunity.end_date),
    delivery_center_id: opportunity.delivery_center_id || "",
  });
  
  const [employeeFormData, setEmployeeFormData] = useState<LinkEmployeeFormData>({
    employee_id: "",
    engagement_id: "",
    role_id: "",
    start_date: "",
    end_date: "",
    project_rate: "",
    project_cost: "",
    delivery_center: "",
  });

  // Use engagements from opportunity relationships if available, otherwise fetch separately
  const { data: engagementsData, refetch: refetchEngagements } = useEngagements({ 
    opportunity_id: opportunity.id,
    limit: 1000 
  });
  // Fetch all engagements for selection (not filtered by opportunity)
  const { data: allEngagementsData } = useEngagements({ limit: 1000 });
  const { data: employeesData } = useEmployees({ limit: 1000 });
  const { data: rolesData } = useRoles({ limit: 1000 });
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: currencyRatesData } = useCurrencyRates({ limit: 1000 });
  
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
  
  // Get selected role and employee data for auto-fill
  const { data: selectedRoleData } = useRole(
    employeeFormData.role_id || "",
    false,
    {
      enabled: !!employeeFormData.role_id,
    }
  );
  const { data: selectedEmployeeData } = useEmployee(
    employeeFormData.employee_id || "",
    false,
    {
      enabled: !!employeeFormData.employee_id,
    }
  );
  
  // Get selected engagement for auto-fill (use full engagement data from engagementsData, not opportunity.engagements)
  const selectedEngagement = selectedEngagementForEmployee 
    ? (engagementsData?.items.find(e => e.id === selectedEngagementForEmployee && e.opportunity_id === opportunity.id)
      || allEngagementsData?.items.find(e => e.id === selectedEngagementForEmployee))
    : null;
  
  // Debug: Log opportunity data to see what we're receiving
  useEffect(() => {
    console.log("Opportunity Relationships - Opportunity data:", {
      id: opportunity.id,
      name: opportunity.name,
      hasEngagements: !!opportunity.engagements,
      engagementsCount: opportunity.engagements?.length || 0,
      engagements: opportunity.engagements?.map(e => ({
        id: e.id,
        name: e.name,
        opportunity_id: e.opportunity_id,
        opportunity_id_matches: e.opportunity_id === opportunity.id,
        employees_count: (e as any).employees?.length || 0,
      })),
    });
    
    // Also log engagementsData for comparison
    if (engagementsData?.items) {
      console.log("Opportunity Relationships - EngagementsData:", {
        total: engagementsData.items.length,
        filtered_by_opportunity: engagementsData.items.filter(e => e.opportunity_id === opportunity.id).length,
        engagements: engagementsData.items.map(e => ({
          id: e.id,
          name: e.name,
          opportunity_id: e.opportunity_id,
          opportunity_id_matches: e.opportunity_id === opportunity.id,
        })),
      });
    }
  }, [opportunity, engagementsData]);
  
  const createEngagement = useCreateEngagement({
    onSuccess: async (newEngagement) => {
      // After creating engagement, reset form and close
      setEngagementFormData({
        engagement_id: undefined,
        name: "",
        start_date: normalizeDateForInput(opportunity.start_date),
        end_date: normalizeDateForInput(opportunity.end_date),
        delivery_center_id: opportunity.delivery_center_id || "",
      });
      await refetchEngagements();
      setShowEngagementForm(false);
      await new Promise(resolve => setTimeout(resolve, 100));
      await onUpdate();
    },
  });

  const updateEngagement = useUpdateEngagement({
    onSuccess: async () => {
      // After updating engagement to link it, reset form and close
      setEngagementFormData({
        engagement_id: undefined,
        name: "",
        start_date: normalizeDateForInput(opportunity.start_date),
        end_date: normalizeDateForInput(opportunity.end_date),
        delivery_center_id: opportunity.delivery_center_id || "",
      });
      await refetchEngagements();
      setShowEngagementForm(false);
      await new Promise(resolve => setTimeout(resolve, 100));
      await onUpdate();
    },
  });

  const linkToEngagement = useLinkEmployeeToEngagement({
    onSuccess: async () => {
      setEmployeeFormData({
        employee_id: "",
        engagement_id: "",
        role_id: "",
        start_date: "",
        end_date: "",
        project_rate: "",
        project_cost: "",
        delivery_center: "",
      });
      setShowEmployeeForm(false);
      setSelectedEngagementForEmployee(null);
      await new Promise(resolve => setTimeout(resolve, 100));
      await onUpdate();
    },
    onError: (error) => {
      console.error("Link employee to engagement error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes("Network error") && !errorMessage.includes("fetch")) {
        alert(`Failed to link employee: ${errorMessage}`);
      }
    },
  });

  const unlinkFromEngagement = useUnlinkEmployeeFromEngagement({
    onSuccess: async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      await onUpdate();
    },
    onError: (error) => {
      console.error("Unlink employee from engagement error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes("Network error") && !errorMessage.includes("fetch")) {
        alert(`Failed to unlink employee: ${errorMessage}`);
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

  // Auto-fill Project Rate when Role changes (Rate always comes from Role)
  useEffect(() => {
    if (!employeeFormData.role_id || !selectedEngagementForEmployee || !selectedRoleData || !selectedEngagement) {
      return;
    }

    if (!selectedEngagement.delivery_center_id) return;

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
      if (selectedRoleData) {
        newRate = String(selectedRoleData.role_external_rate || "0");
      } else {
        return;
      }
    }

    // Update Project Rate only (Rate always comes from Role)
    setEmployeeFormData((prev) => ({
      ...prev,
      project_rate: newRate,
    }));
  }, [employeeFormData.role_id, selectedEngagementForEmployee, selectedRoleData, selectedEngagement]);

  // Auto-fill Project Cost when Employee changes (Cost always comes from Employee)
  useEffect(() => {
    if (!employeeFormData.employee_id || !selectedEmployeeData || !selectedEngagement) {
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

    setEmployeeFormData((prev) => ({
      ...prev,
      project_cost: String(employeeCost),
    }));
  }, [employeeFormData.employee_id, selectedEmployeeData, selectedEngagement, deliveryCentersData]);

  // Get employees linked to this opportunity (through opportunity associations)
  // Note: This would come from the opportunity data if include_relationships is true
  // For now, we'll display employees as they're linked through engagements

  const handleCreateOrSelectEngagement = async () => {
    if (!engagementFormData.name && !engagementFormData.engagement_id) {
      alert("Please either create a new engagement (enter name) or select an existing engagement");
      return;
    }

    // If creating new engagement, create it first
    if (!engagementFormData.engagement_id && engagementFormData.name) {
      if (!engagementFormData.delivery_center_id) {
        alert("Please select a Delivery Center (Invoice Center) for the engagement");
        return;
      }
      try {
        await createEngagement.mutateAsync({
          name: engagementFormData.name,
          opportunity_id: opportunity.id,
          start_date: engagementFormData.start_date || opportunity.start_date,
          end_date: engagementFormData.end_date || opportunity.end_date,
          status: "planning",
          delivery_center_id: engagementFormData.delivery_center_id,
        });
        // Form will be reset and closed in onSuccess callback
      } catch (err) {
        console.error("Failed to create engagement:", err);
        alert(`Error creating engagement: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (engagementFormData.engagement_id) {
      // If selecting existing engagement, check if it's already linked to this opportunity
      const selectedEngagement = allEngagementsData?.items.find(e => e.id === engagementFormData.engagement_id);
      
      if (!selectedEngagement) {
        alert("Selected engagement not found");
        return;
      }

      // If engagement already belongs to this opportunity, we're done
      if (selectedEngagement.opportunity_id === opportunity.id) {
        setEngagementFormData({
          engagement_id: undefined,
          name: "",
          start_date: opportunity.start_date || "",
          end_date: opportunity.end_date || "",
          delivery_center_id: opportunity.delivery_center_id || "",
        });
        setShowEngagementForm(false);
        await refetchEngagements();
        await new Promise(resolve => setTimeout(resolve, 100));
        await onUpdate();
        return;
      }

      // Otherwise, update the engagement to link it to this opportunity
      try {
        await updateEngagement.mutateAsync({
          id: engagementFormData.engagement_id,
          data: {
            opportunity_id: opportunity.id,
          },
        });
        // Form will be reset and closed in onSuccess callback
      } catch (err) {
        console.error("Failed to link engagement:", err);
        alert(`Error linking engagement: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const handleLinkEmployeeToEngagement = (engagementId: string) => {
    const selectedEngagement = opportunity.engagements?.find(e => e.id === engagementId) 
      || engagementsData?.items.find(e => e.id === engagementId && e.opportunity_id === opportunity.id);
    
    setSelectedEngagementForEmployee(engagementId);
    setEmployeeFormData({
      employee_id: "",
      engagement_id: engagementId,
      role_id: "",
      start_date: normalizeDateForInput(selectedEngagement?.start_date || opportunity.start_date),
      end_date: normalizeDateForInput(selectedEngagement?.end_date || opportunity.end_date),
      project_rate: "",
      project_cost: "",
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
    if (!employeeFormData.employee_id || !employeeFormData.engagement_id) {
      alert("Please select an employee and engagement");
      return;
    }

    if (!employeeFormData.role_id || !employeeFormData.start_date || !employeeFormData.end_date || !employeeFormData.project_rate || !employeeFormData.delivery_center) {
      alert("Please fill in all required fields: Role, Start Date, End Date, Project Rate, and Payable Center");
      return;
    }

    const projectCost = employeeFormData.project_cost ? parseFloat(employeeFormData.project_cost) : undefined;

    try {
      await linkToEngagement.mutateAsync({
        employeeId: employeeFormData.employee_id,
        engagementId: employeeFormData.engagement_id,
        linkData: {
          role_id: employeeFormData.role_id,
          start_date: employeeFormData.start_date,
          end_date: employeeFormData.end_date,
          project_rate: parseFloat(employeeFormData.project_rate),
          project_cost: projectCost,
          delivery_center: employeeFormData.delivery_center,
        },
      });
    } catch (err) {
      console.error("Failed to link employee:", err);
    }
  };

  // Note: Unlinking functionality can be added later when displaying linked employees
  // For now, employees are linked through engagements, so they can be unlinked via the engagement

  return (
    <div className="space-y-6">
      {/* Engagements Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Associated Engagements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Only use engagements from opportunity.engagements (which includes employees) */}
          {/* Only fallback to engagementsData if opportunity.engagements is not available */}
          {((opportunity.engagements && opportunity.engagements.length > 0) || (engagementsData?.items && engagementsData.items.length > 0)) ? (
            <div className="space-y-4">
              {/* Prioritize opportunity.engagements if available, otherwise use engagementsData but filter by opportunity_id */}
              {/* IMPORTANT: Always filter by opportunity_id to ensure data integrity */}
              {((opportunity.engagements && opportunity.engagements.length > 0) 
                ? opportunity.engagements.filter(e => {
                    // Strict filtering: only include engagements that belong to this opportunity
                    const matches = e.opportunity_id === opportunity.id;
                    if (!matches) {
                      console.warn(`[FILTER] Excluding engagement ${e.id} (${e.name}) - opportunity_id ${e.opportunity_id} != ${opportunity.id}`);
                    }
                    return matches;
                  })
                : (engagementsData?.items || []).filter(e => {
                    const matches = e.opportunity_id === opportunity.id;
                    if (!matches) {
                      console.warn(`[FILTER] Excluding engagement ${e.id} (${e.name}) from engagementsData - opportunity_id ${e.opportunity_id} != ${opportunity.id}`);
                    }
                    return matches;
                  })
              ).map((engagement) => {
                // Double-check that this engagement belongs to this opportunity
                if (engagement.opportunity_id !== opportunity.id) {
                  console.error(`[ERROR] Engagement ${engagement.id} (${engagement.name}) does not belong to opportunity ${opportunity.id} (${opportunity.name})`);
                  return null;
                }
                
                // If engagement comes from opportunity.engagements, it has employees embedded
                // IMPORTANT: Filter employees to ensure they're actually linked to THIS engagement
                const engagementFromOpportunity = opportunity.engagements?.find(e => e.id === engagement.id && e.opportunity_id === opportunity.id);
                let engagementEmployees: any[] = [];
                if (engagementFromOpportunity && 'employees' in engagementFromOpportunity) {
                  engagementEmployees = (engagementFromOpportunity.employees || []).filter((emp: any) => {
                    // Additional safety: verify employee is actually linked to this engagement
                    // We can't verify this directly from the frontend, but we trust the backend
                    // The backend safety checks should have filtered this already
                    return true;
                  });
                  console.log(`[DEBUG] Engagement ${engagement.id} (${engagement.name}) has ${engagementEmployees.length} employees from opportunity.engagements`);
                } else {
                  console.log(`[DEBUG] Engagement ${engagement.id} (${engagement.name}) not found in opportunity.engagements, using empty employee list`);
                }
                
                // Skip if engagement doesn't belong to this opportunity (shouldn't happen after filtering, but safety check)
                if (!engagement || engagement.opportunity_id !== opportunity.id) {
                  return null;
                }
                
                return (
                  <div
                    key={engagement.id}
                    className="border rounded-lg p-4 space-y-3 bg-gray-50"
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <div className="flex-1">
                        <span
                          className="text-blue-600 font-semibold text-base cursor-default"
                          title={`Engagement: ${engagement.name}`}
                        >
                          {engagement.name}
                        </span>
                        {engagement.start_date && (
                          <div className="text-sm text-gray-600 mt-1">
                            {new Date(engagement.start_date).toLocaleDateString()} - {engagement.end_date ? new Date(engagement.end_date).toLocaleDateString() : "Ongoing"}
                          </div>
                        )}
                      </div>
                      {!readOnly && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleLinkEmployeeToEngagement(engagement.id)}
                            className="w-full sm:w-auto"
                          >
                            + Link Employee
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              // TODO: Implement engagement deletion or unlinking
                              alert("Engagement unlinking not yet implemented");
                            }}
                            className="w-full sm:w-auto"
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    {/* Show employees linked to this engagement */}
                    {engagementEmployees.length > 0 && (
                      <div className="ml-4 mt-2 space-y-2">
                        <div className="text-xs font-medium text-gray-600">Employees on this engagement:</div>
                        {engagementEmployees.map((employee) => {
                          // Log dates for debugging
                          if (employee.start_date && employee.end_date) {
                            const startDateStr = normalizeDateForInput(employee.start_date);
                            const endDateStr = normalizeDateForInput(employee.end_date);
                            console.log(`[OpportunityRelationships ${engagement.id}-${employee.id}] Received dates:`, {
                              raw_start_date: employee.start_date,
                              raw_end_date: employee.end_date,
                              parsed_start_date: startDateStr,
                              parsed_end_date: endDateStr,
                            });
                          }
                          return (
                            <div
                              key={`${engagement.id}-${employee.id}`}
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
                                  Payable Center: {deliveryCentersData?.items.find(dc => dc.code === employee.delivery_center)?.name || employee.delivery_center}
                                </span>
                              )}
                              {!readOnly && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={async () => {
                                    if (confirm("Are you sure you want to unlink this employee from the engagement?")) {
                                      try {
                                        await unlinkFromEngagement.mutateAsync({
                                          employeeId: employee.id,
                                          engagementId: engagement.id,
                                        });
                                      } catch (err) {
                                        console.error("Failed to unlink employee:", err);
                                      }
                                    }
                                  }}
                                  disabled={unlinkFromEngagement.isPending}
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

                    {/* Show employee form inline under this engagement when selected */}
                    {!readOnly && showEmployeeForm && selectedEngagementForEmployee === engagement.id && (
                      <div ref={employeeFormRef} className="mt-4 pt-4 border-t space-y-3">
                        <div className="space-y-3 p-3 bg-blue-50 border-2 border-blue-200 rounded-md">
                          <div className="text-sm font-medium mb-2">
                            Link Employee to Engagement: <span className="text-blue-700 font-semibold">{engagement.name}</span>
                          </div>
                          
                          <div>
                            <Label>Select Employee *</Label>
                            <Select
                              value={employeeFormData.employee_id}
                              onChange={(e) => {
                                const selectedEmployeeId = e.target.value;
                                const selectedEmployee = employeesData?.items.find(emp => emp.id === selectedEmployeeId);
                                
                                // Only update employee_id and delivery_center here - Cost will be auto-filled by useEffect
                                setEmployeeFormData({
                                  ...employeeFormData,
                                  employee_id: selectedEmployeeId,
                                  // Default delivery center to employee's delivery center if available (Payable Center)
                                  delivery_center: selectedEmployee?.delivery_center || employeeFormData.delivery_center,
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
                              <Label>Payable Center *</Label>
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
                                <option value="">Select payable center</option>
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
                                disabled={!selectedEngagementForEmployee}
                              >
                                <option value="">Select role</option>
                                {rolesForInvoiceCenter(selectedEngagementForEmployee || "").map((role) => (
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

                            <div>
                              <Label>Project Cost ($)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={employeeFormData.project_cost}
                                onChange={(e) => setEmployeeFormData({ ...employeeFormData, project_cost: e.target.value })}
                                className="w-full mt-1"
                                placeholder="0.00"
                              />
                            </div>

                            <div>
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
                                !employeeFormData.engagement_id ||
                                !employeeFormData.role_id ||
                                !employeeFormData.start_date ||
                                !employeeFormData.end_date ||
                                !employeeFormData.project_rate ||
                                !employeeFormData.delivery_center ||
                                linkToEngagement.isPending
                              }
                              size="sm"
                              className="flex-1"
                            >
                              {linkToEngagement.isPending ? "Linking..." : "Link Employee"}
                            </Button>
                            <Button
                              onClick={() => {
                                setShowEmployeeForm(false);
                                setSelectedEngagementForEmployee(null);
      setEmployeeFormData({
        employee_id: "",
        engagement_id: "",
        role_id: "",
        start_date: "",
        end_date: "",
        project_rate: "",
        project_cost: "",
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
            <p className="text-sm text-gray-500">No engagements associated</p>
          )}

          {/* Link/Create Engagement */}
          {!readOnly && (
            <div className="pt-4 border-t space-y-3">
              {!showEngagementForm ? (
                <Button
                  onClick={() => setShowEngagementForm(true)}
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  + Add Engagement
                </Button>
              ) : (
                <div className="space-y-3 p-3 bg-gray-50 border rounded-md">
                  <div className="text-sm font-medium mb-2">Add Engagement</div>
                  
                  {/* Option to create new or select existing */}
                  <div>
                    <Label>Engagement Name (for new engagement) *</Label>
                    <Input
                      type="text"
                      value={engagementFormData.name}
                      onChange={(e) => setEngagementFormData({ ...engagementFormData, name: e.target.value, engagement_id: undefined })}
                      placeholder="Enter engagement name to create new"
                      className="w-full mt-1"
                    />
                  </div>
                  
                  <div className="text-sm text-gray-600 text-center">OR</div>
                  
                  <div>
                    <Label>Select Existing Engagement</Label>
                    <Select
                      value={engagementFormData.engagement_id || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Find engagement from all engagements
                        const selectedEngagement = allEngagementsData?.items.find(e => e.id === value);
                        setEngagementFormData({ 
                          ...engagementFormData, 
                          engagement_id: value || undefined,
                          name: value ? (selectedEngagement?.name || "") : "",
                          start_date: normalizeDateForInput(selectedEngagement?.start_date || opportunity.start_date),
                          end_date: normalizeDateForInput(selectedEngagement?.end_date || opportunity.end_date),
                          delivery_center_id: value ? (selectedEngagement?.delivery_center_id || "") : "",
                        });
                      }}
                      className="w-full mt-1"
                    >
                      <option value="">Select an existing engagement</option>
                      {/* Show all engagements, but indicate which ones are already linked */}
                      {(allEngagementsData?.items || []).map((engagement) => {
                        const isAlreadyLinked = engagement.opportunity_id === opportunity.id;
                        return (
                          <option key={engagement.id} value={engagement.id}>
                            {engagement.name}{isAlreadyLinked ? " (already linked)" : ""}
                          </option>
                        );
                      })}
                    </Select>
                  </div>

                  {/* Optional fields for new engagement */}
                  {!engagementFormData.engagement_id && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label>Delivery Center (Invoice Center) *</Label>
                        <Select
                          value={engagementFormData.delivery_center_id}
                          onChange={(e) => setEngagementFormData({ ...engagementFormData, delivery_center_id: e.target.value })}
                          className="w-full mt-1"
                          required
                        >
                          <option value="">Select delivery center</option>
                          {deliveryCentersData?.items.map((dc) => (
                            <option key={dc.id} value={dc.id}>
                              {dc.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label>Start Date (optional)</Label>
                        <Input
                          type="date"
                          value={engagementFormData.start_date}
                          onChange={(e) => setEngagementFormData({ ...engagementFormData, start_date: e.target.value })}
                          className="w-full mt-1"
                        />
                      </div>

                      <div>
                        <Label>End Date (optional)</Label>
                        <Input
                          type="date"
                          value={engagementFormData.end_date}
                          onChange={(e) => setEngagementFormData({ ...engagementFormData, end_date: e.target.value })}
                          className="w-full mt-1"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={handleCreateOrSelectEngagement}
                      disabled={
                        (!engagementFormData.name && !engagementFormData.engagement_id) ||
                        (!engagementFormData.engagement_id && !engagementFormData.delivery_center_id) ||
                        createEngagement.isPending ||
                        updateEngagement.isPending
                      }
                      size="sm"
                      className="flex-1"
                    >
                      {createEngagement.isPending || updateEngagement.isPending 
                        ? (createEngagement.isPending ? "Creating..." : "Linking...") 
                        : "Link Engagement"}
                    </Button>
                    <Button
                      onClick={() => {
                        setShowEngagementForm(false);
                        setEngagementFormData({
                          engagement_id: undefined,
                          name: "",
                          start_date: opportunity.start_date || "",
                          end_date: opportunity.end_date || "",
                          delivery_center_id: opportunity.delivery_center_id || "",
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
          {/* Employees are linked through engagements, not directly to opportunities */}
          {/* Summary: Show count of employees linked through engagements */}
          {opportunity.engagements && opportunity.engagements.some(e => e.employees && e.employees.length > 0) ? (
            <div className="text-sm text-gray-600">
              {opportunity.engagements.reduce((total, e) => total + (e.employees?.length || 0), 0)} employee(s) linked through engagements (shown above under each engagement)
            </div>
          ) : (
            <p className="text-sm text-gray-500">No employees associated. Employees must be linked through engagements.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


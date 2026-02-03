"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useLinkEmployeeToOpportunity,
  useUnlinkEmployeeFromOpportunity,
  useEmployee,
} from "@/hooks/useEmployees";
import { useOpportunity, useOpportunities } from "@/hooks/useOpportunities";
import { useRoles, useRole } from "@/hooks/useRoles";
import { useAccounts } from "@/hooks/useAccounts";
import { useCurrencyRates } from "@/hooks/useCurrencyRates";
import { useQuotes } from "@/hooks/useQuotes";
import { normalizeDateForInput } from "@/lib/utils";
import { convertCurrency, setCurrencyRates } from "@/lib/utils/currency";
import type { Employee } from "@/types/employee";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { Lock } from "lucide-react";

interface EmployeeRelationshipsProps {
  employee: Employee;
  onUpdate: () => void;
  readOnly?: boolean;
}

interface LinkOpportunityFormData {
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
  const [showOpportunityForm, setShowOpportunityForm] = useState(false);
  
  const [opportunityFormData, setOpportunityFormData] = useState<LinkOpportunityFormData>({
    role_id: "",
    start_date: "",
    end_date: "",
    project_rate: employee.external_bill_rate?.toString() || "",
    project_cost: employee.internal_cost_rate?.toString() || "",
    delivery_center: "",
  });

  const { data: opportunitiesData } = useOpportunities({ limit: 1000 });
  const { data: rolesData } = useRoles({ limit: 1000 });
  const { data: accountsData } = useAccounts({ limit: 1000 });
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: currencyRatesData } = useCurrencyRates({ limit: 1000 });
  // Fetch all quotes at top level to check for active quotes per opportunity
  const { data: allQuotesData } = useQuotes({ limit: 10000 });
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  
  // Get selected opportunity for auto-fill
  const { data: selectedOpportunity } = useOpportunity(
    selectedOpportunityId || "",
    false,
    {
      enabled: !!selectedOpportunityId,
    }
  );
  
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
    opportunityFormData.role_id || "",
    false,
    {
      enabled: !!opportunityFormData.role_id && !!selectedOpportunityId,
    }
  );
  const { data: selectedEmployeeData } = useEmployee(
    employee?.id || "",
    false,
    {
      enabled: !!employee?.id,
    }
  );

  const linkToOpportunity = useLinkEmployeeToOpportunity({
    onSuccess: async () => {
      setSelectedOpportunityId("");
      setOpportunityFormData({
        role_id: "",
        start_date: "",
        end_date: "",
        project_rate: employee.external_bill_rate?.toString() || "",
        project_cost: employee.internal_cost_rate?.toString() || "",
        delivery_center: "",
      });
      setShowOpportunityForm(false);
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

  // Get roles for Opportunity Invoice Center (delivery_center_id)
  const rolesForInvoiceCenter = (opportunityId: string) => {
    const opportunity = opportunitiesData?.items.find(o => o.id === opportunityId);
    if (!opportunity?.delivery_center_id || !deliveryCentersData?.items || !rolesData?.items) return [];
    const invoiceCenter = deliveryCentersData.items.find(dc => dc.id === opportunity.delivery_center_id);
    if (!invoiceCenter) return [];
    return rolesData.items.filter((role) =>
      role.role_rates?.some((r) => r.delivery_center_code === invoiceCenter.code)
    ) || [];
  };

  // Auto-fill Project Rate when Role changes - Rate always comes from Role
  useEffect(() => {
    if (!opportunityFormData.role_id || !selectedOpportunityId || !selectedOpportunity || !selectedRoleData) {
      return;
    }

    if (!selectedOpportunity.delivery_center_id) return;

    // Find the role rate that matches opportunity invoice center (may have different currency)
    const matchingRate = selectedRoleData.role_rates?.find(
      (rate) =>
        String(rate.delivery_center_id) === String(selectedOpportunity.delivery_center_id)
    );

    let newRate: string;
    let roleRateCurrency: string = selectedOpportunity.default_currency || "USD";

    if (matchingRate) {
      let baseRate = matchingRate.external_rate || 0;
      roleRateCurrency = matchingRate.default_currency || "USD";
      const opportunityCurrency = selectedOpportunity.default_currency || "USD";
      
      // Check if currency conversion is needed: Role Rate Currency <> Opportunity Invoice Currency
      if (roleRateCurrency.toUpperCase() !== opportunityCurrency.toUpperCase()) {
        baseRate = convertCurrency(baseRate, roleRateCurrency, opportunityCurrency);
      }
      
      // Round to 2 decimal places
      newRate = parseFloat(baseRate.toFixed(2)).toString();
    } else {
      // Fallback to role default rate if no matching rate found
      const fallbackRate = selectedRoleData.role_external_rate || 0;
      newRate = parseFloat(fallbackRate.toFixed(2)).toString();
    }

    // Update Project Rate only (Rate always comes from Role)
    setOpportunityFormData((prev) => ({
      ...prev,
      project_rate: newRate,
    }));
  }, [opportunityFormData.role_id, selectedOpportunityId, selectedRoleData, selectedOpportunity]);

  // Auto-fill Project Cost when Employee or Opportunity changes - Cost always comes from Employee
  useEffect(() => {
    if (!employee?.id || !selectedEmployeeData || !selectedOpportunity) {
      return;
    }

    // Get employee's delivery center ID from code
    const employeeDeliveryCenterId = selectedEmployeeData.delivery_center 
      ? deliveryCentersData?.items.find(dc => dc.code === selectedEmployeeData.delivery_center)?.id
      : null;
    
    // Compare Opportunity Invoice Center with Employee Delivery Center
    const centersMatch = selectedOpportunity.delivery_center_id && employeeDeliveryCenterId 
      ? selectedOpportunity.delivery_center_id === employeeDeliveryCenterId
      : false;

    // Determine which rate to use and whether to convert currency
    let employeeCost: number;
    const employeeCurrency = selectedEmployeeData.default_currency || "USD";
    const opportunityCurrency = selectedOpportunity.default_currency || "USD";
    const currenciesMatch = employeeCurrency.toUpperCase() === opportunityCurrency.toUpperCase();

    // Choose rate based on delivery center match
    if (centersMatch) {
      // Centers match: use internal_cost_rate
      employeeCost = selectedEmployeeData.internal_cost_rate || 0;
    } else {
      // Centers don't match: use internal_bill_rate
      employeeCost = selectedEmployeeData.internal_bill_rate || 0;
    }
    
    // Convert to Opportunity Invoice Currency if currencies differ
    if (!currenciesMatch) {
      employeeCost = convertCurrency(employeeCost, employeeCurrency, opportunityCurrency);
    }

    // Round to 2 decimal places
    setOpportunityFormData((prev) => ({
      ...prev,
      project_cost: parseFloat(employeeCost.toFixed(2)).toString(),
    }));
  }, [employee?.id, selectedEmployeeData, selectedOpportunity, deliveryCentersData]);

  // Auto-fill dates when opportunity is selected
  useEffect(() => {
    if (selectedOpportunity && !opportunityFormData.start_date && !opportunityFormData.end_date) {
      setOpportunityFormData((prev) => ({
        ...prev,
        start_date: normalizeDateForInput(selectedOpportunity.start_date || ""),
        end_date: normalizeDateForInput(selectedOpportunity.end_date || ""),
      }));
    }
  }, [selectedOpportunity]);

  const handleLinkOpportunity = async () => {
    if (!selectedOpportunityId) {
      alert("Please select an opportunity to link");
      return;
    }
    
    if (!opportunityFormData.role_id || !opportunityFormData.start_date || !opportunityFormData.end_date || !opportunityFormData.project_rate || !opportunityFormData.delivery_center) {
      alert("Please fill in all required fields: Role, Start Date, End Date, Project Rate, and Payable Center");
      return;
    }
    const projectCost = opportunityFormData.project_cost ? parseFloat(opportunityFormData.project_cost) : undefined;
    try {
      await linkToOpportunity.mutateAsync({
        employeeId: employee.id,
        opportunityId: selectedOpportunityId,
        linkData: {
          role_id: opportunityFormData.role_id,
          start_date: opportunityFormData.start_date,
          end_date: opportunityFormData.end_date,
          project_rate: parseFloat(opportunityFormData.project_rate),
          project_cost: projectCost,
          delivery_center: opportunityFormData.delivery_center,
        },
      });
    } catch (err) {
      console.error("Failed to link opportunity:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUnlinkOpportunity = async (opportunityId: string) => {
    if (confirm("Are you sure you want to unlink this opportunity?")) {
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

  // Get all unique opportunity IDs from opportunities (loaded from active estimates)
  const allOpportunityIds = employee.opportunities?.map((opp) => opp.id) || [];
  const linkedOpportunityIds = new Set(allOpportunityIds);
  
  // Helper function to check if an opportunity has an active quote
  const hasActiveQuote = (opportunityId: string): boolean => {
    return allQuotesData?.items?.some(q => q.opportunity_id === opportunityId && q.is_active) || false;
  };

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
                // Find opportunity from opportunitiesData
                const opportunity = opportunitiesData?.items.find(e => e.id === opportunityId);
                if (!opportunity) return null;
                
                // Get employee's association data for this opportunity
                const employeeOpportunityData = employee.opportunities?.find(o => o.id === opportunityId);
                
                // Check if opportunity is locked (use is_locked field if available, otherwise fallback to checking quotes)
                const isLocked = opportunity.is_locked ?? hasActiveQuote(opportunityId);
                
                return (
                  <div
                    key={opportunityId}
                    className={`border rounded-lg p-4 space-y-3 ${isLocked ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50'}`}
                  >
                    {/* Opportunity Header */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-blue-600 font-semibold text-base cursor-default"
                            title={`Opportunity: ${opportunity.name}`}
                          >
                            {opportunity.name}
                          </span>
                          {isLocked && (
                            <span className="flex items-center gap-1 text-yellow-700 text-xs px-2 py-1 bg-yellow-100 border border-yellow-300 rounded font-semibold">
                              <Lock className="w-3 h-3" />
                              Locked
                            </span>
                          )}
                        </div>
                        <span className="ml-0 text-xs text-gray-500">(via Active Estimates)</span>
                        {/* Display association fields */}
                        {employeeOpportunityData && (
                          <div className="mt-2 text-xs text-gray-600 space-y-1">
                            {employeeOpportunityData.role_name && (
                              <div><strong>Role:</strong> {employeeOpportunityData.role_name}</div>
                            )}
                            {employeeOpportunityData.start_date && (
                              <div><strong>Start Date:</strong> {normalizeDateForInput(employeeOpportunityData.start_date)}</div>
                            )}
                            {employeeOpportunityData.end_date && (
                              <div><strong>End Date:</strong> {normalizeDateForInput(employeeOpportunityData.end_date)}</div>
                            )}
                            {employeeOpportunityData.project_rate !== undefined && (
                              <div><strong>Project Rate:</strong> ${employeeOpportunityData.project_rate.toFixed(2)}</div>
                            )}
                            {employeeOpportunityData.delivery_center && (
                              <div><strong>Payable Center:</strong> {deliveryCentersData?.items.find(dc => dc.code === employeeOpportunityData.delivery_center)?.name || employeeOpportunityData.delivery_center}</div>
                            )}
                          </div>
                        )}
                      </div>
                      {!readOnly && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUnlinkOpportunity(opportunityId)}
                            disabled={unlinkFromOpportunity.isPending || isLocked}
                            className={`w-full sm:w-auto ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={isLocked ? "Cannot unlink opportunity - it is locked by an active quote" : "Unlink this opportunity"}
                          >
                            Unlink Opportunity
                          </Button>
                        </div>
                      )}
                    </div>
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
                    onChange={(e) => {
                      setSelectedOpportunityId(e.target.value);
                      setShowOpportunityForm(true);
                    }}
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
                
                {selectedOpportunityId && showOpportunityForm && (
                  <>
                    <div className="text-sm font-medium mb-3 text-gray-700">
                      Opportunity: {opportunitiesData?.items.find(e => e.id === selectedOpportunityId)?.name}
                    </div>
                    
                    <div className="space-y-3 p-3 bg-blue-50 border-2 border-blue-200 rounded-md">
                      <div className="text-sm font-medium mb-2">Link Employee to Opportunity</div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="opportunity-delivery-center">Payable Center *</Label>
                          <Select
                            id="opportunity-delivery-center"
                            value={opportunityFormData.delivery_center}
                            onChange={(e) => {
                              const dc = e.target.value;
                              setOpportunityFormData({
                                ...opportunityFormData,
                                delivery_center: dc,
                                // Payable Center is metadata only - do not clear Role
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
                          <Label htmlFor="opportunity-role">Role *</Label>
                          <Select
                            id="opportunity-role"
                            value={opportunityFormData.role_id}
                            onChange={(e) => setOpportunityFormData({ ...opportunityFormData, role_id: e.target.value })}
                            className="w-full"
                            disabled={!selectedOpportunityId}
                          >
                            <option value="">Select role</option>
                            {rolesForInvoiceCenter(selectedOpportunityId).map((role) => (
                              <option key={role.id} value={role.id}>
                                {role.role_name}
                              </option>
                            ))}
                          </Select>
                        </div>
                        
                        <div>
                          <Label htmlFor="opportunity-start-date">Start Date *</Label>
                          <Input
                            id="opportunity-start-date"
                            type="date"
                            value={opportunityFormData.start_date}
                            onChange={(e) => setOpportunityFormData({ ...opportunityFormData, start_date: e.target.value })}
                            className="w-full"
                            required
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor="opportunity-end-date">End Date *</Label>
                          <Input
                            id="opportunity-end-date"
                            type="date"
                            value={opportunityFormData.end_date}
                            onChange={(e) => setOpportunityFormData({ ...opportunityFormData, end_date: e.target.value })}
                            className="w-full"
                            required
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor="opportunity-cost">
                            Project Cost ({selectedOpportunity?.default_currency || "USD"})
                          </Label>
                          <Input
                            id="opportunity-cost"
                            type="number"
                            step="0.01"
                            min="0"
                            value={opportunityFormData.project_cost}
                            onChange={(e) => setOpportunityFormData({ ...opportunityFormData, project_cost: e.target.value })}
                            className="w-full"
                            placeholder="0.00"
                          />
                        </div>

                        <div>
                          <Label htmlFor="opportunity-rate">
                            Project Rate ({selectedOpportunity?.default_currency || "USD"}) *
                          </Label>
                          <Input
                            id="opportunity-rate"
                            type="number"
                            step="0.01"
                            min="0"
                            value={opportunityFormData.project_rate}
                            onChange={(e) => setOpportunityFormData({ ...opportunityFormData, project_rate: e.target.value })}
                            className="w-full"
                            placeholder="0.00"
                            required
                          />
                        </div>
                      </div>
                      
                      <div className="flex gap-2 pt-2">
                        <Button
                          onClick={handleLinkOpportunity}
                          disabled={
                            !selectedAccountId ||
                            !selectedOpportunityId ||
                            !opportunityFormData.role_id ||
                            !opportunityFormData.start_date ||
                            !opportunityFormData.end_date ||
                            !opportunityFormData.project_rate ||
                            !opportunityFormData.delivery_center ||
                            linkToOpportunity.isPending
                          }
                          className="flex-1"
                        >
                          {linkToOpportunity.isPending ? "Linking..." : "Link Opportunity"}
                        </Button>
                        <Button
                          onClick={() => {
                            setSelectedOpportunityId("");
                            setShowOpportunityForm(false);
                            setOpportunityFormData({
                              role_id: "",
                              start_date: "",
                              end_date: "",
                              project_rate: employee.external_bill_rate?.toString() || "",
                              project_cost: employee.internal_cost_rate?.toString() || "",
                              delivery_center: "",
                            });
                          }}
                          variant="outline"
                        >
                          Clear
                        </Button>
                      </div>
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

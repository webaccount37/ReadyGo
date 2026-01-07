"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useLinkEmployeeToOpportunity,
  useUnlinkEmployeeFromOpportunity,
} from "@/hooks/useEmployees";
import { useEmployees, useEmployee } from "@/hooks/useEmployees";
import { useRoles, useRole } from "@/hooks/useRoles";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useCurrencyRates } from "@/hooks/useCurrencyRates";
import { useQuotes } from "@/hooks/useQuotes";
import { normalizeDateForInput } from "@/lib/utils";
import { convertCurrency, setCurrencyRates } from "@/lib/utils/currency";
import type { Opportunity } from "@/types/opportunity";

interface OpportunityRelationshipsProps {
  opportunity: Opportunity;
  onUpdate: () => void;
  readOnly?: boolean;
}

interface LinkEmployeeFormData {
  employee_id: string;
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
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const employeeFormRef = useRef<HTMLDivElement>(null);
  
  const [employeeFormData, setEmployeeFormData] = useState<LinkEmployeeFormData>({
    employee_id: "",
    role_id: "",
    start_date: normalizeDateForInput(opportunity.start_date),
    end_date: normalizeDateForInput(opportunity.end_date),
    project_rate: "",
    project_cost: "",
    delivery_center: "",
  });

  const { data: employeesData } = useEmployees({ limit: 1000 });
  const { data: rolesData } = useRoles({ limit: 1000 });
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: currencyRatesData } = useCurrencyRates({ limit: 1000 });
  
  // Check if opportunity has active quote (for locking)
  const { data: quotesData } = useQuotes({ opportunity_id: opportunity.id, limit: 100 });
  const hasActiveQuote = quotesData?.items?.some(q => q.is_active) || false;
  
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

  const linkToOpportunity = useLinkEmployeeToOpportunity({
    onSuccess: async () => {
      setEmployeeFormData({
        employee_id: "",
        role_id: "",
        start_date: normalizeDateForInput(opportunity.start_date),
        end_date: normalizeDateForInput(opportunity.end_date),
        project_rate: "",
        project_cost: "",
        delivery_center: "",
      });
      setShowEmployeeForm(false);
      await new Promise(resolve => setTimeout(resolve, 100));
      await onUpdate();
    },
    onError: (error) => {
      console.error("Link employee to opportunity error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes("Network error") && !errorMessage.includes("fetch")) {
        alert(`Failed to link employee: ${errorMessage}`);
      }
    },
  });

  const unlinkFromOpportunity = useUnlinkEmployeeFromOpportunity({
    onSuccess: async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      await onUpdate();
    },
    onError: (error) => {
      console.error("Unlink employee from opportunity error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes("Network error") && !errorMessage.includes("fetch")) {
        alert(`Failed to unlink employee: ${errorMessage}`);
      }
    },
  });

  // Get roles for Opportunity Invoice Center (delivery_center_id)
  const rolesForInvoiceCenter = () => {
    if (!opportunity.delivery_center_id || !deliveryCentersData?.items || !rolesData?.items) return [];
    const invoiceCenter = deliveryCentersData.items.find(dc => dc.id === opportunity.delivery_center_id);
    if (!invoiceCenter) return [];
    return rolesData.items.filter((role) =>
      role.role_rates?.some((r) => r.delivery_center_code === invoiceCenter.code)
    ) || [];
  };

  // Auto-fill Project Rate when Role changes (Rate always comes from Role)
  useEffect(() => {
    if (!employeeFormData.role_id || !selectedRoleData || !opportunity.delivery_center_id) {
      return;
    }

    // Find the role rate that matches opportunity invoice center (may have different currency)
    const matchingRate = selectedRoleData.role_rates?.find(
      (rate) =>
        String(rate.delivery_center_id) === String(opportunity.delivery_center_id)
    );

    let newRate: string;
    let roleRateCurrency: string = opportunity.default_currency || "USD";

    if (matchingRate) {
      let baseRate = matchingRate.external_rate || 0;
      roleRateCurrency = matchingRate.default_currency || "USD";
      const opportunityCurrency = opportunity.default_currency || "USD";
      
      // Check if currency conversion is needed: Role Rate Currency <> Opportunity Invoice Currency
      if (roleRateCurrency.toUpperCase() !== opportunityCurrency.toUpperCase()) {
        baseRate = convertCurrency(baseRate, roleRateCurrency, opportunityCurrency);
      }
      
      // Round to 2 decimal places
      newRate = parseFloat(baseRate.toFixed(2)).toString();
    } else {
      // Fallback to role default rate if no matching rate found
      if (selectedRoleData) {
        const fallbackRate = selectedRoleData.role_external_rate || 0;
        newRate = parseFloat(fallbackRate.toFixed(2)).toString();
      } else {
        return;
      }
    }

    // Update Project Rate only (Rate always comes from Role)
    setEmployeeFormData((prev) => ({
      ...prev,
      project_rate: newRate,
    }));
  }, [employeeFormData.role_id, selectedRoleData, opportunity.delivery_center_id, opportunity.default_currency]);

  // Auto-fill Project Cost when Employee changes (Cost always comes from Employee)
  useEffect(() => {
    if (!employeeFormData.employee_id || !selectedEmployeeData) {
      return;
    }

    // Get employee's delivery center ID from code
    const employeeDeliveryCenterId = selectedEmployeeData.delivery_center 
      ? deliveryCentersData?.items.find(dc => dc.code === selectedEmployeeData.delivery_center)?.id
      : null;
    
    // Compare Opportunity Invoice Center with Employee Delivery Center
    const centersMatch = opportunity.delivery_center_id && employeeDeliveryCenterId 
      ? opportunity.delivery_center_id === employeeDeliveryCenterId
      : false;

    // Determine which rate to use and whether to convert currency
    let employeeCost: number;
    const employeeCurrency = selectedEmployeeData.default_currency || "USD";
    const opportunityCurrency = opportunity.default_currency || "USD";
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
    setEmployeeFormData((prev) => ({
      ...prev,
      project_cost: parseFloat(employeeCost.toFixed(2)).toString(),
    }));
  }, [employeeFormData.employee_id, selectedEmployeeData, opportunity, deliveryCentersData]);

  const handleLinkEmployee = async () => {
    if (!employeeFormData.employee_id) {
      alert("Please select an employee");
      return;
    }

    if (!employeeFormData.role_id || !employeeFormData.start_date || !employeeFormData.end_date || !employeeFormData.project_rate || !employeeFormData.delivery_center) {
      alert("Please fill in all required fields: Role, Start Date, End Date, Project Rate, and Payable Center");
      return;
    }

    const projectCost = employeeFormData.project_cost ? parseFloat(employeeFormData.project_cost) : undefined;

    try {
      await linkToOpportunity.mutateAsync({
        employeeId: employeeFormData.employee_id,
        opportunityId: opportunity.id,
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

  // Get employees from opportunity (loaded from active estimates)
  const opportunityEmployees = opportunity.employees || [];

  return (
    <div className="space-y-6">
      {/* Employees Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Associated Employees</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {opportunityEmployees.length > 0 ? (
            <div className="space-y-4">
              {opportunityEmployees.map((employee: any) => {
                return (
                  <div
                    key={employee.id}
                    className="border rounded-lg p-4 space-y-3 bg-gray-50"
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <div className="flex-1">
                        <span
                          className="text-blue-600 font-semibold text-base cursor-default"
                          title={`Employee: ${employee.first_name} ${employee.last_name}`}
                        >
                          {employee.first_name} {employee.last_name} ({employee.email})
                        </span>
                        {employee.role_name && (
                          <div className="text-sm text-gray-600 mt-1">
                            Role: {employee.role_name}
                          </div>
                        )}
                        {employee.start_date && employee.end_date && (
                          <div className="text-sm text-gray-600 mt-1">
                            {normalizeDateForInput(employee.start_date)} - {normalizeDateForInput(employee.end_date)}
                          </div>
                        )}
                        {employee.project_rate !== undefined && employee.project_rate !== null && (
                          <div className="text-sm text-gray-600 mt-1">
                            Rate: ${employee.project_rate.toFixed(2)}
                          </div>
                        )}
                        {employee.delivery_center && (
                          <div className="text-sm text-gray-600 mt-1">
                            Payable Center: {deliveryCentersData?.items.find(dc => dc.code === employee.delivery_center)?.name || employee.delivery_center}
                          </div>
                        )}
                      </div>
                      {!readOnly && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              if (confirm("Are you sure you want to unlink this employee from the opportunity?")) {
                                try {
                                  await unlinkFromOpportunity.mutateAsync({
                                    employeeId: employee.id,
                                    opportunityId: opportunity.id,
                                  });
                                } catch (err) {
                                  console.error("Failed to unlink employee:", err);
                                }
                              }
                            }}
                            disabled={unlinkFromOpportunity.isPending || hasActiveQuote}
                            className="w-full sm:w-auto text-red-600 hover:text-red-800"
                            title={hasActiveQuote ? "Opportunity is locked by active quote" : ""}
                          >
                            Unlink
                          </Button>
                          {hasActiveQuote && (
                            <span className="flex items-center gap-1 text-yellow-600 text-xs px-2 py-1 bg-yellow-50 rounded">
                              Locked
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No employees associated. Employees are linked through active estimates.</p>
          )}

          {/* Link Employee Form */}
          {!readOnly && (
            <div className="pt-4 border-t space-y-3">
              {!showEmployeeForm ? (
                <Button
                  onClick={() => {
                    setShowEmployeeForm(true);
                    // Scroll to the form after a brief delay to ensure it's rendered
                    setTimeout(() => {
                      employeeFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      // Focus the first input field
                      const firstInput = employeeFormRef.current?.querySelector('select, input') as HTMLElement;
                      firstInput?.focus();
                    }, 100);
                  }}
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  disabled={hasActiveQuote}
                  title={hasActiveQuote ? "Opportunity is locked by active quote" : ""}
                >
                  + Link Employee
                </Button>
              ) : (
                <div ref={employeeFormRef} className="space-y-3 p-3 bg-blue-50 border-2 border-blue-200 rounded-md">
                  <div className="text-sm font-medium mb-2">
                    Link Employee to Opportunity: <span className="text-blue-700 font-semibold">{opportunity.name}</span>
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
                            // Payable Center is metadata only - do not clear Role
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
                        disabled={!opportunity.delivery_center_id}
                      >
                        <option value="">Select role</option>
                        {rolesForInvoiceCenter().map((role) => (
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
                      <Label>Project Cost ({opportunity.default_currency || "USD"})</Label>
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
                      <Label>Project Rate ({opportunity.default_currency || "USD"}) *</Label>
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
                        !employeeFormData.role_id ||
                        !employeeFormData.start_date ||
                        !employeeFormData.end_date ||
                        !employeeFormData.project_rate ||
                        !employeeFormData.delivery_center ||
                        linkToOpportunity.isPending ||
                        hasActiveQuote
                      }
                      size="sm"
                      className="flex-1"
                      title={hasActiveQuote ? "Opportunity is locked by active quote" : ""}
                    >
                      {linkToOpportunity.isPending ? "Linking..." : "Link Employee"}
                    </Button>
                    <Button
                      onClick={() => {
                        setShowEmployeeForm(false);
                        setEmployeeFormData({
                          employee_id: "",
                          role_id: "",
                          start_date: normalizeDateForInput(opportunity.start_date),
                          end_date: normalizeDateForInput(opportunity.end_date),
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
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useLinkEmployeeToEngagement,
  useUnlinkEmployeeFromEngagement,
} from "@/hooks/useEmployees";
import { useEmployees, useEmployee } from "@/hooks/useEmployees";
import { useRoles, useRole } from "@/hooks/useRoles";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { normalizeDateForInput } from "@/lib/utils";
import { convertCurrency, setCurrencyRates } from "@/lib/utils/currency";
import { useCurrencyRates } from "@/hooks/useCurrencyRates";
import type { Engagement } from "@/types/engagement";

interface EngagementRelationshipsProps {
  engagement: Engagement;
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

export function EngagementRelationships({
  engagement,
  onUpdate,
  readOnly = false,
}: EngagementRelationshipsProps) {
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  
  const [employeeFormData, setEmployeeFormData] = useState<LinkEmployeeFormData>({
    employee_id: "",
    role_id: "",
    start_date: normalizeDateForInput(engagement.start_date),
    end_date: normalizeDateForInput(engagement.end_date),
    delivery_center: "",
    project_rate: "",
    project_cost: "",
  });
  
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
  
  // Note: Delivery center will be set when employee is selected (from employee's delivery_center field)
  
  const linkToEngagement = useLinkEmployeeToEngagement({
    onSuccess: async () => {
      setShowEmployeeForm(false);
      setEmployeeFormData({
        employee_id: "",
        role_id: "",
        start_date: normalizeDateForInput(engagement.start_date),
        end_date: normalizeDateForInput(engagement.end_date),
        project_rate: "",
        project_cost: "",
        delivery_center: "", // Will be set when employee is selected
      });
      await new Promise(resolve => setTimeout(resolve, 100));
      await onUpdate();
    },
    onError: (error) => {
      console.error("Link employee error:", error);
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
      console.error("Unlink employee error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to unlink employee: ${errorMessage}`);
    },
  });

  // Get delivery center code from engagement's delivery_center_id (Invoice Center)
  const getInvoiceCenterCode = (): string | null => {
    if (!engagement.delivery_center_id || !deliveryCentersData?.items) return null;
    const invoiceCenter = deliveryCentersData.items.find(dc => dc.id === engagement.delivery_center_id);
    return invoiceCenter?.code || null;
  };

  const rolesForInvoiceCenter = () => {
    const invoiceCenterCode = getInvoiceCenterCode();
    if (!invoiceCenterCode) return [];
    return rolesData?.items.filter((role) =>
      role.role_rates?.some((r) => r.delivery_center_code === invoiceCenterCode)
    ) || [];
  };

  // Auto-fill Project Rate when Role changes (Rate always comes from Role)
  useEffect(() => {
    if (!employeeFormData.role_id || !engagement.delivery_center_id || !selectedRoleData) {
      return;
    }

    // Find the role rate that matches engagement delivery center and currency
    const matchingRate = selectedRoleData.role_rates?.find(
      (rate) =>
        String(rate.delivery_center_id) === String(engagement.delivery_center_id) &&
        rate.default_currency === (engagement.default_currency || "USD")
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
  }, [employeeFormData.role_id, engagement.delivery_center_id, engagement.default_currency, selectedRoleData, engagement]);

  // Auto-fill Project Cost when Employee changes (Cost always comes from Employee)
  useEffect(() => {
    if (!employeeFormData.employee_id || !selectedEmployeeData) {
      return;
    }

    // Update Project Cost from employee's internal_cost_rate
    if (selectedEmployeeData.internal_cost_rate !== undefined) {
      let employeeCost = selectedEmployeeData.internal_cost_rate || 0;
      const employeeCurrency = selectedEmployeeData.default_currency || "USD";
      const engagementCurrency = engagement.default_currency || "USD";

      // Convert to Engagement Invoice Center Currency if different (same logic as Estimation Spreadsheet)
      if (employeeCurrency.toUpperCase() !== engagementCurrency.toUpperCase()) {
        employeeCost = convertCurrency(employeeCost, employeeCurrency, engagementCurrency);
      }

      setEmployeeFormData((prev) => ({
        ...prev,
        project_cost: String(employeeCost),
      }));
    }
  }, [employeeFormData.employee_id, selectedEmployeeData, engagement]);

  const handleLinkEmployee = async () => {
    if (!employeeFormData.employee_id) {
      alert("Please select an employee");
      return;
    }

    if (!employeeFormData.role_id || !employeeFormData.start_date || !employeeFormData.end_date || !employeeFormData.project_rate || !employeeFormData.delivery_center) {
      alert("Please fill in all required fields: Role, Start Date, End Date, Project Rate, and Payable Center");
      return;
    }

    const projectRate = parseFloat(employeeFormData.project_rate);
    if (isNaN(projectRate) || projectRate < 0) {
      alert("Please enter a valid project rate (must be a number >= 0)");
      return;
    }

    const projectCost = employeeFormData.project_cost ? parseFloat(employeeFormData.project_cost) : undefined;
    if (projectCost !== undefined && (isNaN(projectCost) || projectCost < 0)) {
      alert("Please enter a valid project cost (must be a number >= 0)");
      return;
    }

    try {
      await linkToEngagement.mutateAsync({
        employeeId: employeeFormData.employee_id,
        engagementId: engagement.id,
        linkData: {
          role_id: employeeFormData.role_id,
          start_date: employeeFormData.start_date,
          end_date: employeeFormData.end_date,
          project_rate: projectRate,
          project_cost: projectCost,
          delivery_center: employeeFormData.delivery_center,
        },
      });
    } catch (err) {
      console.error("Failed to link employee:", err);
    }
  };

  const handleUnlinkEmployee = async (employeeId: string) => {
    if (!confirm("Are you sure you want to unlink this employee from the engagement?")) {
      return;
    }

    try {
      await unlinkFromEngagement.mutateAsync({
        employeeId,
        engagementId: engagement.id,
      });
    } catch (err) {
      console.error("Failed to unlink employee:", err);
    }
  };

  // Get employees from engagement (if available in the engagement object)
  const engagementEmployees = (engagement as any).employees || [];
  
  // Log dates for debugging
  useEffect(() => {
    if (engagementEmployees.length > 0) {
      engagementEmployees.forEach((employee: any) => {
        if (employee.start_date && employee.end_date) {
          console.log(`[EngagementRelationships ${engagement.id}-${employee.id}] Received dates:`, {
            raw_start_date: employee.start_date,
            raw_end_date: employee.end_date,
            parsed_start_date: normalizeDateForInput(employee.start_date),
            parsed_end_date: normalizeDateForInput(employee.end_date),
          });
        }
      });
    }
  }, [engagementEmployees, engagement.id]);

  return (
    <div className="space-y-6">
      {/* Employees Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Associated Employees</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Display employees linked to engagement */}
          {engagementEmployees.length > 0 ? (
            <div className="space-y-2">
              {engagementEmployees.map((employee: any) => (
                <div
                  key={employee.id}
                  className="flex flex-col gap-2 p-2 bg-white border rounded-md"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="flex-1">
                      <span className="text-blue-600 font-medium text-sm">
                        {employee.first_name} {employee.last_name} ({employee.email})
                      </span>
                      {employee.role_name && (
                        <div className="mt-1 text-xs text-gray-600">
                          <strong>Role:</strong> {employee.role_name}
                        </div>
                      )}
                      {employee.start_date && employee.end_date && (
                        <div className="mt-1 text-xs text-gray-600">
                          <strong>Dates:</strong> {normalizeDateForInput(employee.start_date)} - {normalizeDateForInput(employee.end_date)}
                        </div>
                      )}
                      {employee.project_rate !== undefined && employee.project_rate !== null && (
                        <div className="mt-1 text-xs text-gray-600">
                          <strong>Project Rate:</strong> ${employee.project_rate.toFixed(2)}
                        </div>
                      )}
                      {employee.delivery_center && (
                        <div className="mt-1 text-xs text-gray-600">
                          <strong>Payable Center:</strong> {deliveryCentersData?.items.find(dc => dc.code === employee.delivery_center)?.name || employee.delivery_center}
                        </div>
                      )}
                    </div>
                    {!readOnly && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUnlinkEmployee(employee.id)}
                        className="w-full sm:w-auto"
                      >
                        Unlink
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No employees associated</p>
          )}

          {/* Link Employee */}
          {!readOnly && (
            <div className="pt-4 border-t space-y-3">
              {!showEmployeeForm ? (
                <Button
                  onClick={() => {
                    setEmployeeFormData({
                      employee_id: "",
                      role_id: "",
                      start_date: normalizeDateForInput(engagement.start_date),
                      end_date: normalizeDateForInput(engagement.end_date),
                      project_rate: "",
                      project_cost: "",
                      delivery_center: "", // Will be set when employee is selected
                    });
                    setShowEmployeeForm(true);
                  }}
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  + Link Employee
                </Button>
              ) : (
                <div className="space-y-3 p-3 bg-gray-50 border rounded-md">
                  <div className="text-sm font-medium mb-2">Link Employee</div>
                  
                  <div>
                    <Label>Select Employee *</Label>
                    <Select
                      value={employeeFormData.employee_id}
                      onChange={(e) => {
                        const employeeId = e.target.value;
                        const selectedEmployee = employeesData?.items.find(emp => emp.id === employeeId);
                        // Use employee's delivery center as default (Payable Center)
                        const employeeDcCode = selectedEmployee?.delivery_center || "";
                        // Only update employee_id and delivery_center here - Cost will be auto-filled by useEffect
                        setEmployeeFormData({ 
                          ...employeeFormData, 
                          employee_id: employeeId,
                          delivery_center: employeeDcCode, // Default to employee's delivery center (Payable Center)
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
                            // Do NOT clear role_id - Payable Center is reference only and doesn't affect Role
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
                        disabled={!engagement.delivery_center_id}
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
                        setEmployeeFormData({
                          employee_id: "",
                          role_id: "",
                          start_date: engagement.start_date || "",
                          end_date: engagement.end_date || "",
                          project_rate: "",
                          project_cost: "",
                          delivery_center: "", // Will be set when employee is selected
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

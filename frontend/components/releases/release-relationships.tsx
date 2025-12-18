"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useLinkEmployeeToRelease,
  useUnlinkEmployeeFromRelease,
} from "@/hooks/useEmployees";
import { useEmployees } from "@/hooks/useEmployees";
import { useRoles } from "@/hooks/useRoles";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { normalizeDateForInput } from "@/lib/utils";
import type { Release } from "@/types/release";

interface ReleaseRelationshipsProps {
  release: Release;
  onUpdate: () => void;
  readOnly?: boolean;
}

interface LinkEmployeeFormData {
  employee_id: string;
  role_id: string;
  start_date: string;
  end_date: string;
  project_rate: string;
  delivery_center: string;
}

export function ReleaseRelationships({
  release,
  onUpdate,
  readOnly = false,
}: ReleaseRelationshipsProps) {
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  
  const { data: employeesData } = useEmployees({ limit: 1000 });
  const { data: rolesData } = useRoles({ limit: 1000 });
  const { data: deliveryCentersData } = useDeliveryCenters();

  const [employeeFormData, setEmployeeFormData] = useState<LinkEmployeeFormData>({
    employee_id: "",
    role_id: "",
    start_date: normalizeDateForInput(release.start_date),
    end_date: normalizeDateForInput(release.end_date),
    delivery_center: "",
    project_rate: "",
  });
  
  // Note: Delivery center will be set when employee is selected (from employee's delivery_center field)
  
  const linkToRelease = useLinkEmployeeToRelease({
    onSuccess: async () => {
      setShowEmployeeForm(false);
      setEmployeeFormData({
        employee_id: "",
        role_id: "",
        start_date: normalizeDateForInput(release.start_date),
        end_date: normalizeDateForInput(release.end_date),
        project_rate: "",
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

  const unlinkFromRelease = useUnlinkEmployeeFromRelease({
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

  const rolesForDeliveryCenter = (dc: string) =>
    rolesData?.items.filter((role) =>
      role.role_rates?.some((r) => r.delivery_center_code === dc)
    ) || [];

  const handleLinkEmployee = async () => {
    if (!employeeFormData.employee_id) {
      alert("Please select an employee");
      return;
    }

    if (!employeeFormData.role_id || !employeeFormData.start_date || !employeeFormData.end_date || !employeeFormData.project_rate || !employeeFormData.delivery_center) {
      alert("Please fill in all required fields: Role, Start Date, End Date, Project Rate, and Delivery Center");
      return;
    }

    const projectRate = parseFloat(employeeFormData.project_rate);
    if (isNaN(projectRate) || projectRate < 0) {
      alert("Please enter a valid project rate (must be a number >= 0)");
      return;
    }

    try {
      await linkToRelease.mutateAsync({
        employeeId: employeeFormData.employee_id,
        releaseId: release.id,
        linkData: {
          role_id: employeeFormData.role_id,
          start_date: employeeFormData.start_date,
          end_date: employeeFormData.end_date,
          project_rate: projectRate,
          delivery_center: employeeFormData.delivery_center,
        },
      });
    } catch (err) {
      console.error("Failed to link employee:", err);
    }
  };

  const handleUnlinkEmployee = async (employeeId: string) => {
    if (!confirm("Are you sure you want to unlink this employee from the release?")) {
      return;
    }

    try {
      await unlinkFromRelease.mutateAsync({
        employeeId,
        releaseId: release.id,
      });
    } catch (err) {
      console.error("Failed to unlink employee:", err);
    }
  };

  // Get employees from release (if available in the release object)
  const releaseEmployees = (release as any).employees || [];
  
  // Log dates for debugging
  useEffect(() => {
    if (releaseEmployees.length > 0) {
      releaseEmployees.forEach((employee: any) => {
        if (employee.start_date && employee.end_date) {
          console.log(`[ReleaseRelationships ${release.id}-${employee.id}] Received dates:`, {
            raw_start_date: employee.start_date,
            raw_end_date: employee.end_date,
            parsed_start_date: normalizeDateForInput(employee.start_date),
            parsed_end_date: normalizeDateForInput(employee.end_date),
          });
        }
      });
    }
  }, [releaseEmployees, release.id]);

  return (
    <div className="space-y-6">
      {/* Employees Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Associated Employees</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Display employees linked to release */}
          {releaseEmployees.length > 0 ? (
            <div className="space-y-2">
              {releaseEmployees.map((employee: any) => (
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
                          <strong>Delivery Center:</strong> {deliveryCentersData?.items.find(dc => dc.code === employee.delivery_center)?.name || employee.delivery_center}
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
                      start_date: normalizeDateForInput(release.start_date),
                      end_date: normalizeDateForInput(release.end_date),
                      project_rate: "",
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
                        // Use employee's delivery center as default
                        const employeeDcCode = selectedEmployee?.delivery_center || "";
                        setEmployeeFormData({ 
                          ...employeeFormData, 
                          employee_id: employeeId,
                          project_rate: selectedEmployee?.external_bill_rate?.toString() || "",
                          delivery_center: employeeDcCode, // Default to employee's delivery center
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
                        setEmployeeFormData({
                          employee_id: "",
                          role_id: "",
                          start_date: release.start_date || "",
                          end_date: release.end_date || "",
                          project_rate: "",
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


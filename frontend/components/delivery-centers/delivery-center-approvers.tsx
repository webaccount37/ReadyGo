"use client";

import { useState } from "react";
import {
  useDeliveryCenterApprovers,
  useEmployeesForDeliveryCenter,
  useAddDeliveryCenterApprover,
  useRemoveDeliveryCenterApprover,
} from "@/hooks/useDeliveryCenters";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";
import type { EmployeeApproverSummary } from "@/types/delivery-center";

interface DeliveryCenterApproversProps {
  deliveryCenterId: string;
  readOnly?: boolean;
}

export function DeliveryCenterApprovers({
  deliveryCenterId,
  readOnly = false,
}: DeliveryCenterApproversProps) {
  const { data: approversData, isLoading: approversLoading, refetch: refetchApprovers } =
    useDeliveryCenterApprovers(deliveryCenterId);
  const { data: employeesData, isLoading: employeesLoading } =
    useEmployeesForDeliveryCenter(deliveryCenterId);
  const addApprover = useAddDeliveryCenterApprover();
  const removeApprover = useRemoveDeliveryCenterApprover();

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) {
      alert("Please select an employee");
      return;
    }

    try {
      await addApprover.mutateAsync({
        deliveryCenterId,
        data: { employee_id: selectedEmployeeId },
      });
      setSelectedEmployeeId("");
      refetchApprovers();
    } catch (err) {
      console.error("Failed to add approver:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRemove = async (employeeId: string) => {
    if (confirm("Are you sure you want to remove this approver?")) {
      try {
        await removeApprover.mutateAsync({
          deliveryCenterId,
          employeeId,
        });
        refetchApprovers();
      } catch (err) {
        console.error("Failed to remove approver:", err);
        alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  if (approversLoading || employeesLoading) {
    return <div className="text-sm text-gray-500">Loading approvers...</div>;
  }

  const approvers = approversData?.items || [];
  const employees = employeesData || [];
  
  // Filter out employees that are already approvers
  const availableEmployees = employees.filter(
    (emp) => !approvers.some((approver) => approver.employee_id === emp.id)
  );

  return (
    <div className="space-y-4">
      {!readOnly && (
        <form onSubmit={handleAdd} className="space-y-2 p-3 border rounded">
          <div>
            <Label htmlFor="employee_select">Add Approver</Label>
            <div className="flex gap-2">
              <Select
                id="employee_select"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="flex-1"
              >
                <option value="">Select an employee...</option>
                {availableEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} ({emp.email})
                  </option>
                ))}
              </Select>
              <Button
                type="submit"
                size="sm"
                disabled={!selectedEmployeeId || addApprover.isPending}
              >
                {addApprover.isPending ? "Adding..." : "Add"}
              </Button>
            </div>
            {availableEmployees.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">
                All employees for this delivery center are already approvers.
              </p>
            )}
          </div>
        </form>
      )}

      <div>
        <Label>Approvers ({approvers.length})</Label>
        {approvers.length > 0 ? (
          <div className="mt-2 space-y-2">
            {approvers.map((approver) => (
              <div
                key={approver.employee_id}
                className="flex items-center justify-between p-2 border rounded bg-gray-50"
              >
                <div>
                  <div className="text-sm font-medium">
                    {approver.employee.first_name} {approver.employee.last_name}
                  </div>
                  <div className="text-xs text-gray-500">{approver.employee.email}</div>
                </div>
                {!readOnly && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRemove(approver.employee_id)}
                    className="text-red-600 hover:text-red-700"
                    disabled={removeApprover.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 mt-2">No approvers assigned.</p>
        )}
      </div>
    </div>
  );
}


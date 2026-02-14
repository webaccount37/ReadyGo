"use client";

import { useState } from "react";
import { useEmployees } from "@/hooks/useEmployees";
import { useUpdateTimesheetApprovers } from "@/hooks/useEngagements";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";
import type { EngagementDetailResponse } from "@/types/engagement";

interface EngagementTimesheetApproversProps {
  engagement: EngagementDetailResponse;
  onRefetch?: () => Promise<unknown>;
}

export function EngagementTimesheetApprovers({
  engagement,
  onRefetch,
}: EngagementTimesheetApproversProps) {
  const { data: employeesData, isLoading: employeesLoading } = useEmployees({ limit: 1000 });
  const updateApprovers = useUpdateTimesheetApprovers({
    onSuccess: async () => {
      if (onRefetch) await onRefetch();
    },
    onError: (error) => {
      alert(`Error: ${error.message}`);
    },
  });

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");

  const approvers = engagement.timesheet_approvers || [];
  const employees = employeesData?.items || [];

  const availableEmployees = employees.filter(
    (emp) => !approvers.some((a) => a.employee_id === emp.id)
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) return;
    const newIds = [...approvers.map((a) => a.employee_id), selectedEmployeeId];
    try {
      await updateApprovers.mutateAsync({ engagementId: engagement.id, employeeIds: newIds });
      setSelectedEmployeeId("");
    } catch {
      // Error handled in onError
    }
  };

  const handleRemove = async (employeeId: string) => {
    const newIds = approvers.map((a) => a.employee_id).filter((id) => id !== employeeId);
    try {
      await updateApprovers.mutateAsync({ engagementId: engagement.id, employeeIds: newIds });
    } catch {
      // Error handled in onError
    }
  };

  if (employeesLoading) {
    return <div className="text-sm text-gray-500">Loading employees...</div>;
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="space-y-2 p-3 border rounded">
        <div>
          <Label htmlFor="timesheet_approver_select">Add Timesheet Approver</Label>
          <div className="flex gap-2">
            <Select
              id="timesheet_approver_select"
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
              disabled={!selectedEmployeeId || updateApprovers.isPending}
            >
              {updateApprovers.isPending ? "Adding..." : "Add"}
            </Button>
          </div>
        </div>
      </form>

      <div>
        <Label>Timesheet Approvers ({approvers.length})</Label>
        {approvers.length > 0 ? (
          <div className="mt-2 space-y-2">
            {approvers.map((approver) => (
              <div
                key={approver.employee_id}
                className="flex items-center justify-between p-2 border rounded bg-gray-50"
              >
                <div className="text-sm font-medium">
                  {approver.employee_name || approver.employee_id}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRemove(approver.employee_id)}
                  className="text-red-600 hover:text-red-700"
                  disabled={updateApprovers.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 mt-2">
            No timesheet approvers assigned. Add approvers above.
          </p>
        )}
      </div>
    </div>
  );
}

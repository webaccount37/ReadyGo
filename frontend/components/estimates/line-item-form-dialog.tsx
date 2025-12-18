"use client";

import { useState } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useRoles } from "@/hooks/useRoles";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useEmployees } from "@/hooks/useEmployees";
import type { EstimateLineItemCreate, EstimateLineItemUpdate } from "@/types/estimate";

interface LineItemFormDialogProps {
  estimateId: string;
  initialData?: Partial<EstimateLineItemCreate>;
  onSubmit: (data: EstimateLineItemCreate | EstimateLineItemUpdate) => Promise<void>;
  onClose: () => void;
  isLoading?: boolean;
}

export function LineItemFormDialog({
  estimateId: _estimateId,
  initialData,
  onSubmit,
  onClose,
  isLoading = false,
}: LineItemFormDialogProps) {
  const { data: rolesData } = useRoles();
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: employeesData } = useEmployees({ limit: 100 });

  const [formData, setFormData] = useState<EstimateLineItemCreate>({
    role_id: initialData?.role_id || "",
    delivery_center_id: initialData?.delivery_center_id || "",
    employee_id: initialData?.employee_id || "",
    rate: initialData?.rate || "",
    cost: initialData?.cost || "",
    currency: initialData?.currency || "",
    start_date: initialData?.start_date || "",
    end_date: initialData?.end_date || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split("T")[0];
  const defaultEndDate = new Date();
  defaultEndDate.setMonth(defaultEndDate.getMonth() + 3);
  const defaultEndDateStr = defaultEndDate.toISOString().split("T")[0];

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogHeader>
        <DialogTitle>
          {initialData ? "Edit Line Item" : "Add Line Item"}
        </DialogTitle>
      </DialogHeader>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="role_id">Role *</Label>
            <Select
              id="role_id"
              value={formData.role_id}
              onChange={(e) =>
                setFormData({ ...formData, role_id: e.target.value })
              }
              required
            >
              <option value="">Select a role</option>
              {rolesData?.items?.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.role_name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="delivery_center_id">Delivery Center *</Label>
            <Select
              id="delivery_center_id"
              value={formData.delivery_center_id}
              onChange={(e) =>
                setFormData({ ...formData, delivery_center_id: e.target.value })
              }
              required
            >
              <option value="">Select a delivery center</option>
              {deliveryCentersData?.items?.map((dc) => (
                <option key={dc.id} value={dc.id}>
                  {dc.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="employee_id">Employee (Optional)</Label>
            <Select
              id="employee_id"
              value={formData.employee_id || ""}
              onChange={(e) =>
                setFormData({ ...formData, employee_id: e.target.value || undefined })
              }
            >
              <option value="">None</option>
              {employeesData?.items?.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.first_name} {employee.last_name} ({employee.email})
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rate">Rate</Label>
              <Input
                id="rate"
                type="number"
                step="0.01"
                value={formData.rate || ""}
                onChange={(e) =>
                  setFormData({ ...formData, rate: e.target.value })
                }
                placeholder="Auto-filled from role/employee"
              />
            </div>
            <div>
              <Label htmlFor="cost">Cost</Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                value={formData.cost || ""}
                onChange={(e) =>
                  setFormData({ ...formData, cost: e.target.value })
                }
                placeholder="Auto-filled from role/employee"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start_date">Start Date *</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date || today}
                onChange={(e) =>
                  setFormData({ ...formData, start_date: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="end_date">End Date *</Label>
              <Input
                id="end_date"
                type="date"
                value={formData.end_date || defaultEndDateStr}
                onChange={(e) =>
                  setFormData({ ...formData, end_date: e.target.value })
                }
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : initialData ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}


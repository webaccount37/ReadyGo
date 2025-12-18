"use client";

import { useState, useEffect, useRef } from "react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useRoles } from "@/hooks/useRoles";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useEmployees } from "@/hooks/useEmployees";
import { useCreateLineItem } from "@/hooks/useEstimates";
import type { EstimateLineItemCreate } from "@/types/estimate";

interface EstimateEditableRowProps {
  estimateId: string;
  weeks: Date[];
  currency: string;
  onSave: () => void; // Intentionally unused - row stays open for quick entry
  onCancel: () => void;
}

export function EstimateEditableRow({
  estimateId,
  weeks,
  currency,
  onSave: _onSave, // Intentionally unused - row stays open for quick entry
  onCancel,
}: EstimateEditableRowProps) {
  const { data: rolesData } = useRoles();
  const { data: deliveryCentersData } = useDeliveryCenters();
  const { data: employeesData } = useEmployees({ limit: 100 });
  const createLineItem = useCreateLineItem();

  const [formData, setFormData] = useState<EstimateLineItemCreate>({
    role_id: "",
    delivery_center_id: "",
    employee_id: "",
    rate: "",
    cost: "",
    currency: currency,
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
  });

  const [isSaving, setIsSaving] = useState(false);
  const roleInputRef = useRef<HTMLSelectElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    if (roleInputRef.current) {
      roleInputRef.current.focus();
    }
  }, []);

  const handleSave = async () => {
    if (!formData.role_id || !formData.delivery_center_id) {
      alert("Please select a Role and Delivery Center");
      return;
    }

    setIsSaving(true);
    try {
      await createLineItem.mutateAsync({
        estimateId,
        data: formData,
      });
      // Reset form for next entry
      setFormData({
        role_id: "",
        delivery_center_id: "",
        employee_id: "",
        rate: "",
        cost: "",
        currency: currency,
        start_date: new Date().toISOString().split("T")[0],
        end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
      });
      setIsSaving(false);
      // Keep the row open and focus back to role
      setTimeout(() => {
        if (roleInputRef.current) {
          roleInputRef.current.focus();
        }
      }, 100);
      // Don't call onSave() - keep the row open for quick entry
    } catch (err) {
      console.error("Failed to create line item:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, field: string) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (field === "delivery_center" && formData.delivery_center_id) {
        // Move to role
        document.querySelector<HTMLSelectElement>('[data-field="role"]')?.focus();
      } else if (field === "role" && formData.role_id) {
        // Move to employee
        document.querySelector<HTMLSelectElement>('[data-field="employee"]')?.focus();
      } else if (field === "employee") {
        // Move to cost
        document.querySelector<HTMLInputElement>('[data-field="cost"]')?.focus();
      } else if (field === "cost") {
        // Move to rate
        document.querySelector<HTMLInputElement>('[data-field="rate"]')?.focus();
      } else if (field === "rate") {
        // Move to start date
        document.querySelector<HTMLInputElement>('[data-field="start_date"]')?.focus();
      } else if (field === "start_date") {
        // Move to end date
        document.querySelector<HTMLInputElement>('[data-field="end_date"]')?.focus();
      } else if (field === "end_date") {
        // Save if all required fields are filled
        if (formData.role_id && formData.delivery_center_id) {
          handleSave();
        }
      }
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <tr className="bg-blue-50 hover:bg-blue-100">
      <td className="border border-gray-300 px-2 py-1">
        <Select
          data-field="delivery_center"
          value={formData.delivery_center_id}
          onChange={(e) =>
            setFormData({ ...formData, delivery_center_id: e.target.value })
          }
          onKeyDown={(e) => handleKeyDown(e, "delivery_center")}
          className="text-xs h-7 w-full"
        >
          <option value="">Select...</option>
          {deliveryCentersData?.items?.map((dc) => (
            <option key={dc.id} value={dc.id}>
              {dc.name}
            </option>
          ))}
        </Select>
      </td>
      <td className="sticky left-0 z-10 bg-blue-50 border border-gray-300 px-2 py-1">
        <Select
          data-field="role"
          value={formData.role_id}
          onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
          onKeyDown={(e) => handleKeyDown(e, "role")}
          className="text-xs h-7 w-full"
        >
          <option value="">Select...</option>
          {rolesData?.items?.map((role) => (
            <option key={role.id} value={role.id}>
              {role.role_name}
            </option>
          ))}
        </Select>
      </td>
      <td className="border border-gray-300 px-2 py-1">
        <Select
          data-field="employee"
          value={formData.employee_id || ""}
          onChange={(e) =>
            setFormData({ ...formData, employee_id: e.target.value || undefined })
          }
          onKeyDown={(e) => handleKeyDown(e, "employee")}
          className="text-xs h-7 w-full"
        >
          <option value="">-</option>
          {employeesData?.items?.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.first_name} {employee.last_name}
            </option>
          ))}
        </Select>
      </td>
      <td className="border border-gray-300 px-2 py-1">
        <Input
          data-field="cost"
          type="number"
          step="0.01"
          value={formData.cost || ""}
          onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
          onKeyDown={(e) => handleKeyDown(e, "cost")}
          placeholder="Auto"
          className="text-xs h-7 w-full"
        />
      </td>
      <td className="border border-gray-300 px-2 py-1">
        <Input
          data-field="rate"
          type="number"
          step="0.01"
          value={formData.rate || ""}
          onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
          onKeyDown={(e) => handleKeyDown(e, "rate")}
          placeholder="Auto"
          className="text-xs h-7 w-full"
        />
      </td>
      <td className="border border-gray-300 px-2 py-1">
        <Input
          data-field="start_date"
          type="date"
          value={formData.start_date}
          onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
          onKeyDown={(e) => handleKeyDown(e, "start_date")}
          className="text-xs h-7 w-full"
        />
      </td>
      <td className="border border-gray-300 px-2 py-1">
        <Input
          data-field="end_date"
          type="date"
          value={formData.end_date}
          onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
          onKeyDown={(e) => handleKeyDown(e, "end_date")}
          className="text-xs h-7 w-full"
        />
      </td>
      {weeks.map((week) => (
        <td
          key={week.toISOString()}
          className="border border-gray-300 px-1 py-1 bg-gray-50"
        >
          <Input
            type="number"
            step="0.1"
            placeholder="0"
            className="text-xs h-7 w-full text-center"
            disabled
          />
        </td>
      ))}
      <td className="sticky right-[200px] z-10 bg-blue-50 border border-gray-300 px-2 py-1 text-xs font-semibold">
        -
      </td>
      <td className="sticky right-[100px] z-10 bg-blue-50 border border-gray-300 px-2 py-1 text-xs font-semibold">
        -
      </td>
      <td className="sticky right-0 z-10 bg-blue-50 border border-gray-300 px-2 py-1 text-xs font-semibold">
        -
      </td>
      <td className="border border-gray-300 px-2 py-1">
        <div className="flex gap-1">
          <button
            onClick={handleSave}
            disabled={isSaving || !formData.role_id || !formData.delivery_center_id}
            className="text-xs text-blue-600 hover:underline disabled:text-gray-400 disabled:cursor-not-allowed"
            title="Save"
          >
            ✓
          </button>
          <button
            onClick={onCancel}
            className="text-xs text-red-600 hover:underline"
            title="Cancel"
          >
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}


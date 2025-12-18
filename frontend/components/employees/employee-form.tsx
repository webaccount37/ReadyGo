"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { EmployeeCreate, EmployeeUpdate } from "@/types/employee";
import { CURRENCIES } from "@/types/currency";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";

interface EmployeeFormProps {
  initialData?: Partial<EmployeeCreate>;
  onSubmit: (data: EmployeeCreate | EmployeeUpdate) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  showRelationships?: boolean;
  relationshipsComponent?: React.ReactNode;
  readOnly?: boolean;
}

export function EmployeeForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  showRelationships = false,
  relationshipsComponent,
  readOnly = false,
}: EmployeeFormProps) {
  const { data: deliveryCentersData } = useDeliveryCenters();
  
  const [formData, setFormData] = useState<EmployeeCreate>({
    first_name: initialData?.first_name || "",
    last_name: initialData?.last_name || "",
    email: initialData?.email || "",
    employee_type: initialData?.employee_type || "full-time",
    status: initialData?.status || "active",
    role_title: initialData?.role_title || "",
    skills: initialData?.skills || [],
    internal_cost_rate: initialData?.internal_cost_rate ?? 0,
    internal_bill_rate: initialData?.internal_bill_rate ?? 0,
    external_bill_rate: initialData?.external_bill_rate ?? 0,
    start_date: initialData?.start_date || "",
    end_date: initialData?.end_date || undefined,
    billable: initialData?.billable ?? true,
    default_currency: initialData?.default_currency || "USD",
    timezone: initialData?.timezone || "UTC",
    delivery_center: initialData?.delivery_center || deliveryCentersData?.items[0]?.code || "",
  });

  const [skillsInput, setSkillsInput] = useState(
    formData.skills?.join(", ") || ""
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const submitData: EmployeeCreate | EmployeeUpdate = {
        ...formData,
        skills: skillsInput
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      
      // start_date is required, end_date can be undefined to clear it
      submitData.start_date = formData.start_date;
      submitData.end_date = formData.end_date && formData.end_date !== "" ? formData.end_date : undefined;
      
      // Convert empty strings to undefined for optional string fields
      submitData.role_title = formData.role_title && formData.role_title !== "" ? formData.role_title : undefined;
      
      await onSubmit(submitData);
    } catch (error) {
      console.error("Form submission error:", error);
      // Error handling is done in parent component
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-gray-800">Basics</p>
        <p className="text-xs text-gray-500">Identity, type, and status.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="first_name">First Name *</Label>
          <Input
            id="first_name"
            value={formData.first_name}
            onChange={(e) =>
              setFormData({ ...formData, first_name: e.target.value })
            }
            required
            disabled={readOnly}
            readOnly={readOnly}
          />
        </div>
        <div>
          <Label htmlFor="last_name">Last Name *</Label>
          <Input
            id="last_name"
            value={formData.last_name}
            onChange={(e) =>
              setFormData({ ...formData, last_name: e.target.value })
            }
            required
            disabled={readOnly}
            readOnly={readOnly}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="email">Email *</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) =>
            setFormData({ ...formData, email: e.target.value })
          }
          required
          disabled={readOnly}
          readOnly={readOnly}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="employee_type">Employee Type *</Label>
          <Select
            id="employee_type"
            value={formData.employee_type}
            onChange={(e) =>
              setFormData({
                ...formData,
                employee_type: e.target.value as "full-time" | "contract",
              })
            }
            disabled={readOnly}
            required
          >
            <option value="full-time">Full-time</option>
            <option value="contract">Contract</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="status">Status *</Label>
          <Select
            id="status"
            value={formData.status}
            onChange={(e) =>
              setFormData({
                ...formData,
                status: e.target.value as "active" | "inactive" | "on-leave",
              })
            }
            disabled={readOnly}
            required
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="on-leave">On Leave</option>
          </Select>
        </div>
      </div>

      <div className="space-y-1 pt-2">
        <p className="text-sm font-semibold text-gray-800">Role & Skills</p>
        <p className="text-xs text-gray-500">Optional title and skills for quick reference.</p>
      </div>

      <div>
        <Label htmlFor="role_title">Role Title</Label>
        <Input
          id="role_title"
          value={formData.role_title || ""}
          onChange={(e) =>
            setFormData({ ...formData, role_title: e.target.value })
          }
          disabled={readOnly}
          readOnly={readOnly}
        />
      </div>

      <div>
        <Label htmlFor="skills">Skills (comma-separated)</Label>
        <Input
          id="skills"
          value={skillsInput}
          onChange={(e) => setSkillsInput(e.target.value)}
          placeholder="e.g., Python, React, Project Management"
          disabled={readOnly}
          readOnly={readOnly}
        />
      </div>

      <div className="space-y-1 pt-2">
        <p className="text-sm font-semibold text-gray-800">Rates</p>
        <p className="text-xs text-gray-500">Capture internal and external bill rates.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="internal_cost_rate">Internal Cost Rate *</Label>
          <Input
            id="internal_cost_rate"
            type="number"
            step="0.01"
            value={formData.internal_cost_rate ?? ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                internal_cost_rate: e.target.value
                  ? parseFloat(e.target.value)
                  : 0,
              })
            }
            disabled={readOnly}
            readOnly={readOnly}
            required
          />
        </div>
        <div>
          <Label htmlFor="internal_bill_rate">Internal Bill Rate *</Label>
          <Input
            id="internal_bill_rate"
            type="number"
            step="0.01"
            value={formData.internal_bill_rate ?? ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                internal_bill_rate: e.target.value
                  ? parseFloat(e.target.value)
                  : 0,
              })
            }
            disabled={readOnly}
            readOnly={readOnly}
            required
          />
        </div>
        <div>
          <Label htmlFor="external_bill_rate">External Bill Rate *</Label>
          <Input
            id="external_bill_rate"
            type="number"
            step="0.01"
            value={formData.external_bill_rate ?? ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                external_bill_rate: e.target.value
                  ? parseFloat(e.target.value)
                  : 0,
              })
            }
            disabled={readOnly}
            readOnly={readOnly}
            required
          />
        </div>
      </div>

      <div className="space-y-1 pt-2">
        <p className="text-sm font-semibold text-gray-800">Dates</p>
        <p className="text-xs text-gray-500">Set start/end for availability.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="start_date">Start Date *</Label>
          <Input
            id="start_date"
            type="date"
            value={formData.start_date || ""}
            onChange={(e) => {
              const value = e.target.value;
              setFormData({ ...formData, start_date: value });
            }}
            disabled={readOnly}
            readOnly={readOnly}
            required
          />
        </div>
        <div>
          <Label htmlFor="end_date">End Date</Label>
          <Input
            id="end_date"
            type="date"
            value={formData.end_date || ""}
            onChange={(e) => {
              const value = e.target.value;
              setFormData({ ...formData, end_date: value === "" ? undefined : value });
            }}
            disabled={readOnly}
            readOnly={readOnly}
          />
        </div>
      </div>

      <div className="space-y-1 pt-2">
        <p className="text-sm font-semibold text-gray-800">Defaults</p>
        <p className="text-xs text-gray-500">Currency, delivery center, and timezone.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="default_currency">Default Currency</Label>
          <Select
            id="default_currency"
            value={formData.default_currency || "USD"}
            onChange={(e) =>
              setFormData({ ...formData, default_currency: e.target.value })
            }
            disabled={readOnly}
          >
            {CURRENCIES.map((currency) => (
              <option key={currency.value} value={currency.value}>
                {currency.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="delivery_center">Delivery Center *</Label>
          <Select
            id="delivery_center"
            value={formData.delivery_center}
            onChange={(e) =>
              setFormData({ ...formData, delivery_center: e.target.value })
            }
            required
            disabled={readOnly}
          >
            {deliveryCentersData?.items.map((dc) => (
              <option key={dc.code} value={dc.code}>
                {dc.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="timezone">Timezone</Label>
          <Input
            id="timezone"
            value={formData.timezone}
            onChange={(e) =>
              setFormData({ ...formData, timezone: e.target.value })
            }
            disabled={readOnly}
            readOnly={readOnly}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="billable"
          checked={formData.billable}
          onChange={(e) =>
            setFormData({ ...formData, billable: e.target.checked })
          }
          className="h-4 w-4"
          disabled={readOnly}
        />
        <Label htmlFor="billable" className={readOnly ? "" : "cursor-pointer"}>
          Billable
        </Label>
      </div>

      {showRelationships && relationshipsComponent && (
        <div className="pt-6 border-t mt-6">
          {relationshipsComponent}
        </div>
      )}

      {!readOnly && (
        <div className="flex justify-end gap-2 pt-4 border-t mt-6">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : initialData ? "Update Employee" : "Create Employee"}
          </Button>
        </div>
      )}
      {readOnly && (
        <div className="flex justify-end gap-2 pt-4 border-t mt-6">
          <Button type="button" variant="outline" onClick={onCancel}>
            Close
          </Button>
        </div>
      )}
    </form>
  );
}


"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useOpportunities } from "@/hooks/useOpportunities";
import type { EstimateCreate, EstimateUpdate } from "@/types/estimate";

interface EstimateFormProps {
  initialData?: Partial<EstimateCreate>;
  onSubmit: (data: EstimateCreate | EstimateUpdate) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function EstimateForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}: EstimateFormProps) {
  const { data: opportunitiesData } = useOpportunities({ limit: 100 });
  const [formData, setFormData] = useState<EstimateCreate>({
    opportunity_id: initialData?.opportunity_id || "",
    name: initialData?.name || "",
    description: initialData?.description || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="opportunity_id">Opportunity *</Label>
        <Select
          id="opportunity_id"
          value={formData.opportunity_id}
          onChange={(e) =>
            setFormData({ ...formData, opportunity_id: e.target.value })
          }
          required
          disabled={!!initialData?.opportunity_id}
        >
          <option value="">Select an opportunity</option>
          {opportunitiesData?.items?.map((opportunity) => (
            <option key={opportunity.id} value={opportunity.id}>
              {opportunity.name} {opportunity.account_name && `(${opportunity.account_name})`}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          value={formData.description || ""}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
          className="w-full min-h-[100px] px-3 py-2 border border-gray-300 rounded-md"
          rows={4}
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" onClick={onCancel} variant="outline">
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : initialData ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}


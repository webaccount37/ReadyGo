"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { DeliveryCenterCreate, DeliveryCenterUpdate } from "@/types/delivery-center";
import { CURRENCIES } from "@/types/currency";

type DeliveryCenterFormValues = {
  name: string;
  code: string;
  default_currency: string;
  country_code: string;
};

interface DeliveryCenterFormProps {
  initialData?: Partial<DeliveryCenterCreate>;
  onSubmit: (data: DeliveryCenterCreate | DeliveryCenterUpdate) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  readOnly?: boolean;
}

export function DeliveryCenterForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  readOnly = false,
}: DeliveryCenterFormProps) {
  const [formData, setFormData] = useState<DeliveryCenterFormValues>({
    name: initialData?.name || "",
    code: initialData?.code || "",
    default_currency: initialData?.default_currency || "USD",
    country_code: initialData?.country_code ?? "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("Name is required.");
      return;
    }

    if (!formData.code.trim()) {
      alert("Code is required.");
      return;
    }

    // Normalize code to lowercase with hyphens
    const normalizedCode = formData.code.trim().toLowerCase().replace(/\s+/g, "-");

    await onSubmit({
      name: formData.name.trim(),
      code: normalizedCode,
      default_currency: formData.default_currency,
      country_code: formData.country_code.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-gray-800">Basics</p>
        <p className="text-xs text-gray-500">Name, code, and currency configuration.</p>
      </div>

      <div>
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) =>
            setFormData({ ...formData, name: e.target.value })
          }
          required
          disabled={readOnly}
        />
      </div>

      <div>
        <Label htmlFor="code">Code *</Label>
        <Input
          id="code"
          value={formData.code}
          onChange={(e) =>
            setFormData({ ...formData, code: e.target.value })
          }
          required
          disabled={readOnly}
          placeholder="e.g., north-america"
        />
        <p className="text-xs text-gray-500 mt-1">
          Code will be normalized to lowercase with hyphens (e.g., &quot;North America&quot; → &quot;north-america&quot;)
        </p>
      </div>

      <div>
        <Label htmlFor="country_code">Country Code</Label>
        <Input
          id="country_code"
          value={formData.country_code}
          onChange={(e) =>
            setFormData({ ...formData, country_code: e.target.value.toUpperCase().slice(0, 2) })
          }
          disabled={readOnly}
          placeholder="e.g., US"
          maxLength={2}
          className="w-20 font-mono uppercase"
        />
        <p className="text-xs text-gray-500 mt-1">
          ISO 3166-1 alpha-2 (e.g., US, CA, GB). Used for importing public holidays.
        </p>
      </div>

      <div>
        <Label htmlFor="default_currency">Default Currency *</Label>
        <Select
          id="default_currency"
          value={formData.default_currency}
          onChange={(e) =>
            setFormData({
              ...formData,
              default_currency: e.target.value,
            })
          }
          required
          disabled={readOnly}
        >
          {CURRENCIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>

      {!readOnly && (
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : initialData ? "Update" : "Create"}
          </Button>
        </div>
      )}
    </form>
  );
}


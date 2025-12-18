"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { RoleCreate, RoleUpdate } from "@/types/role";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { CURRENCIES } from "@/types/currency";

type RoleFormValues = {
  role_name: string;
  status: RoleCreate["status"];
  role_rates: Array<{
    delivery_center_code: string;
    currency: string;
    internal_cost_rate: string;
    external_rate: string;
  }>;
};

interface RoleFormProps {
  initialData?: Partial<RoleCreate>;
  onSubmit: (data: RoleCreate | RoleUpdate) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function RoleForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}: RoleFormProps) {
  const { data: deliveryCentersData } = useDeliveryCenters();
  
  const [formData, setFormData] = useState<RoleFormValues>({
    role_name: initialData?.role_name || "",
    status: initialData?.status || "active",
    role_rates:
      initialData?.role_rates?.length
        ? initialData.role_rates.map((rate) => ({
            delivery_center_code: rate.delivery_center_code,
            currency: rate.currency,
            internal_cost_rate: String(rate.internal_cost_rate),
            external_rate: String(rate.external_rate),
          }))
        : [
            {
              delivery_center_code: deliveryCentersData?.items[0]?.code || "",
              currency: "USD",
              internal_cost_rate: "",
              external_rate: "",
            },
          ],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsedRates = formData.role_rates.map((rate) => ({
      delivery_center_code: rate.delivery_center_code,
      currency: rate.currency.trim(),
      internal_cost_rate: parseFloat(rate.internal_cost_rate),
      external_rate: parseFloat(rate.external_rate),
    }));

    if (parsedRates.length === 0) {
      alert("At least one delivery center rate is required.");
      return;
    }

    for (const rate of parsedRates) {
      if (!rate.delivery_center_code) {
        alert("Delivery center is required for each rate.");
        return;
      }
      if (!rate.currency) {
        alert("Currency is required for each rate.");
        return;
      }
      if (Number.isNaN(rate.internal_cost_rate) || Number.isNaN(rate.external_rate)) {
        alert("Please enter valid numeric rates for each delivery center.");
        return;
      }
    }

    const primaryRate = parsedRates[0];

    await onSubmit({
      role_name: formData.role_name.trim(),
      role_internal_cost_rate: primaryRate.internal_cost_rate,
      role_external_rate: primaryRate.external_rate,
      status: formData.status,
      default_currency: primaryRate.currency,
      role_rates: parsedRates,
    });
  };

  const updateRate = (index: number, key: keyof RoleFormValues["role_rates"][number], value: string) => {
    setFormData((prev) => {
      const nextRates = [...prev.role_rates];
      nextRates[index] = { ...nextRates[index], [key]: value };
      return { ...prev, role_rates: nextRates };
    });
  };

  const addRate = () => {
    setFormData((prev) => ({
      ...prev,
      role_rates: [
        ...prev.role_rates,
        {
          delivery_center_code: deliveryCentersData?.items[0]?.code || "",
          currency: "USD",
          internal_cost_rate: "",
          external_rate: "",
        },
      ],
    }));
  };

  const removeRate = (index: number) => {
    setFormData((prev) => {
      const nextRates = prev.role_rates.filter((_, i) => i !== index);
      return { ...prev, role_rates: nextRates.length ? nextRates : prev.role_rates };
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-gray-800">Basics</p>
        <p className="text-xs text-gray-500">Name, status, and rate configuration.</p>
      </div>

      <div>
        <Label htmlFor="role_name">Role Name *</Label>
        <Input
          id="role_name"
          value={formData.role_name}
          onChange={(e) =>
            setFormData({ ...formData, role_name: e.target.value })
          }
          required
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base">Delivery Center Rates *</Label>
          <Button type="button" variant="outline" size="sm" onClick={addRate}>
            Add Rate
          </Button>
        </div>

        {formData.role_rates.map((rate, index) => (
          <div
            key={index}
            className="border rounded-md p-3 space-y-3 bg-gray-50"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Delivery Center *</Label>
                <Select
                  value={rate.delivery_center_code}
                  onChange={(e) => updateRate(index, "delivery_center_code", e.target.value)}
                  required
                >
                  {deliveryCentersData?.items.map((dc) => (
                    <option key={dc.code} value={dc.code}>
                      {dc.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>Currency *</Label>
                <Select
                  value={rate.currency}
                  onChange={(e) => updateRate(index, "currency", e.target.value)}
                  required
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Internal Cost Rate *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  required
                  value={rate.internal_cost_rate}
                  onChange={(e) => updateRate(index, "internal_cost_rate", e.target.value)}
                />
              </div>
              <div>
                <Label>External Rate *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  required
                  value={rate.external_rate}
                  onChange={(e) => updateRate(index, "external_rate", e.target.value)}
                />
              </div>
            </div>

            {formData.role_rates.length > 1 && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600"
                  onClick={() => removeRate(index)}
                >
                  Remove
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="status">Status</Label>
          <Select
            id="status"
            value={formData.status}
            onChange={(e) =>
              setFormData({
                ...formData,
                status: e.target.value as RoleCreate["status"],
              })
            }
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : initialData ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}



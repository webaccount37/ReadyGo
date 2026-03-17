"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { RoleCreate, RoleUpdate } from "@/types/role";
import type { DeliveryCenter } from "@/types/delivery-center";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { CURRENCIES } from "@/types/currency";

type RateRow = {
  delivery_center_code: string;
  delivery_center_name: string;
  default_currency: string;
  internal_cost_rate: string;
  external_rate: string;
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

  // Build fixed rate rows: one per Delivery Center, sorted by DC code for consistent display
  const rateRows = useMemo((): RateRow[] => {
    const dcs = [...(deliveryCentersData?.items ?? [])].sort(
      (a, b) => (a.code || "").localeCompare(b.code || "")
    );
    const ratesByDc = new Map(
      (initialData?.role_rates ?? []).map((r) => [r.delivery_center_code.toLowerCase(), r])
    );
    return dcs.map((dc: DeliveryCenter) => {
      const existing = ratesByDc.get(dc.code.toLowerCase());
      return {
        delivery_center_code: dc.code,
        delivery_center_name: dc.name,
        default_currency: existing?.default_currency ?? dc.default_currency ?? "USD",
        internal_cost_rate: existing != null ? String(existing.internal_cost_rate) : "0",
        external_rate: existing != null ? String(existing.external_rate) : "0",
      };
    });
  }, [deliveryCentersData?.items, initialData?.role_rates]);

  const [formData, setFormData] = useState<{
    role_name: string;
    rateRows: RateRow[];
  }>({
    role_name: initialData?.role_name ?? "",
    rateRows,
  });

  // Sync form when delivery centers or initialData load/change
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      role_name: initialData?.role_name ?? prev.role_name,
      rateRows,
    }));
  }, [rateRows, initialData?.role_name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsedRates = formData.rateRows.map((row) => ({
      delivery_center_code: row.delivery_center_code,
      default_currency: row.default_currency.trim(),
      internal_cost_rate: parseFloat(row.internal_cost_rate) || 0,
      external_rate: parseFloat(row.external_rate) || 0,
    }));

    for (const rate of parsedRates) {
      if (!rate.delivery_center_code || !rate.default_currency) {
        alert("Delivery center and currency are required for each rate.");
        return;
      }
      if (Number.isNaN(rate.internal_cost_rate) || Number.isNaN(rate.external_rate)) {
        alert("Please enter valid numeric rates.");
        return;
      }
    }

    await onSubmit({
      role_name: formData.role_name.trim(),
      role_rates: parsedRates,
    });
  };

  const updateRate = (index: number, key: keyof RateRow, value: string) => {
    setFormData((prev) => {
      const next = [...prev.rateRows];
      next[index] = { ...next[index], [key]: value };
      return { ...prev, rateRows: next };
    });
  };

  const hasDeliveryCenters = (deliveryCentersData?.items?.length ?? 0) > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-gray-800">Basics</p>
        <p className="text-xs text-gray-500">Name and rate configuration by delivery center.</p>
      </div>

      <div>
        <Label htmlFor="role_name">Role Name *</Label>
        <Input
          id="role_name"
          value={formData.role_name}
          onChange={(e) => setFormData({ ...formData, role_name: e.target.value })}
          required
        />
      </div>

      <div className="space-y-3">
        <Label className="text-base">Rates by Delivery Center</Label>
        <p className="text-xs text-gray-500">
          Each delivery center has one rate. Edit currency, internal cost, and external rate only.
        </p>

        {!hasDeliveryCenters ? (
          <p className="text-sm text-amber-600">No delivery centers configured. Create delivery centers first.</p>
        ) : (
          <div className="space-y-2">
            {formData.rateRows.map((row, index) => (
              <div
                key={row.delivery_center_code}
                className="border rounded-md p-3 bg-gray-50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
              >
                <div>
                  <Label className="text-xs text-gray-500">Delivery Center</Label>
                  <div className="py-2 text-sm font-medium text-gray-700">
                    {row.delivery_center_name}
                  </div>
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select
                    value={row.default_currency}
                    onChange={(e) => updateRate(index, "default_currency", e.target.value)}
                    required
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Internal Cost Rate</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={row.internal_cost_rate}
                    onChange={(e) => updateRate(index, "internal_cost_rate", e.target.value)}
                  />
                </div>
                <div>
                  <Label>External Rate</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={row.external_rate}
                    onChange={(e) => updateRate(index, "external_rate", e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading || !hasDeliveryCenters}>
          {isLoading ? "Saving..." : initialData ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}

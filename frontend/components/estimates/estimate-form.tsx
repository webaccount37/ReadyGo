"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useReleases } from "@/hooks/useReleases";
import { CURRENCIES } from "@/types/currency";
import type { EstimateCreate, EstimateUpdate, EstimateStatus } from "@/types/estimate";

interface EstimateFormProps {
  initialData?: Partial<EstimateCreate>;
  onSubmit: (data: EstimateCreate | EstimateUpdate) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

const ESTIMATE_STATUSES: EstimateStatus[] = ["draft", "submitted", "approved", "rejected"];

export function EstimateForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}: EstimateFormProps) {
  const { data: releasesData } = useReleases({ limit: 100 });
  const [formData, setFormData] = useState<EstimateCreate>({
    release_id: initialData?.release_id || "",
    name: initialData?.name || "",
    currency: initialData?.currency || "USD",
    status: initialData?.status || "draft",
    description: initialData?.description || "",
  });

  // Auto-populate currency when release is selected
  useEffect(() => {
    if (formData.release_id && releasesData?.items) {
      const selectedRelease = releasesData.items.find(
        (r) => r.id === formData.release_id
      );
      if (selectedRelease && !initialData?.currency) {
        setFormData((prev) => ({
          ...prev,
          currency: selectedRelease.default_currency || "USD",
        }));
      }
    }
  }, [formData.release_id, releasesData, initialData?.currency]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="release_id">Release *</Label>
        <Select
          id="release_id"
          value={formData.release_id}
          onChange={(e) =>
            setFormData({ ...formData, release_id: e.target.value })
          }
          required
          disabled={!!initialData?.release_id}
        >
          <option value="">Select a release</option>
          {releasesData?.items?.map((release) => (
            <option key={release.id} value={release.id}>
              {release.name} ({release.engagement_name || release.engagement_id})
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
        <Label htmlFor="currency">Currency</Label>
        <Select
          id="currency"
          value={formData.currency}
          onChange={(e) =>
            setFormData({ ...formData, currency: e.target.value })
          }
        >
          {CURRENCIES.map((currency) => (
            <option key={currency.value} value={currency.value}>
              {currency.label}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="status">Status</Label>
        <Select
          id="status"
          value={formData.status}
          onChange={(e) =>
            setFormData({
              ...formData,
              status: e.target.value as EstimateStatus,
            })
          }
        >
          {ESTIMATE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </option>
          ))}
        </Select>
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


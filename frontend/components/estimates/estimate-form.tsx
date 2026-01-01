"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useReleases } from "@/hooks/useReleases";
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
  const { data: releasesData } = useReleases({ limit: 100 });
  const [formData, setFormData] = useState<EstimateCreate>({
    release_id: initialData?.release_id || "",
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
              {release.name} ({release.opportunity_name || release.opportunity_id})
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


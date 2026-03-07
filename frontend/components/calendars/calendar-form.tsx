"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CalendarCreate, CalendarUpdate } from "@/types/calendar";

interface CalendarFormProps {
  initialData?: Partial<CalendarCreate>;
  year: number;
  deliveryCenterId: string;
  onSubmit: (data: CalendarCreate | CalendarUpdate) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function CalendarForm({
  initialData,
  year,
  deliveryCenterId,
  onSubmit,
  onCancel,
  isLoading = false,
}: CalendarFormProps) {
  const toDateStr = (d: string | undefined) =>
    d ? d.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const [formData, setFormData] = useState<CalendarCreate>({
    date: toDateStr(initialData?.date),
    name: initialData?.name || "",
    country_code: initialData?.country_code || "US",
    hours: initialData?.hours ?? 8,
    year: initialData?.year ?? year,
    delivery_center_id: initialData?.delivery_center_id || deliveryCenterId,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="date">Date *</Label>
        <Input
          id="date"
          type="date"
          value={formData.date}
          onChange={(e) =>
            setFormData({ ...formData, date: e.target.value, year: new Date(e.target.value).getFullYear() })
          }
          required
        />
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="country_code">Country Code *</Label>
          <Input
            id="country_code"
            value={formData.country_code}
            onChange={(e) =>
              setFormData({ ...formData, country_code: e.target.value.toUpperCase().slice(0, 2) })
            }
            maxLength={2}
            placeholder="US"
            required
          />
        </div>
        <div>
          <Label htmlFor="hours">Hours</Label>
          <Input
            id="hours"
            type="number"
            min="0"
            max="24"
            step="0.5"
            value={formData.hours ?? 8}
            onChange={(e) =>
              setFormData({
                ...formData,
                hours: parseFloat(e.target.value) || 8,
              })
            }
          />
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

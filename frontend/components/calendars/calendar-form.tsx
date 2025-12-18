"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CalendarCreate, CalendarUpdate } from "@/types/calendar";

interface CalendarFormProps {
  initialData?: Partial<CalendarCreate>;
  onSubmit: (data: CalendarCreate | CalendarUpdate) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function CalendarForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}: CalendarFormProps) {
  const [formData, setFormData] = useState<CalendarCreate>({
    year: initialData?.year || new Date().getFullYear(),
    month: initialData?.month || new Date().getMonth() + 1,
    day: initialData?.day || new Date().getDate(),
    is_holiday: initialData?.is_holiday ?? false,
    holiday_name: initialData?.holiday_name || "",
    financial_period: initialData?.financial_period || "",
    working_hours: initialData?.working_hours || 8,
    notes: initialData?.notes || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="year">Year *</Label>
          <Input
            id="year"
            type="number"
            value={formData.year}
            onChange={(e) =>
              setFormData({ ...formData, year: parseInt(e.target.value) })
            }
            required
          />
        </div>
        <div>
          <Label htmlFor="month">Month *</Label>
          <Input
            id="month"
            type="number"
            min="1"
            max="12"
            value={formData.month}
            onChange={(e) =>
              setFormData({ ...formData, month: parseInt(e.target.value) })
            }
            required
          />
        </div>
        <div>
          <Label htmlFor="day">Day *</Label>
          <Input
            id="day"
            type="number"
            min="1"
            max="31"
            value={formData.day}
            onChange={(e) =>
              setFormData({ ...formData, day: parseInt(e.target.value) })
            }
            required
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_holiday"
          checked={formData.is_holiday}
          onChange={(e) =>
            setFormData({ ...formData, is_holiday: e.target.checked })
          }
          className="h-4 w-4"
        />
        <Label htmlFor="is_holiday" className="cursor-pointer">
          Is Holiday
        </Label>
      </div>

      {formData.is_holiday && (
        <div>
          <Label htmlFor="holiday_name">Holiday Name</Label>
          <Input
            id="holiday_name"
            value={formData.holiday_name || ""}
            onChange={(e) =>
              setFormData({ ...formData, holiday_name: e.target.value })
            }
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="working_hours">Working Hours</Label>
          <Input
            id="working_hours"
            type="number"
            min="0"
            max="24"
            value={formData.working_hours || 8}
            onChange={(e) =>
              setFormData({
                ...formData,
                working_hours: parseInt(e.target.value) || 8,
              })
            }
          />
        </div>
        <div>
          <Label htmlFor="financial_period">Financial Period</Label>
          <Input
            id="financial_period"
            value={formData.financial_period || ""}
            onChange={(e) =>
              setFormData({ ...formData, financial_period: e.target.value })
            }
          />
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          value={formData.notes || ""}
          onChange={(e) =>
            setFormData({ ...formData, notes: e.target.value })
          }
          className="flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
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



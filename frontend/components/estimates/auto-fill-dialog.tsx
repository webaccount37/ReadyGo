"use client";

import { useState } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useAutoFillHours } from "@/hooks/useEstimates";
import type { EstimateLineItem, AutoFillPattern } from "@/types/estimate";

interface AutoFillDialogProps {
  lineItem: EstimateLineItem;
  onClose: () => void;
  onSuccess: () => void;
}

export function AutoFillDialog({
  lineItem,
  onClose,
  onSuccess,
}: AutoFillDialogProps) {
  const [pattern, setPattern] = useState<AutoFillPattern>("uniform");
  const [hoursPerWeek, setHoursPerWeek] = useState<string>("40");
  const [startHours, setStartHours] = useState<string>("20");
  const [endHours, setEndHours] = useState<string>("40");
  const [intervalHours, setIntervalHours] = useState<string>("5");
  const autoFillHours = useAutoFillHours();

  // Helper function to parse date string as local date (no timezone conversion)
  const parseLocalDate = (dateStr: string): Date => {
    const datePart = dateStr.split("T")[0];
    const [year, month, day] = datePart.split("-").map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed in JS
  };

  // Helper function to format date as YYYY-MM-DD string (local date, no timezone conversion)
  // This matches the format shown in date input fields
  const formatLocalDateDisplay = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const request: {
      pattern: AutoFillPattern;
      hours_per_week?: string;
      start_hours?: string;
      end_hours?: string;
      interval_hours?: string;
    } = {
      pattern,
    };

    if (pattern === "uniform") {
      request.hours_per_week = hoursPerWeek;
    } else if (pattern === "ramp_up" || pattern === "ramp_down" || pattern === "ramp_up_down") {
      request.start_hours = startHours;
      request.end_hours = endHours;
      request.interval_hours = intervalHours;
    }

    try {
      await autoFillHours.mutateAsync({
        estimateId: lineItem.estimate_id,
        lineItemId: lineItem.id,
        data: request,
      });
      onSuccess();
    } catch (err) {
      console.error("Failed to auto-fill hours:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogHeader>
        <DialogTitle>Auto-Fill Hours</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="pattern">Pattern</Label>
            <Select
              id="pattern"
              value={pattern}
              onChange={(e) => setPattern(e.target.value as AutoFillPattern)}
            >
              <option value="uniform">Uniform (same hours per week)</option>
              <option value="ramp_up">Ramp Up (increase over time)</option>
              <option value="ramp_down">Ramp Down (decrease over time)</option>
              <option value="ramp_up_down">Ramp Up & Down (increase then decrease)</option>
            </Select>
          </div>

          {pattern === "uniform" && (
            <div>
              <Label htmlFor="hours_per_week">Hours per Week</Label>
              <Input
                id="hours_per_week"
                type="number"
                step="0.1"
                value={hoursPerWeek}
                onChange={(e) => setHoursPerWeek(e.target.value)}
                required
              />
            </div>
          )}

          {(pattern === "ramp_up" || pattern === "ramp_down" || pattern === "ramp_up_down") && (
            <>
              <div>
                <Label htmlFor="start_hours">Start Hours (per week)</Label>
                <Input
                  id="start_hours"
                  type="number"
                  step="0.1"
                  value={startHours}
                  onChange={(e) => setStartHours(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="end_hours">End Hours (per week)</Label>
                <Input
                  id="end_hours"
                  type="number"
                  step="0.1"
                  value={endHours}
                  onChange={(e) => setEndHours(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="interval_hours">Interval (In Hours)</Label>
                <Select
                  id="interval_hours"
                  value={intervalHours}
                  onChange={(e) => setIntervalHours(e.target.value)}
                  required
                >
                  <option value="5">5 hours</option>
                  <option value="10">10 hours</option>
                  <option value="20">20 hours</option>
                </Select>
              </div>
            </>
          )}

          <div className="text-sm text-gray-500">
            <p>
              Date Range: {formatLocalDateDisplay(parseLocalDate(lineItem.start_date))} -{" "}
              {formatLocalDateDisplay(parseLocalDate(lineItem.end_date))}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button type="submit" disabled={autoFillHours.isPending}>
              {autoFillHours.isPending ? "Filling..." : "Fill Hours"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}


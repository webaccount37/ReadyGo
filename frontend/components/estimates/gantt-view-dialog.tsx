"use client";

import { DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { MultiEstimateGanttView } from "./multi-estimate-gantt-view";

interface GanttViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateIds: string[];
}

export function GanttViewDialog({ open, onOpenChange, estimateIds }: GanttViewDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div 
        className="relative z-50 w-full max-w-[95vw] max-h-[95vh] overflow-auto bg-white rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Timeline View</DialogTitle>
        </DialogHeader>
        <DialogContent className="p-6 pt-0">
          {estimateIds.length === 0 ? (
            <p className="text-gray-500">No estimates selected.</p>
          ) : (
            <MultiEstimateGanttView estimateIds={estimateIds} />
          )}
        </DialogContent>
      </div>
    </div>
  );
}

"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import type { Quote } from "@/types/quote";

interface UnlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: Quote;
  onConfirm: () => void;
}

export function UnlockDialog({
  open,
  onOpenChange,
  quote,
  onConfirm,
}: UnlockDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Deactivate Quote and Unlock?
          </DialogTitle>
          <DialogDescription>
            Deactivating this quote will unlock the opportunity and all its estimates,
            allowing them to be edited again. The quote will be marked as INVALID
            (unless it&apos;s already ACCEPTED or REJECTED).
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-gray-600">
            <strong>Quote:</strong> {quote.quote_number}
          </p>
          <p className="text-sm text-gray-600 mt-2">
            <strong>Opportunity:</strong> {quote.opportunity_name}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Deactivate and Unlock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


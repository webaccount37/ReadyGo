"use client";

import { Badge } from "@/components/ui/badge";
import type { QuoteStatus } from "@/types/quote";

interface QuoteStatusBadgeProps {
  status: QuoteStatus;
}

export function QuoteStatusBadge({ status }: QuoteStatusBadgeProps) {
  const statusColors: Record<QuoteStatus, string> = {
    DRAFT: "bg-gray-100 text-gray-800",
    SENT: "bg-blue-100 text-blue-800",
    ACCEPTED: "bg-green-100 text-green-800",
    REJECTED: "bg-red-100 text-red-800",
    INVALID: "bg-yellow-100 text-yellow-800",
  };

  return (
    <Badge className={statusColors[status]}>
      {status}
    </Badge>
  );
}


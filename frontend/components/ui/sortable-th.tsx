"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc";

export type SortState = { column: string | null; direction: SortDirection };

type SortableThProps = {
  label: string;
  column: string;
  sort: SortState;
  onSort: (column: string) => void;
  className?: string;
  title?: string;
};

export function SortableTh({ label, column, sort, onSort, className, title }: SortableThProps) {
  const active = sort.column === column;
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={cn(
        "text-left p-1.5 font-semibold whitespace-nowrap select-none align-bottom",
        className
      )}
      title={title}
    >
      <button
        type="button"
        className="inline-flex max-w-full items-center gap-0.5 rounded hover:bg-muted/60 px-0.5 -mx-0.5 text-left"
        onClick={() => onSort(column)}
      >
        <span className="truncate">{label}</span>
        <Icon className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
      </button>
    </th>
  );
}

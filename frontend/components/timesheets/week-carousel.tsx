"use client";

import { useRef, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getWeekStart(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const daysToSunday = day === 0 ? 0 : day;
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - daysToSunday);
  return formatLocalDateString(sunday);
}

export function getWeekRange(weekStart: string): { start: Date; end: Date } {
  const start = parseLocalDate(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

export function formatWeekLabel(weekStart: string): string {
  const { start, end } = getWeekRange(weekStart);
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

/** Generate a stable list of weeks: 104 weeks before and 104 weeks after today. Uses Sunday-Saturday weeks. */
function generateWeekOptions(): string[] {
  const opts: string[] = [];
  const today = new Date();
  const base = getWeekStart(today);
  const baseDate = parseLocalDate(base);
  for (let i = -104; i <= 104; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i * 7);
    opts.push(formatLocalDateString(d));
  }
  return opts;
}

interface WeekCarouselProps {
  selectedWeek: string;
  onSelectWeek: (weekStart: string) => void;
  incompleteWeeks?: string[];
  visibleCount?: number;
  className?: string;
}

const WEEKS = generateWeekOptions();

export function WeekCarousel({
  selectedWeek,
  onSelectWeek,
  incompleteWeeks = [],
  visibleCount = 5,
  className,
}: WeekCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const weeks = WEEKS;

  const scrollToSelected = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const item = el.querySelector(`[data-week="${selectedWeek}"]`);
    if (item) {
      item.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [selectedWeek]);

  useEffect(() => {
    scrollToSelected();
  }, [scrollToSelected, selectedWeek]);

  const scroll = (dir: "left" | "right") => {
    const idx = weeks.indexOf(selectedWeek);
    if (idx < 0) return;
    const nextIdx = dir === "left" ? Math.max(0, idx - 1) : Math.min(weeks.length - 1, idx + 1);
    onSelectWeek(weeks[nextIdx]);
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        type="button"
        onClick={() => scroll("left")}
        className="flex-shrink-0 p-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Previous week"
      >
        <ChevronLeft className="w-6 h-6 text-gray-600" />
      </button>
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-hide scroll-smooth py-2"
        style={{ scrollSnapType: "x mandatory" }}
      >
        <div className="flex gap-2 px-2 justify-start min-w-min">
          {weeks.map((w) => {
            const isSelected = w === selectedWeek;
            const isIncomplete = incompleteWeeks.includes(w);
            return (
              <button
                key={w}
                type="button"
                data-week={w}
                onClick={() => onSelectWeek(w)}
                style={{ scrollSnapAlign: "center" }}
                className={cn(
                  "flex-shrink-0 flex flex-col items-center justify-center px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200",
                  "border-2 min-w-[140px] h-[52px]",
                  isSelected
                    ? "bg-blue-600 border-blue-600 text-white shadow-md scale-105"
                    : "bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50",
                  isIncomplete && !isSelected && "border-amber-300 bg-amber-50/50"
                )}
              >
                <span className="block leading-tight">{formatWeekLabel(w)}</span>
                <span className={cn(
                  "block text-xs mt-0.5 min-h-[1rem] leading-4",
                  isIncomplete ? (isSelected ? "text-blue-200" : "text-amber-600") : "invisible"
                )}>
                  {isIncomplete ? "Incomplete" : "\u00A0"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={() => scroll("right")}
        className="flex-shrink-0 p-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Next week"
      >
        <ChevronRight className="w-6 h-6 text-gray-600" />
      </button>
    </div>
  );
}

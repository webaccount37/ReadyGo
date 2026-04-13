"use client";

import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, History, Plus, Redo2, Undo2 } from "lucide-react";
import { useFinancialForecast } from "@/hooks/useFinancialForecast";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { useAuth } from "@/hooks/useAuth";
import { useEmployee } from "@/hooks/useEmployees";
import { financialForecastApi } from "@/lib/api/financial-forecast";
import type { FinancialForecastMonth, FinancialForecastRow } from "@/lib/api/financial-forecast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function getThisWeekSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split("T")[0];
}

function addMonthsSunday(iso: string, months: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split("T")[0];
}

type PatchAction =
  | { type: "expense"; line_id: string; month: string; old: number | null; new: number }
  | { type: "override"; row_key: string; month: string; old: number | null; new: number | null };

type FinancialForecastCellPatchBody = {
  expense_cells?: { line_id: string; month_start_date: string; amount: number }[];
  overrides?: { row_key: string; month_start_date: string; amount?: number | null }[];
};

const COMPOSITION_LABEL: Record<string, string> = {
  forecast_only: "Forecast only — projected amounts for this month",
  mixed: "Mixed — both actuals and forecast contribute this month",
  actuals_only: "Actuals only — amounts from approved timesheets / actuals",
};

const selectClassName =
  "h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

function buildRowByKey(rows: FinancialForecastRow[]): Map<string, FinancialForecastRow> {
  return new Map(rows.map((r) => [r.row_key, r]));
}

function rowDepth(row: FinancialForecastRow, byKey: Map<string, FinancialForecastRow>): number {
  let d = 0;
  let pk = row.parent_row_key;
  while (pk) {
    d += 1;
    const p = byKey.get(pk);
    if (!p) break;
    pk = p.parent_row_key ?? null;
  }
  return d;
}

function isHiddenByCollapse(
  row: FinancialForecastRow,
  byKey: Map<string, FinancialForecastRow>,
  collapsed: Record<string, boolean>
): boolean {
  let pk = row.parent_row_key;
  while (pk) {
    if (collapsed[pk]) return true;
    const p = byKey.get(pk);
    if (!p) break;
    pk = p.parent_row_key ?? null;
  }
  return false;
}

function isUnderExpenseTree(row: FinancialForecastRow, byKey: Map<string, FinancialForecastRow>): boolean {
  if (row.row_key === "expense" || row.row_key.startsWith("expense:")) return true;
  let pk: string | null | undefined = row.parent_row_key;
  while (pk) {
    if (pk === "expense" || pk.startsWith("expense_")) return true;
    const p = byKey.get(pk);
    if (!p) break;
    pk = p.parent_row_key;
  }
  return false;
}

function insertParentForLineBelow(row: FinancialForecastRow): string {
  if (row.kind === "group" && (row.row_key === "expense" || row.row_key.startsWith("expense_"))) {
    return row.row_key;
  }
  if (row.parent_row_key && (row.parent_row_key === "expense" || row.parent_row_key.startsWith("expense_"))) {
    return row.parent_row_key;
  }
  return "expense";
}

function periodTotalDisplay(
  row: FinancialForecastRow,
  months: FinancialForecastMonth[],
  cells: Record<string, Record<string, { value?: number }>>
): string {
  if (row.kind === "group") return "—";
  if (row.kind === "percent") return "—";
  if (row.kind === "total" && (row.row_key.endsWith("_pct") || row.row_key.includes("pct"))) return "—";
  let sum = 0;
  for (const mo of months) {
    sum += Number(cells[row.row_key]?.[mo.month_key]?.value ?? 0);
  }
  return sum.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function ExpenseInsertZone({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      className="group/ins relative h-2 min-h-0 shrink-0 cursor-pointer overflow-visible border-b border-gray-100 hover:bg-blue-200"
      style={{ gridColumn: "1 / -1" }}
      onClick={onAdd}
      role="presentation"
      title="Add expense line here"
    >
      <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-blue-200/60 group-hover/ins:bg-blue-500 transition-colors" />
      <span className="pointer-events-none absolute left-1.5 top-1/2 z-[1] -translate-y-1/2 inline-flex h-4 w-4 items-center justify-center rounded-full border border-dashed border-blue-500 bg-white text-blue-600 opacity-0 shadow-sm transition-opacity group-hover/ins:opacity-100">
        <Plus className="h-2.5 w-2.5" aria-hidden />
      </span>
      <span className="sr-only">Add expense line here</span>
    </div>
  );
}

export default function FinancialForecastsPage() {
  const { user } = useAuth();
  const { data: emp } = useEmployee(user?.employee_id ?? "", false, {
    enabled: !!user?.employee_id,
  });
  const { data: dcs } = useDeliveryCenters();
  const centers = dcs?.items ?? [];

  const [startWeek, setStartWeek] = useState(getThisWeekSunday);
  const [endWeek, setEndWeek] = useState(() => addMonthsSunday(getThisWeekSunday(), 6));
  const [deliveryCenterId, setDeliveryCenterId] = useState("");
  const [metric, setMetric] = useState<"forecast" | "actuals">("forecast");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [overrideModal, setOverrideModal] = useState<{ row_key: string; month_key: string; current: number } | null>(
    null
  );
  const [addLineModal, setAddLineModal] = useState<{ parent: string } | null>(null);
  const [newLineName, setNewLineName] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [manualDrafts, setManualDrafts] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const employeeDeliveryCenter = emp?.delivery_center;
  useEffect(() => {
    if (!employeeDeliveryCenter || !centers.length || deliveryCenterId) return;
    const dc = centers.find((c) => c.code === employeeDeliveryCenter);
    if (dc) setDeliveryCenterId(dc.id);
  }, [employeeDeliveryCenter, centers, deliveryCenterId]);

  const params = useMemo(
    () =>
      deliveryCenterId
        ? {
            delivery_center_id: deliveryCenterId,
            start_week: startWeek,
            end_week: endWeek,
            metric,
          }
        : null,
    [deliveryCenterId, startWeek, endWeek, metric]
  );

  const { data, isLoading, error, dataUpdatedAt } = useFinancialForecast(params);

  useEffect(() => {
    setManualDrafts({});
  }, [dataUpdatedAt]);

  const undoStack = useRef<PatchAction[]>([]);
  const redoStack = useRef<PatchAction[]>([]);
  const [undoRev, setUndoRev] = useState(0);

  const pushUndo = (a: PatchAction) => {
    undoStack.current = [...undoStack.current.slice(-9), a];
    redoStack.current = [];
    setUndoRev((x) => x + 1);
  };

  const months = data?.months ?? [];
  const rows = data?.rows ?? [];
  const cells = data?.cells ?? {};
  const currency = data?.currency ?? "USD";

  const rowByKey = useMemo(() => buildRowByKey(rows), [rows]);
  const depthByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.row_key, rowDepth(r, rowByKey));
    return m;
  }, [rows, rowByKey]);

  const visibleRows = useMemo(() => {
    return rows.filter((r) => !isHiddenByCollapse(r, rowByKey, collapsedGroups));
  }, [rows, rowByKey, collapsedGroups]);

  const monthHeaderClass = (comp: string) =>
    cn(
      "text-[10px] font-semibold px-1 py-1 border-b border-r border-gray-200 text-center min-w-[72px]",
      comp === "actuals_only" && "bg-emerald-100/90",
      comp === "mixed" && "bg-amber-100/90",
      comp === "forecast_only" && "bg-sky-100/90"
    );

  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const schedulePatch = useCallback(
    (patch: FinancialForecastCellPatchBody) => {
      if (!deliveryCenterId) return;
      const key = JSON.stringify(patch);
      if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
      debounceTimers.current[key] = setTimeout(async () => {
        await financialForecastApi.patchCells(deliveryCenterId, {
          ...patch,
          correlation_id: `ui-${Date.now()}`,
        });
        await queryClient.invalidateQueries({ queryKey: ["financial-forecast"] });
      }, 400);
    },
    [deliveryCenterId, queryClient]
  );

  const manualCellKey = (rowKey: string, monthKey: string) => `${rowKey}::${monthKey}`;

  const onManualCellChange = (row: FinancialForecastRow, monthKey: string, raw: string) => {
    const v = parseFloat(raw);
    if (Number.isNaN(v) || !row.expense_line_id) return;
    const [y, m] = monthKey.split("-").map(Number);
    const month_start_date = `${y}-${String(m).padStart(2, "0")}-01`;
    const old = cells[row.row_key]?.[monthKey]?.value ?? null;
    pushUndo({ type: "expense", line_id: row.expense_line_id, month: month_start_date, old, new: v });
    schedulePatch({
      expense_cells: [{ line_id: row.expense_line_id, month_start_date, amount: v }],
    });
    setManualDrafts((d) => {
      const next = { ...d };
      delete next[manualCellKey(row.row_key, monthKey)];
      return next;
    });
  };

  const submitOverride = (newVal: number) => {
    if (!overrideModal || !deliveryCenterId) return;
    const [y, m] = overrideModal.month_key.split("-").map(Number);
    const month_start_date = `${y}-${String(m).padStart(2, "0")}-01`;
    const old = cells[overrideModal.row_key]?.[overrideModal.month_key]?.auto_value ?? null;
    pushUndo({
      type: "override",
      row_key: overrideModal.row_key,
      month: month_start_date,
      old,
      new: newVal,
    });
    schedulePatch({
      overrides: [{ row_key: overrideModal.row_key, month_start_date, amount: newVal }],
    });
    setOverrideModal(null);
  };

  const revertOverride = (row_key: string, monthKey: string) => {
    const [y, m] = monthKey.split("-").map(Number);
    const month_start_date = `${y}-${String(m).padStart(2, "0")}-01`;
    schedulePatch({ overrides: [{ row_key, month_start_date, amount: null }] });
  };

  const undo = async () => {
    const a = undoStack.current.pop();
    if (!a || !deliveryCenterId) return;
    if (a.type === "expense") {
      const amt = a.old ?? 0;
      await financialForecastApi.patchCells(deliveryCenterId, {
        expense_cells: [{ line_id: a.line_id, month_start_date: a.month, amount: amt }],
      });
    } else {
      await financialForecastApi.patchCells(deliveryCenterId, {
        overrides: [{ row_key: a.row_key, month_start_date: a.month, amount: a.old === null ? null : a.old }],
      });
    }
    redoStack.current.push(a);
    setUndoRev((x) => x + 1);
    await queryClient.invalidateQueries({ queryKey: ["financial-forecast"] });
  };

  const redo = async () => {
    const a = redoStack.current.pop();
    if (!a || !deliveryCenterId) return;
    if (a.type === "expense") {
      await financialForecastApi.patchCells(deliveryCenterId, {
        expense_cells: [{ line_id: a.line_id, month_start_date: a.month, amount: a.new }],
      });
    } else {
      await financialForecastApi.patchCells(deliveryCenterId, {
        overrides: [{ row_key: a.row_key, month_start_date: a.month, amount: a.new }],
      });
    }
    undoStack.current.push(a);
    setUndoRev((x) => x + 1);
    await queryClient.invalidateQueries({ queryKey: ["financial-forecast"] });
  };

  const { data: hist } = useQuery({
    queryKey: ["financial-forecast", "history", deliveryCenterId, historyOpen],
    queryFn: () => financialForecastApi.getHistory(deliveryCenterId, 0, 40),
    enabled: historyOpen && !!deliveryCenterId,
  });

  const downloadExport = async () => {
    if (!deliveryCenterId) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const u = new URLSearchParams({
      delivery_center_id: deliveryCenterId,
      start_week: startWeek,
      end_week: endWeek,
      metric,
    });
    const res = await fetch(`${base}/api/v1/financial-forecast/export.xlsx?${u}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "financial-forecast.xlsx";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const uploadImport = async (file: File) => {
    if (!deliveryCenterId) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${base}/api/v1/financial-forecast/import.xlsx?delivery_center_id=${deliveryCenterId}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) {
      const t = await res.text();
      alert(t || "Import failed");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["financial-forecast"] });
  };

  const gridTemplateColumns = useMemo(() => {
    const labelW = 220;
    const colW = 80;
    const totalW = 96;
    return `${labelW}px repeat(${months.length}, ${colW}px) ${totalW}px`;
  }, [months.length]);

  const toggleGroup = (rowKey: string) => {
    setCollapsedGroups((c) => ({ ...c, [rowKey]: !c[rowKey] }));
  };

  const hasChildRows = (groupKey: string) => rows.some((r) => r.parent_row_key === groupKey);

  const renderRowBlock = (row: FinancialForecastRow, rowIndexInVisible: number) => {
    const depth = depthByKey.get(row.row_key) ?? 0;
    const isGroup = row.kind === "group";
    const isSummary = row.kind === "total" || row.kind === "percent";
    const summaryBg = isSummary ? "bg-slate-100" : "";
    const labelPad = !isGroup && depth > 0 ? { paddingLeft: `${8 + Math.min(depth, 6) * 12}px` } : undefined;

    const rowCells = (
      <>
        <div
          className={cn(
            "border px-1 py-0.5 truncate sticky left-0 z-10 flex items-center gap-1 min-h-[28px]",
            !isSummary && "bg-white",
            isSummary && summaryBg,
            isGroup && "font-semibold bg-muted/50 border-l-2 border-l-muted-foreground/30"
          )}
          style={labelPad}
          title={row.row_key}
        >
          {isGroup && hasChildRows(row.row_key) && (
            <button
              type="button"
              className="shrink-0 p-0.5 rounded hover:bg-muted"
              aria-expanded={!collapsedGroups[row.row_key]}
              aria-label={collapsedGroups[row.row_key] ? "Expand group" : "Collapse group"}
              onClick={(e) => {
                e.stopPropagation();
                toggleGroup(row.row_key);
              }}
            >
              {collapsedGroups[row.row_key] ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          <span className="truncate">{row.label}</span>
        </div>
        {months.map((mo) => {
          const cell = cells[row.row_key]?.[mo.month_key];
          const val = cell?.value ?? 0;
          const isFormula = row.kind === "total" || row.kind === "percent";
          const canManual = row.manual_expense && row.expense_line_id;
          const canOverride = row.auto_row && !isFormula;
          const mk = manualCellKey(row.row_key, mo.month_key);
          const serverStr = Number.isFinite(val) ? String(val) : "0";
          const draftVal = manualDrafts[mk];
          return (
            <div
              key={mo.month_key}
              className={cn("border px-0.5 py-0.5 text-right align-middle", isSummary && summaryBg)}
            >
              {canManual ? (
                <input
                  className="w-full h-7 text-right text-[11px] border border-gray-200 rounded px-1 bg-white"
                  value={draftVal !== undefined ? draftVal : serverStr}
                  onChange={(e) => setManualDrafts((d) => ({ ...d, [mk]: e.target.value }))}
                  onFocus={() =>
                    setManualDrafts((d) => (d[mk] !== undefined ? d : { ...d, [mk]: serverStr }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={(e) => {
                    onManualCellChange(row, mo.month_key, e.target.value);
                  }}
                  aria-label={`${row.label} ${mo.month_key}`}
                />
              ) : (
                <button
                  type="button"
                  className={cn(
                    "w-full h-7 text-right text-[11px] rounded px-1",
                    isSummary && "font-medium",
                    cell?.is_manual && canOverride && "bg-amber-50 ring-1 ring-amber-300",
                    !canOverride && "cursor-default"
                  )}
                  disabled={!canOverride}
                  onClick={() => {
                    if (canOverride) setOverrideModal({ row_key: row.row_key, month_key: mo.month_key, current: val });
                  }}
                >
                  {val.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </button>
              )}
            </div>
          );
        })}
        <div
          className={cn(
            "border px-1 py-0.5 text-right text-[11px] font-medium tabular-nums",
            isSummary && summaryBg
          )}
          title="Sum of visible months in the grid above"
        >
          {periodTotalDisplay(row, months, cells)}
        </div>
      </>
    );

    const next = visibleRows[rowIndexInVisible + 1];
    const showInsert =
      next &&
      isUnderExpenseTree(row, rowByKey) &&
      isUnderExpenseTree(next, rowByKey) &&
      (row.manual_expense || row.kind === "group" || row.row_key.startsWith("expense")) &&
      (next.manual_expense || next.kind === "group" || next.row_key.startsWith("expense"));

    return (
      <React.Fragment key={row.row_key}>
        {rowCells}
        {showInsert ? (
          <ExpenseInsertZone
            onAdd={() => setAddLineModal({ parent: insertParentForLineBelow(next) })}
          />
        ) : null}
      </React.Fragment>
    );
  };

  return (
    <div className="container mx-auto p-4 space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Financial Forecasts</CardTitle>
          <div className="flex flex-wrap gap-3 items-end pt-2">
            <div>
              <Label className="text-xs">Starting week</Label>
              <input
                type="date"
                className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm block"
                value={startWeek}
                onChange={(e) => setStartWeek(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Ending week</Label>
              <input
                type="date"
                className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm block"
                value={endWeek}
                onChange={(e) => setEndWeek(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Delivery Center</Label>
              <select
                className={cn(selectClassName, "min-w-[180px] block")}
                value={deliveryCenterId}
                onChange={(e) => setDeliveryCenterId(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {centers.map((dc) => (
                  <option key={dc.id} value={dc.id}>
                    {dc.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Metric</Label>
              <select
                className={cn(selectClassName, "block")}
                value={metric}
                onChange={(e) => setMetric(e.target.value as "forecast" | "actuals")}
              >
                <option value="forecast">Forecast</option>
                <option value="actuals">Actuals</option>
              </select>
            </div>
            <div
              className="flex items-center gap-0.5 rounded-md border border-gray-200 bg-muted/40 p-0.5"
              role="toolbar"
              aria-label="Forecast edit history"
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 px-0"
                onClick={() => setHistoryOpen((o) => !o)}
                title="History"
                aria-label="Toggle change history"
              >
                <History className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 px-0"
                onClick={undo}
                disabled={!undoStack.current.length}
                key={`u-${undoRev}`}
                title="Undo"
                aria-label="Undo last change"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 px-0"
                onClick={redo}
                disabled={!redoStack.current.length}
                key={`r-${undoRev}`}
                title="Redo"
                aria-label="Redo"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="w-px h-8 bg-border self-center hidden sm:block" aria-hidden />
            <Button type="button" variant="outline" size="sm" onClick={downloadExport}>
              Export Excel
            </Button>
            <label className="text-sm cursor-pointer">
              <span className="inline-flex h-9 items-center rounded-md border border-gray-300 bg-white px-3">
                Import Excel
              </span>
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadImport(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {historyOpen && (
            <div className="mb-4 max-h-40 overflow-y-auto border rounded-md p-2 text-xs bg-muted/30">
              {(hist?.items ?? []).map((h) => (
                <div key={h.id} className="py-0.5 border-b border-gray-100">
                  <span className="text-gray-500">{h.created_at}</span> — {h.action}{" "}
                  <code className="text-[10px]">{JSON.stringify(h.payload)}</code>
                </div>
              ))}
            </div>
          )}
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
          {data && (
            <div className="overflow-auto max-h-[70vh]">
              <p className="text-[11px] text-muted-foreground mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium text-foreground">Month colors:</span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-3 w-6 rounded-sm bg-sky-100/90 border border-gray-200" />
                  Forecast only
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-3 w-6 rounded-sm bg-amber-100/90 border border-gray-200" />
                  Mixed
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-3 w-6 rounded-sm bg-emerald-100/90 border border-gray-200" />
                  Actuals only
                </span>
              </p>
              <div
                className="inline-grid gap-0 text-xs"
                style={{ gridTemplateColumns: gridTemplateColumns, gridAutoRows: "minmax(0,auto)" }}
              >
                <div className="sticky top-0 z-20 bg-white font-semibold border p-1">Line</div>
                {months.map((mo) => (
                  <div
                    key={mo.month_key}
                    className={cn("sticky top-0 z-20 border p-1", monthHeaderClass(mo.composition))}
                    title={COMPOSITION_LABEL[mo.composition] ?? mo.composition}
                    aria-label={`${mo.year}-${String(mo.month).padStart(2, "0")}. ${COMPOSITION_LABEL[mo.composition] ?? ""}`}
                  >
                    {mo.year}-{String(mo.month).padStart(2, "0")}
                  </div>
                ))}
                <div
                  className="sticky top-0 z-20 bg-white font-semibold border p-1 text-right"
                  title="Sum of amounts in the visible month columns for this row"
                >
                  Period total
                </div>

                {visibleRows.map((row, i) => renderRowBlock(row, i))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">Currency: {currency}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {overrideModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-4 space-y-3">
            <p className="text-sm font-medium">Override automated value</p>
            <p className="text-xs text-muted-foreground">
              You are replacing the calculated amount for this month. You can revert to the automated value later.
            </p>
            <input
              type="number"
              className="w-full border rounded-md h-9 px-2"
              defaultValue={overrideModal.current}
              id="ov-val"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setOverrideModal(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const el = document.getElementById("ov-val") as HTMLInputElement | null;
                  const n = parseFloat(el?.value ?? "");
                  if (!Number.isNaN(n)) submitOverride(n);
                }}
              >
                Save override
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                revertOverride(overrideModal.row_key, overrideModal.month_key);
                setOverrideModal(null);
              }}
            >
              Revert to automated value
            </Button>
          </div>
        </div>
      )}

      {addLineModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-4 space-y-3">
            <p className="text-sm font-medium">New expense line</p>
            <p className="text-[11px] text-muted-foreground">Parent group: {addLineModal.parent}</p>
            <input
              className="w-full border rounded-md h-9 px-2"
              placeholder="Line name"
              value={newLineName}
              onChange={(e) => setNewLineName(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setAddLineModal(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  if (!deliveryCenterId || !newLineName.trim()) return;
                  await financialForecastApi.createExpenseLine(deliveryCenterId, addLineModal.parent, newLineName.trim());
                  setNewLineName("");
                  setAddLineModal(null);
                  await queryClient.invalidateQueries({ queryKey: ["financial-forecast"] });
                }}
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setAddLineModal({ parent: "expense" })}>
          Add expense line (root)
        </Button>
        <span className="text-[11px] text-muted-foreground">Or use the + divider between expense rows in the grid.</span>
      </div>
    </div>
  );
}

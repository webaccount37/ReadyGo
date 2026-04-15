"use client";

import { useMemo, useRef, useState } from "react";
import { useEngagementDetail } from "@/hooks/useEngagements";
import type { ExpenseReceipt } from "@/types/expense";
import type { ExpenseCategory } from "@/types/expense-category";
import type { ClientExpenseLine } from "@/lib/expenseLineValidation";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Trash2, Upload, Download, X } from "lucide-react";
import { expensesApi } from "@/lib/api/expenses";
import { cn } from "@/lib/utils";

interface EngagementItem {
  id: string;
  opportunity_id?: string;
  account_id?: string;
  account_name?: string;
  opportunity_name?: string;
  name?: string;
}

type OpportunityListItem = {
  id: string;
  name?: string;
  account_id?: string;
  start_date?: string;
  end_date?: string;
  /** When set, expense line Billable syncs to this when a project (opp/engagement) is selected. */
  billable_expenses?: boolean;
};

const ENTRY_TYPE_OPTIONS = [
  { value: "" as const, label: "— Select —" },
  { value: "ENGAGEMENT" as const, label: "Engagement" },
  { value: "SALES" as const, label: "Sales" },
];

function opportunityOverlapsWeek(
  startDate: string | undefined,
  endDate: string | undefined,
  weekStart: string
): boolean {
  if (!startDate || !endDate) return true;
  const [y, m, d] = weekStart.split("-").map(Number);
  const ws = new Date(y, m - 1, d);
  const we = new Date(ws);
  we.setDate(ws.getDate() + 6);
  const os = new Date(startDate);
  const oe = new Date(endDate);
  return os <= we && oe >= ws;
}

function downloadLocalFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name || "receipt";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExpenseLineRow({
  line,
  weekStart,
  engagementsSource,
  accountsData,
  opportunitiesData,
  categories,
  canEdit,
  onChange,
  onDelete,
  onReceiptsUpdated,
  onReceiptDeleted,
}: {
  line: ClientExpenseLine;
  weekStart: string;
  engagementsSource: EngagementItem[];
  accountsData?: { items?: { id: string; company_name?: string }[] };
  opportunitiesData?: { items?: OpportunityListItem[] };
  categories: ExpenseCategory[];
  canEdit: boolean;
  onChange: (e: ClientExpenseLine) => void;
  onDelete?: () => void;
  /** Called after upload server receipt so the parent can refetch the sheet. */
  onReceiptsUpdated?: () => void;
  /** Called after a server receipt is deleted so the parent can update local state immediately. */
  onReceiptDeleted?: (lineId: string, receiptId: string) => void;
}) {
  const entryType = (line.entry_type ?? "") as "" | "ENGAGEMENT" | "SALES";
  const isSales = entryType === "SALES";
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const accountsWithOpportunities = useMemo(() => {
    if (!accountsData?.items || !opportunitiesData?.items?.length) return [];
    const accountIdsWithOpps = new Set(
      opportunitiesData.items.map((o) => o.account_id).filter((id): id is string => !!id)
    );
    return accountsData.items.filter((a) => accountIdsWithOpps.has(a.id));
  }, [accountsData?.items, opportunitiesData?.items]);

  const opportunitiesForAccount = useMemo(() => {
    if (!opportunitiesData?.items?.length) return [];
    if (!line.account_id) {
      return opportunitiesData.items.filter((o) =>
        opportunityOverlapsWeek(o.start_date, o.end_date, weekStart)
      );
    }
    return opportunitiesData.items.filter(
      (o) =>
        o.account_id === line.account_id &&
        opportunityOverlapsWeek(o.start_date, o.end_date, weekStart)
    );
  }, [opportunitiesData?.items, line.account_id, weekStart]);

  const { data: engagementDetail } = useEngagementDetail(line.engagement_id || "", {
    enabled: !!line.engagement_id && !isSales,
  });

  const weekRange = useMemo(() => {
    const [y, m, d] = weekStart.split("-").map(Number);
    const start = new Date(y, m - 1, d);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }, [weekStart]);

  const phasesInWeek = useMemo(() => {
    if (!engagementDetail?.phases) return [];
    return engagementDetail.phases.filter((p) => {
      const pStart = new Date(p.start_date);
      const pEnd = new Date(p.end_date);
      return pStart <= weekRange.end && pEnd >= weekRange.start;
    });
  }, [engagementDetail?.phases, weekRange]);

  const accountsFromEngagements = useMemo(() => {
    if (!engagementsSource.length) return [];
    const seen = new Set<string>();
    const result: { id: string; name: string }[] = [];
    for (const e of engagementsSource) {
      if (e.account_id && !seen.has(e.account_id)) {
        seen.add(e.account_id);
        result.push({ id: e.account_id, name: e.account_name || "—" });
      }
    }
    return result;
  }, [engagementsSource]);

  const projectsForEngagement = useMemo(() => {
    if (!engagementsSource.length || !line.account_id) return [];
    return engagementsSource.filter((e) => e.account_id === line.account_id);
  }, [engagementsSource, line.account_id]);

  const opportunityById = useMemo(() => {
    const m = new Map<string, OpportunityListItem>();
    for (const o of opportunitiesData?.items ?? []) m.set(o.id, o);
    return m;
  }, [opportunitiesData?.items]);

  const accountName = line.account_id
    ? accountsData?.items?.find((a) => a.id === line.account_id)?.company_name
    : undefined;
  const projectDisplayName = line.opportunity_name ?? line.engagement_name;

  const handleTypeChange = (newType: "" | "ENGAGEMENT" | "SALES") => {
    onChange({
      ...line,
      entry_type: newType === "" ? undefined : newType,
      account_id: undefined,
      engagement_id: undefined,
      opportunity_id: undefined,
      engagement_phase_id: undefined,
      engagement_line_item_id: undefined,
      billable: newType === "SALES" ? false : line.billable ?? true,
    });
  };

  const receipts = line.receipts ?? [];
  const pendingReceipts = line.pendingReceipts ?? [];

  const handleUpload = async (file: File) => {
    if (!line.id) {
      const localId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `pr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      onChange({
        ...line,
        pendingReceipts: [...pendingReceipts, { localId, file }],
      });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    try {
      await expensesApi.uploadReceipt(line.id, file);
      onReceiptsUpdated?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removePendingReceipt = (localId: string) => {
    onChange({
      ...line,
      pendingReceipts: pendingReceipts.filter((p) => p.localId !== localId),
    });
  };

  const handleDeleteReceipt = async (receiptId: string) => {
    if (!line.id) return;
    if (!confirm("Delete this receipt?")) return;
    try {
      await expensesApi.deleteReceipt(line.id, receiptId);
      onReceiptDeleted?.(line.id, receiptId);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const rowBg = "bg-white dark:bg-slate-900";

  return (
    <tr className={cn("border-b border-slate-200/80 hover:bg-slate-50/50 dark:hover:bg-slate-800/30", rowBg)}>
      <td className="px-1 py-1 align-middle w-[88px]">
        {canEdit ? (
          <Select
            value={entryType}
            onChange={(e) => handleTypeChange(e.target.value as "" | "ENGAGEMENT" | "SALES")}
            className="w-full text-[11px] py-1 h-7"
          >
            {ENTRY_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value || "empty"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        ) : (
          <span className="text-xs">{ENTRY_TYPE_OPTIONS.find((o) => o.value === entryType)?.label ?? entryType}</span>
        )}
      </td>
      <td className="px-1 py-1 align-middle w-[120px]">
        {canEdit ? (
          <Select
            value={line.account_id || ""}
            onChange={(e) => {
              const accountId = e.target.value;
              onChange({
                ...line,
                account_id: accountId || undefined,
                opportunity_id: undefined,
                engagement_id: undefined,
                engagement_phase_id: undefined,
                engagement_line_item_id: undefined,
              });
            }}
            className="w-full text-[11px] py-1 h-7"
            disabled={!entryType}
          >
            <option value="">—</option>
            {isSales
              ? accountsWithOpportunities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.company_name}
                  </option>
                ))
              : (() => {
                  const opts = [...accountsFromEngagements];
                  if (line.account_id && accountName && !opts.some((a) => a.id === line.account_id)) {
                    opts.unshift({ id: line.account_id, name: accountName });
                  }
                  return opts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ));
                })()}
          </Select>
        ) : (
          <span className="text-xs truncate block max-w-[118px]" title={accountName}>
            {accountName || "—"}
          </span>
        )}
      </td>
      <td className="px-1 py-1 align-middle w-[140px]">
        {canEdit ? (
          isSales ? (
            <Select
              value={line.opportunity_id || ""}
              onChange={(e) => {
                const oppId = e.target.value;
                const opp = opportunitiesForAccount.find((o) => o.id === oppId);
                onChange({
                  ...line,
                  opportunity_id: oppId || undefined,
                  opportunity_name: opp?.name,
                  billable: oppId && opp ? (opp.billable_expenses ?? true) : false,
                });
              }}
              className="w-full text-[11px] py-1 h-7"
              disabled={!line.account_id}
            >
              <option value="">—</option>
              {opportunitiesForAccount.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          ) : (
            <Select
              value={line.engagement_id || ""}
              onChange={(e) => {
                const engId = e.target.value;
                const eng = projectsForEngagement.find((x) => x.id === engId);
                const opp = eng?.opportunity_id ? opportunityById.get(eng.opportunity_id) : undefined;
                onChange({
                  ...line,
                  engagement_id: engId || undefined,
                  engagement_name: eng?.name || eng?.opportunity_name,
                  engagement_phase_id: undefined,
                  engagement_line_item_id: undefined,
                  billable: opp ? (opp.billable_expenses ?? true) : line.billable,
                });
              }}
              className="w-full text-[11px] py-1 h-7"
              disabled={!line.account_id}
            >
              <option value="">—</option>
              {projectsForEngagement.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.opportunity_name || e.name || e.id}
                </option>
              ))}
            </Select>
          )
        ) : (
          <span className="text-xs truncate block max-w-[138px]" title={projectDisplayName ?? undefined}>
            {projectDisplayName || "—"}
          </span>
        )}
      </td>
      <td className="px-1 py-1 align-middle w-[100px]">
        {canEdit && !isSales ? (
          <Select
            value={line.engagement_phase_id || ""}
            onChange={(e) =>
              onChange({
                ...line,
                engagement_phase_id: e.target.value || undefined,
              })
            }
            className="w-full text-[11px] py-1 h-7"
            disabled={!line.engagement_id}
          >
            <option value="">—</option>
            {phasesInWeek.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        ) : (
          <span className="text-xs">{line.phase_name || "—"}</span>
        )}
      </td>
      <td className="px-1 py-1 text-center w-[56px]">
        {canEdit ? (
          <Checkbox
            checked={!!line.billable}
            onChange={(e) => onChange({ ...line, billable: e.target.checked })}
            aria-label="Billable"
          />
        ) : (
          <span className="text-xs">{line.billable ? "Y" : "N"}</span>
        )}
      </td>
      <td className="px-1 py-1 text-center w-[56px]">
        {canEdit ? (
          <Checkbox
            checked={!!line.reimburse}
            onChange={(e) => onChange({ ...line, reimburse: e.target.checked })}
            aria-label="Reimburse"
          />
        ) : (
          <span className="text-xs">{line.reimburse ? "Y" : "N"}</span>
        )}
      </td>
      <td className="px-1 py-1 w-[118px]">
        {canEdit ? (
          <Input
            type="date"
            value={(line.date_incurred || "").slice(0, 10)}
            onChange={(e) => onChange({ ...line, date_incurred: e.target.value || null })}
            className="h-7 text-[11px] px-1"
          />
        ) : (
          <span className="text-xs">{(line.date_incurred || "").slice(0, 10) || "—"}</span>
        )}
      </td>
      <td className="px-1 py-1 w-[120px]">
        {canEdit ? (
          <Select
            value={line.expense_category_id != null ? String(line.expense_category_id) : ""}
            onChange={(e) => {
              const v = e.target.value;
              onChange({
                ...line,
                expense_category_id: v ? parseInt(v, 10) : null,
              });
            }}
            className="w-full text-[11px] py-1 h-7"
          >
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        ) : (
          <span className="text-xs">{line.category_name || "—"}</span>
        )}
      </td>
      <td className="px-1 py-1 w-[140px]">
        {canEdit ? (
          <Input
            value={line.description ?? ""}
            onChange={(e) => onChange({ ...line, description: e.target.value || null })}
            className="h-7 text-[11px] px-1"
            placeholder="Note"
          />
        ) : (
          <span className="text-xs truncate block max-w-[136px]">{line.description || "—"}</span>
        )}
      </td>
      <td className="px-1 py-1 w-[52px]">
        {canEdit ? (
          <Input
            value={line.line_currency ?? ""}
            onChange={(e) =>
              onChange({
                ...line,
                line_currency: e.target.value.toUpperCase().slice(0, 3) || undefined,
              })
            }
            className="h-7 text-[11px] px-1 uppercase"
            maxLength={3}
            placeholder="USD"
          />
        ) : (
          <span className="text-xs">{line.line_currency}</span>
        )}
      </td>
      <td className="px-1 py-1 w-[80px]">
        {canEdit ? (
          <Input
            type="number"
            step="0.01"
            min="0"
            value={line.amount === undefined || line.amount === null ? "" : String(line.amount)}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ ...line, amount: v === "" ? undefined : v });
            }}
            className="h-7 text-[11px] px-1"
          />
        ) : (
          <span className="text-xs tabular-nums">{String(line.amount ?? "")}</span>
        )}
      </td>
      <td className="px-1 py-1 align-middle min-w-[150px] max-w-[240px]">
        <div className="flex flex-wrap items-center gap-1">
          {pendingReceipts.map((pr) => (
            <span
              key={pr.localId}
              className="inline-flex items-center gap-0.5 rounded border border-dashed border-amber-300/80 bg-amber-50/90 dark:bg-amber-950/40 px-1 py-0.5 text-[10px] leading-tight max-w-[min(100%,11rem)]"
              title="Not uploaded yet — will upload when you Save or Submit for Approval"
            >
              <button
                type="button"
                className="inline-flex min-w-0 items-center gap-0.5 text-blue-600 hover:underline"
                onClick={() => downloadLocalFile(pr.file)}
              >
                <Download className="w-3 h-3 shrink-0" />
                <span className="truncate">{pr.file.name || "receipt"}</span>
              </button>
              {canEdit && (
                <button
                  type="button"
                  className="text-red-600 p-0.5 shrink-0"
                  onClick={() => removePendingReceipt(pr.localId)}
                  aria-label="Remove unsaved receipt"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
          {receipts.map((r) => (
            <span
              key={r.id}
              className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-slate-50 dark:bg-slate-800/80 px-1 py-0.5 text-[10px] leading-tight max-w-[min(100%,11rem)]"
            >
              <button
                type="button"
                className="inline-flex min-w-0 items-center gap-0.5 text-blue-600 hover:underline disabled:opacity-50"
                disabled={!!downloadingId || !line.id}
                onClick={async () => {
                  if (!line.id) return;
                  setDownloadingId(r.id);
                  try {
                    await expensesApi.downloadReceipt(
                      line.id,
                      r.id,
                      r.original_filename || "receipt"
                    );
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Download failed");
                  } finally {
                    setDownloadingId(null);
                  }
                }}
              >
                <Download className="w-3 h-3 shrink-0" />
                <span className="truncate">{r.original_filename || "file"}</span>
              </button>
              {canEdit && (
                <button
                  type="button"
                  className="text-red-600 p-0.5 shrink-0"
                  onClick={() => handleDeleteReceipt(r.id)}
                  aria-label="Remove receipt"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
          {canEdit && (
            <>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept="image/*,.pdf,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUpload(f);
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 shrink-0 text-[10px] px-1.5"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                title={
                  uploading
                    ? "Uploading…"
                    : !line.id
                      ? "Receipt is kept with this row until you Save or Submit for Approval."
                      : "Upload receipt"
                }
              >
                <Upload className="w-3 h-3 mr-0.5" />
                {uploading ? "…" : "Receipt"}
              </Button>
            </>
          )}
        </div>
      </td>
      {canEdit && onDelete && (
        <td className="px-1 py-1 w-[36px]">
          <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5 text-red-600" />
          </Button>
        </td>
      )}
    </tr>
  );
}

"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  useMyExpenseSheet,
  useExpenseSheet,
  useExpenseSheetByEmployee,
  useExpenseWeekStatuses,
  useSaveExpenseEntries,
  useSubmitExpenseSheet,
  useApproveExpenseSheet,
  useRejectExpenseSheet,
  useReopenExpenseSheet,
} from "@/hooks/useExpenses";
import { useExpenseCategories } from "@/hooks/useExpenseCategories";
import { useAuth } from "@/hooks/useAuth";
import { useAccounts } from "@/hooks/useAccounts";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useEngagements } from "@/hooks/useEngagements";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Receipt, XCircle, CheckCircle2, Plus, RotateCcw } from "lucide-react";
import { WeekCarousel, getWeekStart } from "@/components/timesheets/week-carousel";
import type { ExpenseLine, ExpenseLineUpsert } from "@/types/expense";
import { ExpenseLineRow } from "@/components/expenses/expense-line-row";
import { FetchError } from "@/lib/fetchClient";
import { expensesApi } from "@/lib/api/expenses";
import {
  type ClientExpenseLine,
  expenseLineHasValues,
  expenseLineMissingFields,
  summarizeSubmitBlockers,
} from "@/lib/expenseLineValidation";
import { computeExpenseLiveTotals, formatExpenseTotal } from "@/lib/expenseLineTotals";

function sortLines<T extends { row_order?: number }>(lines: T[]): T[] {
  return [...lines].sort((a, b) => (a.row_order ?? 0) - (b.row_order ?? 0));
}

function toSaveEntries(lines: ClientExpenseLine[]): ExpenseLineUpsert[] {
  return lines.map((l, i) => ({
    id: l.id,
    entry_type: (l.entry_type || "ENGAGEMENT") as "ENGAGEMENT" | "SALES",
    account_id: l.account_id,
    engagement_id: l.engagement_id,
    opportunity_id: l.opportunity_id,
    engagement_line_item_id: l.engagement_line_item_id,
    engagement_phase_id: l.engagement_phase_id,
    billable: l.billable,
    reimburse: l.reimburse,
    date_incurred: l.date_incurred,
    expense_category_id: l.expense_category_id,
    description: l.description,
    line_currency: l.line_currency,
    amount: l.amount,
    row_order: i,
  }));
}

/**
 * Merge server lines after refetch with local editor state.
 * Server payload can lag unsaved edits (e.g. after receipt upload); same-id rows keep local fields
 * but take `receipts` from the server when present so new uploads appear.
 */
function mergeServerLinesWithLocal(incoming: ClientExpenseLine[], prev: ClientExpenseLine[]): ClientExpenseLine[] {
  if (!prev.length) return incoming;
  const withLocal = incoming.map((inc) => {
    const match = prev.find((p) => p.id && p.id === inc.id);
    if (!match) return inc;
    // Server is source of truth for persisted receipts (avoids keeping deleted files after refetch).
    const receipts = Array.isArray(inc.receipts) ? inc.receipts : [];
    return {
      ...inc,
      ...match,
      receipts,
      pendingReceipts: match.pendingReceipts?.length ? match.pendingReceipts : [],
    };
  });
  const orphans = prev.filter((p) => !p.id);
  return [...withLocal, ...orphans];
}

function mapServerLinesToClient(lines: ExpenseLine[]): ClientExpenseLine[] {
  return sortLines(lines).map((l) => ({
    id: l.id,
    entry_type: (l.entry_type || "ENGAGEMENT") as "ENGAGEMENT" | "SALES",
    account_id: l.account_id ?? undefined,
    engagement_id: l.engagement_id ?? undefined,
    opportunity_id: l.opportunity_id ?? undefined,
    engagement_line_item_id: l.engagement_line_item_id ?? undefined,
    engagement_phase_id: l.engagement_phase_id ?? undefined,
    billable: l.billable,
    reimburse: l.reimburse,
    date_incurred: l.date_incurred ?? null,
    expense_category_id: l.expense_category_id ?? null,
    description: l.description ?? null,
    line_currency: l.line_currency,
    amount: l.amount,
    row_order: l.row_order,
    receipts: l.receipts,
    account_name: l.account_name ?? undefined,
    engagement_name: l.engagement_name ?? undefined,
    opportunity_name: l.opportunity_name ?? undefined,
    category_name: l.category_name ?? undefined,
  }));
}

function ExpensesPageContent() {
  const searchParams = useSearchParams();
  const expenseIdParam = searchParams.get("expense");
  const employeeIdParam = searchParams.get("employee");
  const weekParam = searchParams.get("week");
  const today = new Date();
  const currentWeekStart = getWeekStart(today);
  const [selectedWeek, setSelectedWeek] = useState(weekParam || currentWeekStart);

  const isViewingBySheetId = !!expenseIdParam;
  const isViewingByEmployeeWeek = !!employeeIdParam && !!weekParam;
  const isViewingOwn = !isViewingBySheetId && !isViewingByEmployeeWeek;

  const { data: sheetById, isLoading: loadingById, error: errorById, refetch: refetchById } = useExpenseSheet(
    expenseIdParam ?? "",
    { enabled: isViewingBySheetId }
  );
  const { data: sheetByEmployee, isLoading: loadingByEmployee, error: errorByEmployee, refetch: refetchByEmployee } =
    useExpenseSheetByEmployee(employeeIdParam ?? "", weekParam ?? "", { enabled: isViewingByEmployeeWeek });
  const { data: mySheet, isLoading: loadingMine, error: errorMine, refetch: refetchMine } = useMyExpenseSheet(
    isViewingOwn ? weekParam || selectedWeek : undefined,
    { enabled: isViewingOwn }
  );

  const sheet = sheetById ?? sheetByEmployee ?? mySheet;
  const isLoading =
    (isViewingBySheetId && loadingById) || (isViewingByEmployeeWeek && loadingByEmployee) || (isViewingOwn && loadingMine);
  const error = errorById ?? errorByEmployee ?? errorMine;
  const refetch = useCallback(() => {
    if (isViewingBySheetId) void refetchById();
    else if (isViewingByEmployeeWeek) void refetchByEmployee();
    else void refetchMine();
  }, [isViewingBySheetId, isViewingByEmployeeWeek, refetchById, refetchByEmployee, refetchMine]);

  useEffect(() => {
    if (sheet?.week_start_date) setSelectedWeek(sheet.week_start_date);
    else if (weekParam) setSelectedWeek(weekParam);
    else setSelectedWeek(currentWeekStart);
  }, [sheet?.week_start_date, weekParam, currentWeekStart]);

  const { user } = useAuth();
  const employeeId = sheet?.employee_id ?? user?.employee_id;

  const { data: engagementsAll } = useEngagements({ limit: 500 });
  const { data: engagementsForEmployee } = useEngagements(
    {
      employee_id: employeeId ?? undefined,
      limit: 200,
      week_start_date: sheet ? selectedWeek : undefined,
    },
    { enabled: !!employeeId }
  );
  const useWeekFilter = !!(employeeId && selectedWeek);
  const engagementsSource = useMemo(() => {
    if (useWeekFilter && engagementsForEmployee) {
      return engagementsForEmployee.items ?? [];
    }
    if (engagementsForEmployee?.items?.length) return engagementsForEmployee.items;
    if (engagementsAll?.items?.length) return engagementsAll.items;
    return [];
  }, [useWeekFilter, engagementsForEmployee, engagementsAll?.items]);

  const { data: weekStatuses } = useExpenseWeekStatuses({ past_weeks: 104, future_weeks: 12 }, { enabled: isViewingOwn });
  const { data: accountsData } = useAccounts({ limit: 500 });
  const { data: opportunitiesData } = useOpportunities({ limit: 500 });
  const { data: categoriesData } = useExpenseCategories({ skip: 0, limit: 500 });
  const categories = categoriesData?.items ?? [];

  const saveEntries = useSaveExpenseEntries();
  const submitSheet = useSubmitExpenseSheet();
  const approveSheet = useApproveExpenseSheet();
  const rejectSheet = useRejectExpenseSheet();
  const reopenSheet = useReopenExpenseSheet();

  const [localLines, setLocalLines] = useState<ClientExpenseLine[]>([]);
  const [reimbCurrency, setReimbCurrency] = useState("USD");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  useEffect(() => {
    if (sheet?.reimbursement_currency) setReimbCurrency(sheet.reimbursement_currency);
  }, [sheet?.reimbursement_currency, sheet?.id]);

  useEffect(() => {
    if (!sheet?.lines) {
      setLocalLines([]);
      return;
    }
    const incoming = mapServerLinesToClient(sheet.lines);
    setLocalLines((prev) => mergeServerLinesWithLocal(incoming, prev));
  }, [sheet?.id, sheet?.lines]);

  const canEdit = sheet && ["NOT_SUBMITTED", "REOPENED"].includes(sheet.status);
  const isOwner = !!(user?.employee_id && sheet?.employee_id === user.employee_id);

  const submitBlockers = useMemo(() => summarizeSubmitBlockers(localLines), [localLines]);

  const liveTotals = useMemo(
    () => computeExpenseLiveTotals(sortLines(localLines), reimbCurrency),
    [localLines, reimbCurrency]
  );

  const saveSheetAndFlushPendingReceipts = useCallback(async () => {
    if (!sheet) throw new Error("No sheet");
    const sorted = sortLines(localLines);
    const pendingByIndex = sorted.map((l) => [...(l.pendingReceipts ?? [])]);
    const data = await saveEntries.mutateAsync({
      sheetId: sheet.id,
      entries: toSaveEntries(sorted),
      reimbursement_currency: reimbCurrency,
    });
    let mapped = mapServerLinesToClient(data.lines ?? []);
    const uploadErrors: string[] = [];
    for (let i = 0; i < mapped.length; i++) {
      const lineId = mapped[i].id;
      const pendings = pendingByIndex[i] ?? [];
      if (!lineId || !pendings.length) continue;
      for (const pr of pendings) {
        try {
          await expensesApi.uploadReceipt(lineId, pr.file);
        } catch (e) {
          uploadErrors.push(e instanceof Error ? e.message : "Receipt upload failed");
        }
      }
    }
    mapped = mapped.map((l) => ({ ...l, pendingReceipts: [] }));
    setLocalLines(mapped);
    if (uploadErrors.length) {
      alert(`Entries were saved. Some receipts could not be uploaded:\n\n${uploadErrors.join("\n")}`);
    }
    refetch();
  }, [sheet, localLines, reimbCurrency, saveEntries, refetch]);

  const handleSave = async () => {
    if (!sheet) return;
    const saveHints = localLines.flatMap((l, i) => {
      if (!expenseLineHasValues(l)) return [];
      const m = expenseLineMissingFields(l);
      return m.length ? [`Row ${i + 1}: missing ${m.join(", ")}`] : [];
    });
    if (saveHints.length) {
      alert(`Fix the following before saving:\n\n${saveHints.join("\n")}`);
      return;
    }
    try {
      await saveSheetAndFlushPendingReceipts();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    }
  };

  const handleSubmit = async () => {
    if (!sheet) return;
    if (submitBlockers.length) {
      alert(`Cannot submit:\n\n${submitBlockers.join("\n")}`);
      return;
    }
    const saveHints = localLines.flatMap((l, i) => {
      if (!expenseLineHasValues(l)) return [];
      const m = expenseLineMissingFields(l);
      return m.length ? [`Row ${i + 1}: missing ${m.join(", ")}`] : [];
    });
    if (saveHints.length) {
      alert(`Fix the following before submitting:\n\n${saveHints.join("\n")}`);
      return;
    }
    try {
      await saveSheetAndFlushPendingReceipts();
      await submitSheet.mutateAsync({ sheetId: sheet.id });
      refetch();
    } catch (err) {
      const msg =
        err instanceof FetchError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to submit";
      alert(msg);
    }
  };

  const handleSelectWeek = (week: string) => {
    setSelectedWeek(week);
    const url = new URL(window.location.href);
    url.searchParams.set("week", week);
    window.history.replaceState({}, "", url.toString());
  };

  const handleAddRow = () => {
    setLocalLines((prev) => [
      ...prev,
      {
        entry_type: "ENGAGEMENT",
        billable: true,
        reimburse: true,
        line_currency: "USD",
        amount: 0,
        row_order: prev.length,
        receipts: [],
        __newRow: true,
      },
    ]);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p>Loading expense sheet...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-red-600">Error: {error instanceof Error ? error.message : String(error)}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-[1800px]">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Receipt className="w-8 h-8" />
          Expense Management
        </h1>
      </div>

      {sheet?.status === "REOPENED" && sheet?.rejection_note && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-start gap-2">
            <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-900">
              <span className="font-medium">This expense sheet was rejected.</span> Reason: {sheet.rejection_note}
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4 border-0 shadow-lg bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <CardContent className="p-4">
          <WeekCarousel
            selectedWeek={selectedWeek}
            onSelectWeek={handleSelectWeek}
            incompleteWeeks={[]}
            weekStatuses={isViewingOwn ? weekStatuses ?? {} : {}}
            trackIncomplete={false}
            readOnly={!isViewingOwn}
            readOnlyHint="Use Expense Approvals to open another employee or week"
          />
        </CardContent>
      </Card>

      {sheet && (
        <>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge>{sheet.status}</Badge>
                <span className="text-sm text-gray-600">
                  Reimbursement: {canEdit ? reimbCurrency : sheet.reimbursement_currency} • Total:{" "}
                  {canEdit
                    ? formatExpenseTotal(liveTotals.totalAmount)
                    : String(sheet.total_amount)}{" "}
                  • Billable:{" "}
                  {canEdit
                    ? formatExpenseTotal(liveTotals.totalBillable)
                    : String(sheet.total_billable)}{" "}
                  • Reimburse:{" "}
                  {canEdit
                    ? formatExpenseTotal(liveTotals.totalReimbursement)
                    : String(sheet.total_reimbursement)}
                </span>
                {sheet.employee_name && <span className="text-sm text-gray-600">• {sheet.employee_name}</span>}
              </div>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Sheet reimbursement currency</label>
                  <Select
                    value={reimbCurrency}
                    onChange={(e) => setReimbCurrency(e.target.value)}
                    className="w-24 h-8 text-xs"
                  >
                    {["USD", "EUR", "GBP", "CAD", "AUD"].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                  <span className="text-xs text-gray-400">Saved with your entries</span>
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex flex-wrap gap-2 justify-end">
                {canEdit && (
                  <>
                    <Button onClick={() => void handleSave()} disabled={saveEntries.isPending}>
                      {saveEntries.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      onClick={() => void handleSubmit()}
                      disabled={submitSheet.isPending || submitBlockers.length > 0}
                      title={
                        submitBlockers.length
                          ? submitBlockers.join(" · ")
                          : "Submit this week for approval"
                      }
                    >
                      {submitSheet.isPending ? "Submitting..." : "Submit for Approval"}
                    </Button>
                  </>
                )}
                {isOwner && sheet.status === "SUBMITTED" && (
                  <Button
                    variant="outline"
                    onClick={() => reopenSheet.mutate({ sheetId: sheet.id }, { onSuccess: () => refetch() })}
                    disabled={reopenSheet.isPending}
                  >
                    <RotateCcw className="w-4 h-4 mr-1" />
                    {reopenSheet.isPending ? "Reopening..." : "Re-Open"}
                  </Button>
                )}
                {!isViewingOwn && sheet.status === "SUBMITTED" && (
                  <>
                    <Button
                      onClick={() => approveSheet.mutate({ sheetId: sheet.id }, { onSuccess: () => refetch() })}
                      disabled={approveSheet.isPending}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setRejectNote("");
                        setRejectDialogOpen(true);
                      }}
                      disabled={rejectSheet.isPending}
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                  </>
                )}
              </div>
              {canEdit && submitBlockers.length > 0 && (
                <p
                  className="text-xs text-amber-800 dark:text-amber-300 max-w-xl text-right"
                  role="status"
                  aria-live="polite"
                >
                  <span className="font-medium">Submit is disabled: </span>
                  {submitBlockers.join(" ")}
                </p>
              )}
            </div>
          </div>

          <Dialog
            open={rejectDialogOpen}
            onOpenChange={(open) => {
              setRejectDialogOpen(open);
              if (!open) setRejectNote("");
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reject Expense Sheet</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-gray-600 mb-2">The employee will see this note.</p>
              <Textarea
                placeholder="Reason (required)..."
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={4}
                className="mb-4"
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (!rejectNote.trim() || !sheet) return;
                    rejectSheet.mutate(
                      { sheetId: sheet.id, note: rejectNote.trim() },
                      {
                        onSuccess: () => {
                          setRejectDialogOpen(false);
                          setRejectNote("");
                          refetch();
                        },
                      }
                    );
                  }}
                  disabled={!rejectNote.trim() || rejectSheet.isPending}
                >
                  Reject
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Card className="border-0 shadow-xl overflow-hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur max-h-[calc(100vh-280px)] flex flex-col">
            <CardHeader className="flex-shrink-0 flex flex-row items-center justify-between bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 border-b px-4 py-3">
              <CardTitle className="text-base font-bold">Expense lines</CardTitle>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={handleAddRow}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add row
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0 overflow-auto flex-1 min-h-0">
              <div className="min-w-[1120px]">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b bg-slate-100/80 dark:bg-slate-800/80">
                      <th className="px-1 py-1.5 text-left font-medium w-[88px]">Type</th>
                      <th className="px-1 py-1.5 text-left font-medium w-[120px]">Account</th>
                      <th className="px-1 py-1.5 text-left font-medium w-[140px]">Project</th>
                      <th className="px-1 py-1.5 text-left font-medium w-[100px]">Phase</th>
                      <th className="px-1 py-1.5 text-center font-medium w-[56px]">Bill</th>
                      <th className="px-1 py-1.5 text-center font-medium w-[56px]">Reimb</th>
                      <th className="px-1 py-1.5 text-left font-medium w-[118px]">Date</th>
                      <th className="px-1 py-1.5 text-left font-medium w-[120px]">Category</th>
                      <th className="px-1 py-1.5 text-left font-medium w-[140px]">Description</th>
                      <th className="px-1 py-1.5 text-left font-medium w-[52px]">Cur</th>
                      <th className="px-1 py-1.5 text-left font-medium w-[80px]">Amount</th>
                      <th className="px-1 py-1.5 text-left font-medium min-w-[140px]">Receipts</th>
                      {canEdit && <th className="px-1 py-1.5 w-[36px]" />}
                    </tr>
                  </thead>
                  <tbody>
                    {localLines.map((line, idx) => (
                      <ExpenseLineRow
                        key={line.id || `new-${idx}`}
                        line={line}
                        weekStart={sheet.week_start_date}
                        engagementsSource={engagementsSource}
                        accountsData={accountsData}
                        opportunitiesData={opportunitiesData}
                        categories={categories}
                        canEdit={!!canEdit}
                        onChange={(updated) => {
                          const next = [...localLines];
                          next[idx] = {
                            ...updated,
                            receipts: updated.receipts ?? next[idx].receipts,
                            pendingReceipts: updated.pendingReceipts ?? next[idx].pendingReceipts,
                            __newRow: next[idx].__newRow,
                          };
                          setLocalLines(next);
                        }}
                        onDelete={
                          canEdit
                            ? () => setLocalLines((prev) => prev.filter((_, i) => i !== idx))
                            : undefined
                        }
                        onReceiptsUpdated={() => refetch()}
                        onReceiptDeleted={(lineId, receiptId) => {
                          setLocalLines((prev) =>
                            prev.map((l) =>
                              l.id === lineId
                                ? {
                                    ...l,
                                    receipts: (l.receipts ?? []).filter((r) => r.id !== receiptId),
                                  }
                                : l
                            )
                          );
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {isViewingOwn && (
            <p className="text-xs text-muted-foreground mt-3">
              Approvers open your sheet from{" "}
              <Link href="/expense-approvals" className="text-blue-600 hover:underline">
                Expense Approvals
              </Link>
              .
            </p>
          )}

          {sheet.status_history && sheet.status_history.length > 0 && (
            <Card className="mt-4 border-0 shadow-md">
              <CardHeader className="py-3">
                <CardTitle className="text-base">Change history</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <ul className="space-y-2 text-sm">
                  {sheet.status_history.map((h) => (
                    <li key={h.id} className="border-b border-slate-100 last:border-0 py-1">
                      <span className="font-medium">{new Date(h.changed_at).toLocaleString()}</span>{" "}
                      <span className="text-slate-600">
                        {h.from_status && h.from_status !== h.to_status
                          ? `${h.from_status} → ${h.to_status}`
                          : h.to_status}
                      </span>
                      {h.changed_by_name && (
                        <span className="text-slate-500"> by {h.changed_by_name}</span>
                      )}
                      {h.note && h.note !== "Entries saved" && (
                        <span className="block text-amber-700 text-xs mt-0.5">Note: {h.note}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function ExpensesPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-6">
          <p>Loading…</p>
        </div>
      }
    >
      <ExpensesPageContent />
    </Suspense>
  );
}

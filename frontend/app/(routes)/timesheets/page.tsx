"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  useMyTimesheet,
  useSaveTimesheetEntries,
  useSubmitTimesheet,
  useTimesheetIncompleteCount,
  useTimesheetIncompleteWeeks,
} from "@/hooks/useTimesheets";
import { useAuth } from "@/hooks/useAuth";
import { useAccounts } from "@/hooks/useAccounts";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useEngagements } from "@/hooks/useEngagements";
import { useEngagementDetail } from "@/hooks/useEngagements";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Clock, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { FetchError } from "@/lib/fetchClient";
import { WeekCarousel, getWeekStart, getWeekRange, formatWeekLabel } from "@/components/timesheets/week-carousel";
import type { TimesheetEntry, TimesheetEntryUpsert } from "@/types/timesheet";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function TimesheetPageContent() {
  const searchParams = useSearchParams();
  const weekParam = searchParams.get("week");
  const today = new Date();
  const currentWeekStart = getWeekStart(today);
  const [selectedWeek, setSelectedWeek] = useState(weekParam || currentWeekStart);

  useEffect(() => {
    if (weekParam) setSelectedWeek(weekParam);
    else setSelectedWeek(currentWeekStart);
  }, [weekParam, currentWeekStart]);

  const { user } = useAuth();
  const { data: timesheet, isLoading, error, refetch } = useMyTimesheet(selectedWeek);
  const { data: incompleteData } = useTimesheetIncompleteCount();

  const employeeId = timesheet?.employee_id ?? user?.employee_id;

  const { data: engagementsAll } = useEngagements({ limit: 500 });
  const { data: engagementsForEmployee } = useEngagements(
    { employee_id: employeeId ?? undefined, limit: 200 },
    { enabled: !!employeeId }
  );
  const engagementsSource = useMemo(() => {
    if (engagementsForEmployee?.items?.length) return engagementsForEmployee.items;
    if (engagementsAll?.items?.length) return engagementsAll.items;
    return [];
  }, [engagementsForEmployee?.items, engagementsAll?.items]);

  const { data: incompleteWeeksData } = useTimesheetIncompleteWeeks({
    enabled: (incompleteData?.count ?? 0) > 0,
  });
  const { data: accountsData } = useAccounts({ limit: 500 });
  const { data: opportunitiesData } = useOpportunities({ limit: 500 });
  const saveEntries = useSaveTimesheetEntries();
  const submitTimesheet = useSubmitTimesheet();

  const [localEntries, setLocalEntries] = useState<TimesheetEntryUpsert[]>([]);
  const [planVsActualModalOpen, setPlanVsActualModalOpen] = useState(false);
  const [planVsActualMessage, setPlanVsActualMessage] = useState("");

  useEffect(() => {
    if (timesheet?.entries) {
      setLocalEntries(
        timesheet.entries.map((e) => ({
          ...e,
          id: e.id,
          entry_type: (e.entry_type || "ENGAGEMENT") as "ENGAGEMENT" | "SALES",
          account_id: e.account_id,
          engagement_id: e.engagement_id,
          opportunity_id: e.opportunity_id,
          engagement_line_item_id: e.engagement_line_item_id,
          engagement_phase_id: e.engagement_phase_id,
          billable: e.billable,
          row_order: e.row_order,
          sun_hours: e.sun_hours,
          mon_hours: e.mon_hours,
          tue_hours: e.tue_hours,
          wed_hours: e.wed_hours,
          thu_hours: e.thu_hours,
          fri_hours: e.fri_hours,
          sat_hours: e.sat_hours,
          day_notes: e.day_notes,
          account_name: (e as TimesheetEntry).account_name,
          engagement_name: (e as TimesheetEntry).engagement_name,
          opportunity_name: (e as TimesheetEntry).opportunity_name ?? (e as TimesheetEntry).engagement_name,
          requires_notes: (e as TimesheetEntry).requires_notes,
        })) as TimesheetEntryUpsert[]
      );
    } else {
      setLocalEntries([]);
    }
  }, [timesheet?.id, timesheet?.entries]);

  const canEdit = timesheet && ["NOT_SUBMITTED", "REOPENED"].includes(timesheet.status);
  const totalHours = useMemo(() => {
    if (!localEntries.length) return 0;
    return localEntries.reduce((sum, e) => {
      let rowSum = 0;
      DAY_KEYS.forEach((k) => {
        const v = e[`${k}_hours`];
        if (v !== undefined) rowSum += parseFloat(String(v)) || 0;
      });
      return sum + rowSum;
    }, 0);
  }, [localEntries]);

  const handleSave = async () => {
    if (!timesheet) return;
    const filtered = localEntries.filter((e) => e.id || e.account_id);
    const toSend: TimesheetEntryUpsert[] = filtered.map((e, i) => ({
      id: e.id,
      entry_type: e.entry_type,
      account_id: e.account_id,
      engagement_id: e.engagement_id,
      opportunity_id: e.opportunity_id,
      engagement_line_item_id: e.engagement_line_item_id,
      engagement_phase_id: e.engagement_phase_id,
      billable: e.billable,
      row_order: i,
      sun_hours: e.sun_hours,
      mon_hours: e.mon_hours,
      tue_hours: e.tue_hours,
      wed_hours: e.wed_hours,
      thu_hours: e.thu_hours,
      fri_hours: e.fri_hours,
      sat_hours: e.sat_hours,
      day_notes: e.day_notes,
    }));
    try {
      await saveEntries.mutateAsync({
        timesheetId: timesheet.id,
        entries: toSend,
      });
      refetch();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to save");
    }
  };

  const handleSubmit = async (force = false) => {
    if (!timesheet) return;
    if (totalHours < 40) {
      alert("Total hours must be at least 40 to submit.");
      return;
    }
    setPlanVsActualModalOpen(false);
    try {
      await submitTimesheet.mutateAsync({
        timesheetId: timesheet.id,
        body: { force },
      });
      setPlanVsActualMessage("");
      refetch();
    } catch (err: unknown) {
      const resp = err instanceof FetchError ? err.data : (err as { data?: unknown })?.data;
      const detail = resp && typeof resp === "object" && "detail" in resp ? (resp as { detail?: unknown }).detail : null;
      if (detail && typeof detail === "object" && (detail as { requires_force?: boolean }).requires_force) {
        const msg = (detail as { message?: string }).message || "Plan vs actual differs. Submit anyway?";
        setPlanVsActualMessage(msg);
        setPlanVsActualModalOpen(true);
      } else {
        alert(err instanceof Error ? err.message : "Failed to submit");
      }
    }
  };

  const handleAddRow = () => {
    const firstAccount = localEntries[0]?.account_id;
    setLocalEntries((prev) => [
      ...prev,
      {
        entry_type: "ENGAGEMENT" as const,
        account_id: firstAccount,
        billable: true,
        row_order: prev.length,
        sun_hours: 0,
        mon_hours: 0,
        tue_hours: 0,
        wed_hours: 0,
        thu_hours: 0,
        fri_hours: 0,
        sat_hours: 0,
      } as TimesheetEntryUpsert,
    ]);
  };

  const weekRange = useMemo(() => getWeekRange(selectedWeek), [selectedWeek]);

  const handleSelectWeek = (week: string) => {
    setSelectedWeek(week);
    const url = new URL(window.location.href);
    url.searchParams.set("week", week);
    window.history.replaceState({}, "", url.toString());
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p>Loading timesheet...</p>
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
            <p className="text-red-600">
              Error: {error instanceof Error ? error.message : String(error)}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-[1600px]">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Clock className="w-8 h-8" />
          Timesheet Management
        </h1>
        {incompleteData && incompleteData.count > 0 && (
          <Badge variant="destructive" className="text-sm">
            {incompleteData.count} week(s) incomplete
          </Badge>
        )}
      </div>

      {/* Backlog banner */}
      {incompleteData && incompleteData.count > 0 && (
        <Alert className="mb-4 border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>You have {incompleteData.count} week(s) with incomplete timesheets.</span>
            {incompleteWeeksData?.weeks && incompleteWeeksData.weeks.length > 0 && (
              <span className="flex flex-wrap gap-1">
                {incompleteWeeksData.weeks.slice(0, 8).map((w) => (
                  <Link key={w} href={`/timesheets?week=${w}`}>
                    <Button size="sm" variant="ghost" className="h-7 text-xs">
                      {formatWeekLabel(w)}
                    </Button>
                  </Link>
                ))}
                {incompleteWeeksData.weeks.length > 8 && (
                  <span className="text-xs text-amber-700">
                    +{incompleteWeeksData.weeks.length - 8} more (scroll week carousel for all)
                  </span>
                )}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Week carousel */}
      <Card className="mb-4 border-0 shadow-lg bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <CardContent className="p-4">
          <WeekCarousel
            selectedWeek={selectedWeek}
            onSelectWeek={handleSelectWeek}
            incompleteWeeks={incompleteWeeksData?.weeks ?? []}
            visibleCount={5}
          />
        </CardContent>
      </Card>

      {timesheet && (
        <>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Badge>{timesheet.status}</Badge>
              <span className="text-sm text-gray-600">
                Total: {totalHours.toFixed(1)} hours
                {timesheet.employee_name && ` • ${timesheet.employee_name}`}
              </span>
            </div>
            <div className="flex gap-2">
              {canEdit && (
                <>
                  <Button onClick={handleSave} disabled={saveEntries.isPending}>
                    {saveEntries.isPending ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    onClick={() => handleSubmit(false)}
                    disabled={submitTimesheet.isPending || totalHours < 40}
                  >
                    {submitTimesheet.isPending ? "Submitting..." : "Submit for Approval"}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Plan vs Actual modal */}
          <Dialog open={planVsActualModalOpen} onOpenChange={setPlanVsActualModalOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Plan vs Actual</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-gray-600">{planVsActualMessage}</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPlanVsActualModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => handleSubmit(true)}>Submit Anyway</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Card className="border-0 shadow-xl overflow-hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur max-h-[calc(100vh-320px)] flex flex-col">
            <CardHeader className="flex-shrink-0 flex flex-row items-center justify-between bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 border-b border-slate-200/80 px-4 py-3">
              <CardTitle className="text-base font-bold text-slate-800 dark:text-slate-100">Time Entries</CardTitle>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={handleAddRow} className="rounded-lg border-blue-200 hover:bg-blue-50 hover:border-blue-300 transition-colors">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Row
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0 overflow-auto flex-1 min-h-0">
              <div className="min-w-[860px]">
                <table className="w-full text-[11px] border-collapse table-fixed">
                  <thead>
                    <tr className="border-b bg-slate-100/80 dark:bg-slate-800/80">
                      <th className="px-2 py-1.5 text-left font-medium sticky left-0 bg-slate-100 dark:bg-slate-800 z-10 w-[95px]">Type</th>
                      <th className="px-2 py-1.5 text-left font-medium sticky left-[95px] bg-slate-100 dark:bg-slate-800 z-10 w-[135px]">Account</th>
                      <th className="px-2 py-1.5 text-left font-medium sticky left-[230px] bg-slate-100 dark:bg-slate-800 z-10 w-[155px]">Project</th>
                      <th className="px-2 py-1.5 text-left font-medium w-[100px]">Phase</th>
                      <th className="px-2 py-1.5 text-center font-medium w-[64px]">Billable</th>
                      {DAYS.map((d, i) => (
                        <th
                          key={d}
                          className={`px-1 py-1.5 text-center font-medium w-[56px] ${i === 0 || i === 6 ? "bg-blue-100/80 dark:bg-blue-900/30" : ""}`}
                        >
                          {d}
                        </th>
                      ))}
                      <th className="px-2 py-1.5 text-center font-medium w-[50px]">Total</th>
                      {canEdit && <th className="px-1 py-1.5 w-[36px]"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {localEntries.map((entry, idx) => (
                      <TimesheetEntryRow
                        key={entry.id || `new-${idx}`}
                        entry={entry}
                        employeeId={employeeId}
                        engagementsSource={engagementsSource}
                        accountsData={accountsData}
                        opportunitiesData={opportunitiesData}
                        canEdit={!!canEdit}
                        weekRange={weekRange}
                        onDelete={canEdit ? () => setLocalEntries((prev) => prev.filter((_, i) => i !== idx)) : undefined}
                        onChange={(updated) => {
                          const next = [...localEntries];
                          next[idx] = updated;
                          setLocalEntries(next);
                        }}
                      />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-50/80 dark:bg-slate-800/50 font-semibold">
                      <td colSpan={5} className="px-2 py-1.5 text-right">
                        Totals:
                      </td>
                      {DAY_KEYS.map((k, i) => (
                        <td
                          key={k}
                          className={`px-1 py-1 text-center tabular-nums ${i === 0 || i === 6 ? "bg-blue-100/60 dark:bg-blue-900/20" : ""}`}
                        >
                          {localEntries
                            .reduce((s, e) => s + (parseFloat(String(e[`${k}_hours`])) || 0), 0)
                            .toFixed(1)}
                        </td>
                      ))}
                      <td className="px-2 py-1 text-center tabular-nums font-bold">
                        {totalHours.toFixed(1)}
                      </td>
                      {canEdit && <td></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

const ENTRY_TYPE_OPTIONS = [
  { value: "ENGAGEMENT" as const, label: "Engagement" },
  { value: "SALES" as const, label: "Sales" },
];

interface EngagementItem {
  id: string;
  account_id?: string;
  account_name?: string;
  opportunity_name?: string;
  name?: string;
}

function TimesheetEntryRow({
  entry,
  employeeId,
  engagementsSource,
  accountsData,
  opportunitiesData,
  canEdit,
  weekRange,
  onDelete,
  onChange,
}: {
  entry: TimesheetEntryUpsert;
  employeeId?: string;
  engagementsSource: EngagementItem[];
  accountsData?: { items?: { id: string; company_name?: string }[] };
  opportunitiesData?: { items?: { id: string; name?: string; account_id?: string }[] };
  canEdit: boolean;
  weekRange: { start: Date; end: Date };
  onDelete?: () => void;
  onChange: (e: TimesheetEntryUpsert) => void;
}) {
  const entryType = (entry.entry_type || "ENGAGEMENT") as "ENGAGEMENT" | "SALES";
  const isSales = entryType === "SALES";

  const opportunitiesForAccount = useMemo(() => {
    if (!opportunitiesData?.items || !entry.account_id) return opportunitiesData?.items ?? [];
    return opportunitiesData.items.filter((o) => o.account_id === entry.account_id);
  }, [opportunitiesData?.items, entry.account_id]);

  const { data: engagementDetail } = useEngagementDetail(entry.engagement_id || "", {
    enabled: !!entry.engagement_id && canEdit && !isSales,
  });

  const entryAsResp = entry as TimesheetEntry & { requires_notes?: boolean };
  const requiresNotes = entryAsResp.requires_notes ?? false;

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
    if (!engagementsSource.length || !entry.account_id) return [];
    return engagementsSource.filter((e) => e.account_id === entry.account_id);
  }, [engagementsSource, entry.account_id]);

  const phasesInWeek = useMemo(() => {
    if (!engagementDetail?.phases || !weekRange || isSales) return [];
    return engagementDetail.phases.filter((p) => {
      const pStart = new Date(p.start_date);
      const pEnd = new Date(p.end_date);
      return pStart <= weekRange.end && pEnd >= weekRange.start;
    });
  }, [engagementDetail?.phases, weekRange, isSales]);

  const rowTotal = DAY_KEYS.reduce(
    (sum, k) => sum + (parseFloat(String(entry[`${k}_hours`])) || 0),
    0
  );

  const hasHoursOnDay = (dayIndex: number) => {
    const key = DAY_KEYS[dayIndex];
    const v = entry[`${key}_hours`];
    return (parseFloat(String(v)) || 0) > 0;
  };

  const updateDayNote = (dayOfWeek: number, note: string) => {
    const notes = [...(entry.day_notes || [])];
    const existingIdx = notes.findIndex((n) => n.day_of_week === dayOfWeek);
    if (note) {
      if (existingIdx >= 0) {
        notes[existingIdx] = { ...notes[existingIdx], note };
      } else {
        notes.push({ day_of_week: dayOfWeek, note });
      }
    } else if (existingIdx >= 0) {
      notes.splice(existingIdx, 1);
    }
    onChange({ ...entry, day_notes: notes });
  };

  const getDayNote = (dayOfWeek: number) =>
    entry.day_notes?.find((n) => n.day_of_week === dayOfWeek)?.note ?? "";

  const accountName = (entry as { account_name?: string }).account_name;
  const projectDisplayName = (entry as { opportunity_name?: string }).opportunity_name ?? (entry as { engagement_name?: string }).engagement_name;

  const handleTypeChange = (newType: "ENGAGEMENT" | "SALES") => {
    const base: TimesheetEntryUpsert = {
      ...entry,
      entry_type: newType,
      account_id: undefined,
      engagement_id: undefined,
      opportunity_id: undefined,
      engagement_phase_id: undefined,
    };
    if (newType === "SALES") {
      base.billable = false;
      DAY_KEYS.forEach((k) => {
        base[`${k}_hours`] = 0;
      });
    }
    onChange(base);
  };

  const inputBase =
    "w-14 h-7 text-center text-[11px] rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  const formatHourDisplay = (key: (typeof DAY_KEYS)[number]) => {
    const v = entry[`${key}_hours`];
    if (v === undefined || v === null || v === "") return "";
    const n = parseFloat(String(v));
    return isNaN(n) ? "" : n.toFixed(1);
  };

  const getHourRawValue = (key: (typeof DAY_KEYS)[number]) => {
    const v = entry[`${key}_hours`];
    if (v === undefined || v === null || v === "") return "";
    const n = parseFloat(String(v));
    return isNaN(n) ? "" : String(v);
  };

  const [editingHourKey, setEditingHourKey] = useState<string | null>(null);
  const getHourInputValue = (key: (typeof DAY_KEYS)[number]) => {
    if (editingHourKey === key) return getHourRawValue(key);
    return formatHourDisplay(key);
  };

  return (
    <tr className="border-b border-slate-200/80 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
      <td className="px-2 py-1 sticky left-0 bg-inherit z-10 w-[95px] align-top">
        {canEdit ? (
          <Select
            value={entryType}
            onChange={(e) => handleTypeChange(e.target.value as "ENGAGEMENT" | "SALES")}
            className="w-full max-w-[90px] rounded border-slate-200 text-xs py-1 h-7 min-h-0"
            title={ENTRY_TYPE_OPTIONS.find((o) => o.value === entryType)?.label}
          >
            {ENTRY_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        ) : (
          <span className="text-xs font-medium">{ENTRY_TYPE_OPTIONS.find((o) => o.value === entryType)?.label ?? entryType}</span>
        )}
      </td>
      <td className="px-2 py-1 sticky left-[95px] bg-inherit z-10 w-[135px] align-top">
        {canEdit ? (
          <Select
            value={entry.account_id || ""}
            onChange={(e) => {
              const accountId = e.target.value;
              onChange({
                ...entry,
                account_id: accountId || undefined,
                opportunity_id: undefined,
                engagement_id: undefined,
                engagement_phase_id: undefined,
                account_name: isSales
                  ? accountsData?.items?.find((a) => a.id === accountId)?.company_name
                  : accountsFromEngagements.find((a) => a.id === accountId)?.name,
              });
            }}
            className="w-full max-w-[130px] rounded border-slate-200 text-xs py-1 h-7 min-h-0"
            title={accountName || (isSales ? accountsData?.items?.find((a) => a.id === entry.account_id)?.company_name : accountsFromEngagements.find((a) => a.id === entry.account_id)?.name)}
          >
            <option value="">— Select —</option>
            {isSales
              ? (() => {
                  const accts = accountsData?.items ?? [];
                  if (entry.account_id && accountName && !accts.some((a) => a.id === entry.account_id)) {
                    return [
                      <option key={entry.account_id} value={entry.account_id}>
                        {accountName}
                      </option>,
                      ...accts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.company_name}
                        </option>
                      )),
                    ];
                  }
                  return accts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.company_name}
                    </option>
                  ));
                })()
              : (() => {
                  const opts = [...accountsFromEngagements];
                  if (entry.account_id && accountName && !opts.some((a) => a.id === entry.account_id)) {
                    opts.unshift({ id: entry.account_id, name: accountName });
                  }
                  return opts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ));
                })()}
          </Select>
        ) : (
          accountName || "—"
        )}
      </td>
      <td className="px-2 py-1 sticky left-[230px] bg-inherit z-10 w-[155px] align-top">
        {canEdit ? (
          isSales ? (
            <Select
              value={entry.opportunity_id || ""}
              onChange={(e) => {
                const oppId = e.target.value;
                const opp = opportunitiesForAccount.find((o) => o.id === oppId);
                onChange({
                  ...entry,
                  opportunity_id: oppId || undefined,
                  opportunity_name: opp?.name,
                });
              }}
              className="w-full max-w-[148px] rounded border-slate-200 text-xs py-1 h-7 min-h-0"
              disabled={!entry.account_id}
              title={projectDisplayName}
            >
              <option value="">— Select —</option>
              {(() => {
                const opps = opportunitiesForAccount;
                const currentName = (entry as { opportunity_name?: string }).opportunity_name;
                if (entry.opportunity_id && currentName && !opps.some((o) => o.id === entry.opportunity_id)) {
                  return [
                    <option key={entry.opportunity_id} value={entry.opportunity_id}>
                      {currentName}
                    </option>,
                    ...opps.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    )),
                  ];
                }
                return opps.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ));
              })()}
            </Select>
          ) : (
            <Select
              value={entry.engagement_id || ""}
              onChange={(e) => {
                const engId = e.target.value;
                const eng = projectsForEngagement.find((g) => g.id === engId);
                onChange({
                  ...entry,
                  engagement_id: engId || undefined,
                  opportunity_name: eng?.opportunity_name || eng?.name,
                  engagement_phase_id: undefined,
                });
              }}
              className="w-full max-w-[148px] rounded border-slate-200 text-xs py-1 h-7 min-h-0"
              disabled={!entry.account_id}
              title={projectDisplayName}
            >
              <option value="">— Select —</option>
              {(() => {
                const projs = [...projectsForEngagement];
                if (entry.engagement_id && projectDisplayName && !projs.some((g) => g.id === entry.engagement_id)) {
                  projs.unshift({
                    id: entry.engagement_id,
                    opportunity_name: projectDisplayName,
                    name: projectDisplayName,
                  } as EngagementItem);
                }
                return projs.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.opportunity_name || g.name}
                  </option>
                ));
              })()}
            </Select>
          )
        ) : (
          <span className="block truncate" title={projectDisplayName || undefined}>
            {projectDisplayName || "—"}
          </span>
        )}
      </td>
      <td className="px-2 py-1 w-[100px] align-top">
        {isSales ? (
          <Select
            value="sales"
            disabled
            className="w-full max-w-[95px] rounded border-slate-200 text-xs py-1 h-7 min-h-0 bg-slate-50 cursor-not-allowed"
          >
            <option value="sales">Sales</option>
          </Select>
        ) : canEdit && entry.engagement_id ? (
          <Select
            value={entry.engagement_phase_id || ""}
            onChange={(e) =>
              onChange({ ...entry, engagement_phase_id: e.target.value || undefined })
            }
            className="w-full max-w-[95px] rounded border-slate-200 text-xs py-1 h-7 min-h-0"
            title={phasesInWeek.find((p) => p.id === entry.engagement_phase_id)?.name || (entry as { phase_name?: string }).phase_name}
          >
            <option value="">— Select —</option>
            {phasesInWeek.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        ) : (
          (entry as { phase_name?: string }).phase_name || "—"
        )}
      </td>
      <td className="px-2 py-1 text-center align-top">
        {canEdit ? (
          <div className="flex justify-center">
            <Checkbox
              checked={!!entry.billable}
              disabled={isSales}
              onChange={(e) => !isSales && onChange({ ...entry, billable: e.target.checked })}
              className="h-4 w-4"
            />
          </div>
        ) : (
          entry.billable ? (
            <span className="text-green-600 text-xs font-medium">Yes</span>
          ) : (
            <span className="text-slate-500 text-xs">No</span>
          )
        )}
      </td>
      {DAY_KEYS.map((k, dayIndex) => (
        <td
          key={k}
          className={`px-1 py-1 w-[56px] align-top ${dayIndex === 0 || dayIndex === 6 ? "bg-blue-50/50 dark:bg-blue-900/10" : ""}`}
        >
          {canEdit ? (
            <div className="flex flex-col gap-0.5 items-center">
              <Input
                type="number"
                min={0}
                step={0.25}
                className={inputBase}
                value={getHourInputValue(k)}
                onFocus={() => setEditingHourKey(k)}
                onBlur={() => {
                  setEditingHourKey(null);
                  const v = entry[`${k}_hours`];
                  const n = parseFloat(String(v));
                  if (v !== undefined && v !== null && v !== "" && !isNaN(n) && String(v) !== n.toFixed(1)) {
                    onChange({ ...entry, [`${k}_hours`]: n });
                  }
                }}
                onChange={(e) =>
                  onChange({
                    ...entry,
                    [`${k}_hours`]: e.target.value ? parseFloat(e.target.value) : 0,
                  })
                }
              />
              {requiresNotes && hasHoursOnDay(dayIndex) && (
                <Input
                  type="text"
                  placeholder="Note"
                  className="w-full text-[10px] h-5 rounded border-slate-200"
                  value={getDayNote(dayIndex)}
                  onChange={(e) => updateDayNote(dayIndex, e.target.value)}
                />
              )}
            </div>
          ) : (
            <span className="text-xs font-medium tabular-nums">{parseFloat(String(entry[`${k}_hours`])) || 0}</span>
          )}
        </td>
      ))}
      <td className="px-2 py-1 text-center text-[11px] font-semibold tabular-nums align-top">
        {rowTotal.toFixed(1)}
        {rowTotal > 40 && (
          <span className="block text-[10px] text-amber-600 font-normal mt-0.5" title="Ensure you have approval from the project manager to exceed 40 hours.">
            Check PM approval
          </span>
        )}
      </td>
      {onDelete && (
        <td className="px-1 py-1 align-top">
          <button
            type="button"
            onClick={onDelete}
            className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
            aria-label="Delete row"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </td>
      )}
    </tr>
  );
}

export default function TimesheetPage() {
  return (
    <div className="container mx-auto p-4 max-w-[1600px]">
      <TimesheetPageContent />
    </div>
  );
}

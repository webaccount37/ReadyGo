"use client";

import { useState } from "react";
import {
  useApprovableTimesheets,
  useManageableEmployees,
  useApproveTimesheet,
  useRejectTimesheet,
  useMassApproveTimesheets,
  useMassRejectTimesheets,
} from "@/hooks/useTimesheets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { CheckCircle2, XCircle, Clock, Eye } from "lucide-react";
import Link from "next/link";
import { formatWeekLabel } from "@/components/timesheets/week-carousel";
import { cn } from "@/lib/utils";
import type { TimesheetApprovalSummary } from "@/types/timesheet";

const STATUS_TABS = [
  { value: "SUBMITTED", label: "Submitted for Approval" },
  { value: "NOT_SUBMITTED_REOPENED", label: "Not Submitted / Reopened" },
  { value: "APPROVED", label: "Approved" },
  { value: "ALL", label: "All" },
] as const;

export default function TimesheetApprovalsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("SUBMITTED");
  const [employeeFilter, setEmployeeFilter] = useState<string>("");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<TimesheetApprovalSummary | null>(null);
  const [massRejectIds, setMassRejectIds] = useState<string[]>([]);
  const [rejectNote, setRejectNote] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: employeesData } = useManageableEmployees();
  const statusParam =
    statusFilter === "ALL" || statusFilter === "NOT_SUBMITTED_REOPENED"
      ? undefined
      : statusFilter;
  const { data, isLoading, error } = useApprovableTimesheets({
    status: statusParam,
    employee_id: employeeFilter || undefined,
    skip: 0,
    limit: 200,
  });

  const approveTimesheet = useApproveTimesheet();
  const rejectTimesheet = useRejectTimesheet();
  const massApprove = useMassApproveTimesheets();
  const massReject = useMassRejectTimesheets();

  const items = data?.items ?? [];
  // Fallback: derive employees from timesheet list when API returns empty (ensures dropdown works)
  const employees =
    (employeesData?.items?.length ?? 0) > 0
      ? employeesData!.items
      : Array.from(
          new Map(
            items.map((ts) => {
              const parts = (ts.employee_name || "").trim().split(/\s+/);
              const first_name = parts[0] ?? "";
              const last_name = parts.slice(1).join(" ") ?? "";
              return [
                ts.employee_id,
                { id: ts.employee_id, first_name, last_name, email: "" },
              ] as const;
            })
          ).values()
        );
  const filteredItems =
    statusFilter === "NOT_SUBMITTED_REOPENED"
      ? items.filter((ts) => ts.status === "NOT_SUBMITTED" || ts.status === "REOPENED")
      : statusFilter === "ALL"
        ? items
        : items;

  const submittedItems = filteredItems.filter((ts) => ts.status === "SUBMITTED");
  const selectableIds = submittedItems.map((ts) => ts.id);
  const selectedCount = selectedIds.size;
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p>Loading...</p>
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

  const pendingCount = items.filter((ts) => ts.status === "SUBMITTED").length;

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Clock className="w-8 h-8" />
          Timesheet Approvals
        </h1>
        {pendingCount > 0 && (
          <Badge variant="secondary" className="text-sm">
            {pendingCount} pending
          </Badge>
        )}
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            Filter by status and employee to find timesheets you can view, edit, approve, or reject.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Status</label>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-[220px]"
            >
              {STATUS_TABS.map((tab) => (
                <option key={tab.value} value={tab.value}>
                  {tab.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Employee</label>
            <Select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="w-[220px]"
            >
              <option value="">All employees</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timesheets</CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            Click View to open a timesheet. You can edit, submit, approve, or reject on behalf of employees you manage.
          </p>
          {selectedCount > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-gray-600">{selectedCount} selected</span>
              <Button
                size="sm"
                variant="default"
                onClick={() => {
                  massApprove.mutate(Array.from(selectedIds), {
                    onSuccess: () => setSelectedIds(new Set()),
                  });
                }}
                disabled={massApprove.isPending}
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Approve selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setMassRejectIds(Array.from(selectedIds));
                  setRejectTarget(null);
                  setRejectNote("");
                  setRejectDialogOpen(true);
                }}
                disabled={massReject.isPending}
              >
                <XCircle className="w-4 h-4 mr-1" />
                Reject selected
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {filteredItems.length === 0 ? (
            <p className="text-gray-500 py-8 text-center">No timesheets match the current filters.</p>
          ) : (
            <div className="space-y-4">
              {submittedItems.length > 0 && (
                <div className="flex items-center gap-3 px-4 py-2 border-b text-sm font-medium text-gray-600">
                  <Checkbox
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all submitted"
                  />
                  <span>Select all submitted</span>
                </div>
              )}
              {filteredItems.map((ts) => (
                <div
                  key={ts.id}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-lg hover:bg-gray-50 border-l-4",
                    ts.status === "SUBMITTED" && "border-l-blue-500",
                    (ts.status === "NOT_SUBMITTED" || ts.status === "REOPENED") && "border-l-amber-500",
                    ts.status === "APPROVED" && "border-l-green-500",
                    ts.status === "INVOICED" && "border-l-slate-400"
                  )}
                >
                  <div className="flex-1 flex items-start gap-3">
                    {ts.status === "SUBMITTED" ? (
                      <Checkbox
                        checked={selectedIds.has(ts.id)}
                        onChange={() => toggleSelect(ts.id)}
                        aria-label={`Select ${ts.employee_name}`}
                      />
                    ) : (
                      <span className="w-4 h-4 shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/timesheets?timesheet=${ts.id}`}
                        className="font-medium hover:underline flex items-center gap-1"
                      >
                        {ts.employee_name}
                        <Eye className="w-3.5 h-3.5 text-gray-500" />
                      </Link>
                      <Badge variant="outline">{formatWeekLabel(ts.week_start_date)}</Badge>
                      <Badge
                        variant={
                          ts.status === "SUBMITTED"
                            ? "default"
                            : ts.status === "APPROVED"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {ts.status}
                      </Badge>
                      <span className="text-sm text-gray-600">{ts.total_hours} hours</span>
                    </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {ts.status === "SUBMITTED" && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => approveTimesheet.mutate(ts.id)}
                          disabled={approveTimesheet.isPending}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRejectTarget(ts);
                            setMassRejectIds([]);
                            setRejectNote("");
                            setRejectDialogOpen(true);
                          }}
                          disabled={rejectTimesheet.isPending}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}
                    <Link href={`/timesheets?timesheet=${ts.id}`}>
                      <Button size="sm" variant="ghost">
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={rejectDialogOpen}
        onOpenChange={(open) => {
          setRejectDialogOpen(open);
          if (!open) {
            setRejectTarget(null);
            setMassRejectIds([]);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {massRejectIds.length > 0
                ? `Reject ${massRejectIds.length} timesheet${massRejectIds.length === 1 ? "" : "s"}`
                : "Reject Timesheet"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 mb-2">
            {massRejectIds.length > 0
              ? "Please provide a reason for rejecting these timesheets. All employees will see this note."
              : "Please provide a reason for rejecting this timesheet. The employee will see this note."}
          </p>
          <Textarea
            placeholder="Enter rejection reason (required)..."
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
                if (!rejectNote.trim()) return;
                if (massRejectIds.length > 0) {
                  massReject.mutate(
                    { timesheetIds: massRejectIds, note: rejectNote.trim() },
                    {
                      onSuccess: () => {
                        setRejectDialogOpen(false);
                        setMassRejectIds([]);
                        setSelectedIds(new Set());
                      },
                    }
                  );
                } else if (rejectTarget) {
                  rejectTimesheet.mutate(
                    { timesheetId: rejectTarget.id, note: rejectNote.trim() },
                    {
                      onSuccess: () => {
                        setRejectDialogOpen(false);
                        setRejectTarget(null);
                      },
                    }
                  );
                }
              }}
              disabled={
                !rejectNote.trim() ||
                rejectTimesheet.isPending ||
                (massRejectIds.length > 0 && massReject.isPending)
              }
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

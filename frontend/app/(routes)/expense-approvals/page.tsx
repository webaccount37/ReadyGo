"use client";

import { useState } from "react";
import {
  useApprovableExpenseSheets,
  useExpenseManageableEmployees,
  useApproveExpenseSheet,
  useRejectExpenseSheet,
} from "@/hooks/useExpenses";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { CheckCircle2, XCircle, Receipt, Eye } from "lucide-react";
import Link from "next/link";
import { formatWeekLabel } from "@/components/timesheets/week-carousel";
import { cn } from "@/lib/utils";
import { formatExpenseTotal } from "@/lib/expenseLineTotals";
import type { ExpenseApprovalSummary } from "@/types/expense";

function approvalAmount(v: string | number): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

const STATUS_TABS = [
  { value: "SUBMITTED", label: "Submitted for Approval" },
  { value: "NOT_SUBMITTED_REOPENED", label: "Not Submitted / Reopened" },
  { value: "APPROVED", label: "Approved" },
  { value: "ALL", label: "All" },
] as const;

export default function ExpenseApprovalsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("SUBMITTED");
  const [employeeFilter, setEmployeeFilter] = useState<string>("");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<ExpenseApprovalSummary | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const { data: employeesData } = useExpenseManageableEmployees();
  const statusParam =
    statusFilter === "ALL" || statusFilter === "NOT_SUBMITTED_REOPENED"
      ? undefined
      : statusFilter;
  const { data, isLoading, error } = useApprovableExpenseSheets({
    status: statusParam,
    employee_id: employeeFilter || undefined,
    skip: 0,
    limit: 200,
  });

  const approveSheet = useApproveExpenseSheet();
  const rejectSheet = useRejectExpenseSheet();

  const items = data?.items ?? [];
  const employees =
    (employeesData?.items?.length ?? 0) > 0
      ? employeesData!.items
      : Array.from(
          new Map(
            items.map((row) => {
              const parts = (row.employee_name || "").trim().split(/\s+/);
              const first_name = parts[0] ?? "";
              const last_name = parts.slice(1).join(" ") ?? "";
              return [
                row.employee_id,
                { id: row.employee_id, first_name, last_name, email: "" },
              ] as const;
            })
          ).values()
        );

  const filteredItems =
    statusFilter === "NOT_SUBMITTED_REOPENED"
      ? items.filter((row) => row.status === "NOT_SUBMITTED" || row.status === "REOPENED")
      : statusFilter === "ALL"
        ? items
        : items;

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
            <p className="text-red-600">Error: {error instanceof Error ? error.message : String(error)}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pendingCount = items.filter((row) => row.status === "SUBMITTED").length;

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Receipt className="w-8 h-8" />
          Expense Approvals
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
            Filter by status and employee to find expense sheets you can view, edit, approve, or reject.
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
          <CardTitle>Expense sheets</CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            Use View to open a sheet. You can save, submit, approve, or reject on behalf of employees you manage.
          </p>
        </CardHeader>
        <CardContent>
          {filteredItems.length === 0 ? (
            <p className="text-gray-500 py-8 text-center">No expense sheets match the current filters.</p>
          ) : (
            <div className="space-y-4">
              {filteredItems.map((row) => (
                <div
                  key={row.id}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-lg hover:bg-gray-50 border-l-4",
                    row.status === "SUBMITTED" && "border-l-blue-500",
                    (row.status === "NOT_SUBMITTED" || row.status === "REOPENED") && "border-l-amber-500",
                    row.status === "APPROVED" && "border-l-green-500",
                    row.status === "INVOICED" && "border-l-slate-400"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/expenses?expense=${row.id}`}
                        className="font-medium hover:underline flex items-center gap-1"
                      >
                        {row.employee_name}
                        <Eye className="w-3.5 h-3.5 text-gray-500" />
                      </Link>
                      <Badge variant="outline">{formatWeekLabel(row.week_start_date)}</Badge>
                      <Badge
                        variant={
                          row.status === "SUBMITTED"
                            ? "default"
                            : row.status === "APPROVED"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {row.status}
                      </Badge>
                      <span className="text-sm text-gray-600">
                        Reimbursement: {row.reimbursement_currency} • Total:{" "}
                        {formatExpenseTotal(approvalAmount(row.total_amount))} • Billable:{" "}
                        {formatExpenseTotal(approvalAmount(row.total_billable))} • Reimburse:{" "}
                        {formatExpenseTotal(approvalAmount(row.total_reimbursement))}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {row.status === "SUBMITTED" && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => approveSheet.mutate({ sheetId: row.id })}
                          disabled={approveSheet.isPending}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRejectTarget(row);
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
                    <Link href={`/expenses?expense=${row.id}`}>
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
          if (!open) setRejectTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Expense Sheet</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 mb-2">The employee will see this note.</p>
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
                if (!rejectNote.trim() || !rejectTarget) return;
                rejectSheet.mutate(
                  { sheetId: rejectTarget.id, note: rejectNote.trim() },
                  {
                    onSuccess: () => {
                      setRejectDialogOpen(false);
                      setRejectTarget(null);
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
    </div>
  );
}

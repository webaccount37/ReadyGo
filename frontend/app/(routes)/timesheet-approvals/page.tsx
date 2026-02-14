"use client";

import { useTimesheetPendingApprovals, useApproveTimesheet, useRejectTimesheet } from "@/hooks/useTimesheets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import Link from "next/link";

function formatWeekLabel(weekStart: string): string {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export default function TimesheetApprovalsPage() {
  const { data, isLoading, error } = useTimesheetPendingApprovals({ skip: 0, limit: 100 });
  const approveTimesheet = useApproveTimesheet();
  const rejectTimesheet = useRejectTimesheet();

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p>Loading pending approvals...</p>
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

  const items = data?.items ?? [];

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Clock className="w-8 h-8" />
          Timesheet Approvals
        </h1>
        {items.length > 0 && (
          <Badge variant="secondary" className="text-sm">
            {items.length} pending
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending Timesheets</CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            Review and approve or reject timesheets from employees you manage.
          </p>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-gray-500 py-8 text-center">No timesheets pending approval.</p>
          ) : (
            <div className="space-y-4">
              {items.map((ts) => (
                <div
                  key={ts.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/timesheets?week=${ts.week_start_date}`} className="font-medium hover:underline">
                        {ts.employee_name}
                      </Link>
                      <Badge variant="outline">{formatWeekLabel(ts.week_start_date)}</Badge>
                      <span className="text-sm text-gray-600">{ts.total_hours} hours</span>
                    </div>
                    {ts.engagement_names?.length ? (
                      <p className="text-xs text-gray-500 mt-1">
                        {ts.engagement_names.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
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
                      onClick={() => rejectTimesheet.mutate(ts.id)}
                      disabled={rejectTimesheet.isPending}
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

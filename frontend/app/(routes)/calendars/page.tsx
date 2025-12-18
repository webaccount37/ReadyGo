"use client";

import { useState } from "react";
import {
  useCalendars,
  useCreateCalendar,
  useUpdateCalendar,
  useDeleteCalendar,
} from "@/hooks/useCalendars";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { CalendarForm } from "@/components/calendars/calendar-form";
import type { CalendarCreate, CalendarUpdate } from "@/types/calendar";

export default function CalendarsPage() {
  const [skip, setSkip] = useState(0);
  const [limit] = useState(10);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useCalendars({ skip, limit });
  const createCalendar = useCreateCalendar();
  const updateCalendar = useUpdateCalendar();
  const deleteCalendar = useDeleteCalendar();

  const handleCreate = async (data: CalendarCreate | CalendarUpdate) => {
    try {
      await createCalendar.mutateAsync(data as CalendarCreate);
      setIsCreateOpen(false);
      refetch();
    } catch (err) {
      console.error("Failed to create calendar entry:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUpdate = async (data: CalendarCreate | CalendarUpdate) => {
    if (!editingCalendar) return;
    try {
      await updateCalendar.mutateAsync({ id: editingCalendar, data: data as CalendarUpdate });
      setEditingCalendar(null);
      refetch();
    } catch (err) {
      console.error("Failed to update calendar entry:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this calendar entry?")) {
      try {
        await deleteCalendar.mutateAsync(id);
        refetch();
      } catch (err) {
        console.error("Failed to delete calendar entry:", err);
        alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const calendarToEdit = editingCalendar
    ? data?.items.find((c) => c.id === editingCalendar)
    : null;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Calendars</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Manage working days, holidays, and financial periods
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">+ Add Calendar Entry</Button>
      </div>

      {isLoading && <div className="text-gray-600">Loading calendar entries...</div>}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">
              Error: {error instanceof Error ? error.message : String(error)}
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Calendar Entries ({data?.total ?? 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.items && data.items.length > 0 ? (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3 font-semibold">Date</th>
                          <th className="text-left p-3 font-semibold">Holiday</th>
                          <th className="text-left p-3 font-semibold">Holiday Name</th>
                          <th className="text-left p-3 font-semibold">Working Hours</th>
                          <th className="text-left p-3 font-semibold">Financial Period</th>
                          <th className="text-left p-3 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((calendar) => (
                          <tr key={calendar.id} className="border-b hover:bg-gray-50">
                            <td className="p-3 font-medium">
                              {calendar.year}-{String(calendar.month).padStart(2, "0")}-{String(calendar.day).padStart(2, "0")}
                            </td>
                            <td className="p-3">
                              {calendar.is_holiday ? (
                                <span className="px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-800">
                                  Yes
                                </span>
                              ) : (
                                <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">
                                  No
                                </span>
                              )}
                            </td>
                            <td className="p-3">{calendar.holiday_name || "—"}</td>
                            <td className="p-3">{calendar.working_hours}h</td>
                            <td className="p-3">{calendar.financial_period || "—"}</td>
                            <td className="p-3">
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingCalendar(calendar.id)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDelete(calendar.id)}
                                >
                                  Delete
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-4">
                    {data.items.map((calendar) => (
                      <Card key={calendar.id}>
                        <CardContent className="pt-6">
                          <div className="space-y-3">
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                Date
                              </div>
                              <div className="text-sm font-medium">
                                {calendar.year}-{String(calendar.month).padStart(2, "0")}-{String(calendar.day).padStart(2, "0")}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Holiday
                                </div>
                                {calendar.is_holiday ? (
                                  <span className="px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-800">
                                    Yes
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">
                                    No
                                  </span>
                                )}
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Working Hours
                                </div>
                                <div className="text-sm">{calendar.working_hours}h</div>
                              </div>
                            </div>
                            {calendar.holiday_name && (
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Holiday Name
                                </div>
                                <div className="text-sm">{calendar.holiday_name}</div>
                              </div>
                            )}
                            {calendar.financial_period && (
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Financial Period
                                </div>
                                <div className="text-sm">{calendar.financial_period}</div>
                              </div>
                            )}
                            <div className="flex gap-2 pt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingCalendar(calendar.id)}
                                className="flex-1"
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDelete(calendar.id)}
                                className="flex-1"
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <p>No calendar entries found.</p>
                  <Button
                    className="mt-4"
                    onClick={() => setIsCreateOpen(true)}
                  >
                    Create First Calendar Entry
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {data && data.total > limit && (
            <div className="flex justify-center items-center gap-4 mt-4">
              <Button
                variant="outline"
                onClick={() => setSkip(Math.max(0, skip - limit))}
                disabled={skip === 0}
              >
                Previous
              </Button>
              <span className="text-sm text-gray-600">
                Page {Math.floor(skip / limit) + 1} of{" "}
                {Math.ceil(data.total / limit)}
              </span>
              <Button
                variant="outline"
                onClick={() => setSkip(skip + limit)}
                disabled={skip + limit >= data.total}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogHeader>
          <DialogTitle>Create New Calendar Entry</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <CalendarForm
            onSubmit={handleCreate}
            onCancel={() => setIsCreateOpen(false)}
            isLoading={createCalendar.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      {editingCalendar && calendarToEdit && (
        <Dialog
          open={!!editingCalendar}
          onOpenChange={(open) => !open && setEditingCalendar(null)}
        >
          <DialogHeader>
            <DialogTitle>Edit Calendar Entry</DialogTitle>
          </DialogHeader>
          <DialogContent>
            <CalendarForm
              initialData={calendarToEdit}
              onSubmit={handleUpdate}
              onCancel={() => setEditingCalendar(null)}
              isLoading={updateCalendar.isPending}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

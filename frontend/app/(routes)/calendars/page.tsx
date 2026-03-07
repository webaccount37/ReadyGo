"use client";

import { useState, useEffect, useMemo } from "react";
import {
  useCalendars,
  useCreateCalendar,
  useUpdateCalendar,
  useDeleteCalendar,
  useImportPublicHolidays,
} from "@/hooks/useCalendars";
import { useAuth } from "@/hooks/useAuth";
import { useEmployee } from "@/hooks/useEmployees";
import { useDeliveryCenters } from "@/hooks/useDeliveryCenters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { CalendarForm } from "@/components/calendars/calendar-form";
import { Select } from "@/components/ui/select";
import type { CalendarCreate, CalendarUpdate } from "@/types/calendar";

export default function CalendarsPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [deliveryCenterId, setDeliveryCenterId] = useState<string>("");
  const [skip, setSkip] = useState(0);
  const [limit] = useState(50);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<string | null>(null);

  const { user } = useAuth();
  const { data: employeeData } = useEmployee(user?.employee_id ?? "", false);
  const { data: deliveryCentersData } = useDeliveryCenters();
  const defaultDcId = useMemo(() => {
    if (!employeeData?.delivery_center || !deliveryCentersData?.items?.length) return deliveryCentersData?.items?.[0]?.id ?? "";
    const dc = deliveryCentersData.items.find((d) => d.code === employeeData.delivery_center);
    return dc?.id ?? deliveryCentersData.items[0]?.id ?? "";
  }, [employeeData?.delivery_center, deliveryCentersData?.items]);
  useEffect(() => {
    if (defaultDcId && !deliveryCenterId) setDeliveryCenterId(defaultDcId);
  }, [defaultDcId, deliveryCenterId]);

  const { data, isLoading, error, refetch } = useCalendars(
    { year, delivery_center_id: deliveryCenterId, skip, limit },
    { enabled: !!year && !!deliveryCenterId }
  );
  const createCalendar = useCreateCalendar();
  const updateCalendar = useUpdateCalendar();
  const deleteCalendar = useDeleteCalendar();
  const importHolidays = useImportPublicHolidays();

  const handleImportHolidays = async () => {
    if (!deliveryCenterId) {
      alert("Please select a delivery center first.");
      return;
    }
    try {
      await importHolidays.mutateAsync({ year, delivery_center_id: deliveryCenterId });
      refetch();
    } catch (err) {
      console.error("Failed to import holidays:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

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
            Manage holidays and calendar events by year and delivery center
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setIsCreateOpen(true)} disabled={!deliveryCenterId}>
            + Add Calendar Entry
          </Button>
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium mb-1">Year</label>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              >
                {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Delivery Center</label>
              <select
                value={deliveryCenterId}
                onChange={(e) => setDeliveryCenterId(e.target.value)}
                className="rounded border border-gray-300 px-3 py-2 text-sm min-w-[180px]"
              >
                <option value="">— Select —</option>
                {deliveryCentersData?.items?.map((dc) => (
                  <option key={dc.id} value={dc.id}>{dc.name}</option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              onClick={handleImportHolidays}
              disabled={!deliveryCenterId || importHolidays.isPending}
            >
              {importHolidays.isPending ? "Importing..." : "Import Public Holidays"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {!deliveryCenterId && (
        <p className="text-gray-600 mb-4">Select a year and delivery center to view calendar entries.</p>
      )}
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
                          <th className="text-left p-3 font-semibold">Name</th>
                          <th className="text-left p-3 font-semibold">Country Code</th>
                          <th className="text-left p-3 font-semibold">Hours</th>
                          <th className="text-left p-3 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((calendar) => (
                          <tr key={calendar.id} className="border-b hover:bg-gray-50">
                            <td className="p-3 font-medium">{calendar.date}</td>
                            <td className="p-3">{calendar.name || "—"}</td>
                            <td className="p-3">{calendar.country_code || "—"}</td>
                            <td className="p-3">{calendar.hours}h</td>
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
                              <div className="text-sm font-medium">{calendar.date}</div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                Name
                              </div>
                              <div className="text-sm">{calendar.name || "—"}</div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Country Code
                                </div>
                                <div className="text-sm">{calendar.country_code || "—"}</div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Hours
                                </div>
                                <div className="text-sm">{calendar.hours}h</div>
                              </div>
                            </div>
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
            year={year}
            deliveryCenterId={deliveryCenterId}
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
              year={year}
              deliveryCenterId={deliveryCenterId}
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

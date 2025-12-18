"use client";

import { useState } from "react";
import {
  useEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  useEmployee,
} from "@/hooks/useEmployees";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { EmployeeForm } from "@/components/employees/employee-form";
import { EmployeeRelationships } from "@/components/employees/employee-relationships";
import type { EmployeeCreate, EmployeeUpdate } from "@/types/employee";
import { Input } from "@/components/ui/input";
import { highlightText } from "@/lib/utils/highlight";
import { useMemo } from "react";

export default function EmployeesPage() {
  const [skip, setSkip] = useState(0);
  const [limit] = useState(10);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<string | null>(null);
  const [viewingEmployee, setViewingEmployee] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error, refetch } = useEmployees({ skip, limit });
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const deleteEmployee = useDeleteEmployee();

  const handleCreate = async (data: EmployeeCreate | EmployeeUpdate) => {
    try {
      await createEmployee.mutateAsync(data as EmployeeCreate);
      setIsCreateOpen(false);
      refetch();
    } catch (err) {
      console.error("Failed to create employee:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUpdate = async (data: EmployeeCreate | EmployeeUpdate) => {
    if (!editingEmployee) return;
    try {
      await updateEmployee.mutateAsync({ id: editingEmployee, data: data as EmployeeUpdate });
      refetch();
      refetchEmployee();
    } catch (err) {
      console.error("Failed to update employee:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      throw err; // Re-throw so the form knows the update failed
    }
  };

  const handleRelationshipsUpdate = async () => {
    // Refetch the employee with relationships to get updated data
    await refetchEmployee();
    // Also refetch the list to keep it in sync
    await refetch();
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this employee?")) {
      try {
        await deleteEmployee.mutateAsync(id);
        refetch();
      } catch (err) {
        console.error("Failed to delete employee:", err);
        alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const { data: employeeWithRelationships, refetch: refetchEmployee } = useEmployee(
    editingEmployee || "",
    true,
    { 
      enabled: !!editingEmployee,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
    }
  );

  const { data: viewingEmployeeWithRelationships } = useEmployee(
    viewingEmployee || "",
    true,
    { 
      enabled: !!viewingEmployee,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
    }
  );

  const filteredItems = useMemo(() => {
    if (!data?.items || !searchQuery.trim()) {
      return data?.items || [];
    }
    const query = searchQuery.toLowerCase();
    return data.items.filter((employee) => {
      const name = `${employee.first_name} ${employee.last_name}`.toLowerCase();
      const email = (employee.email || "").toLowerCase();
      const type = (employee.employee_type || "").toLowerCase();
      const status = (employee.status || "").toLowerCase();
      const role = (employee.role_title || "").toLowerCase();
      return (
        name.includes(query) ||
        email.includes(query) ||
        type.includes(query) ||
        status.includes(query) ||
        role.includes(query)
      );
    });
  }, [data, searchQuery]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Employees</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Manage your team members and their details
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">
          + Add Employee
        </Button>
      </div>

      {isLoading && <div className="text-gray-600">Loading employees...</div>}

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
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CardTitle>
                  Employees ({data?.total ?? 0})
                </CardTitle>
                <div className="w-full sm:w-64">
                  <Input
                    type="text"
                    placeholder="Search employees..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredItems.length > 0 ? (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-3 font-semibold">Name</th>
                            <th className="text-left p-3 font-semibold">Email</th>
                            <th className="text-left p-3 font-semibold">Type</th>
                            <th className="text-left p-3 font-semibold">Status</th>
                            <th className="text-left p-3 font-semibold">Role</th>
                            <th className="text-left p-3 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                        {filteredItems.map((employee) => (
                          <tr 
                            key={employee.id} 
                            className="border-b hover:bg-gray-50 cursor-pointer"
                            onClick={() => setViewingEmployee(employee.id)}
                          >
                            <td className="p-3">
                              {highlightText(`${employee.first_name} ${employee.last_name}`, searchQuery)}
                            </td>
                            <td className="p-3">{employee.email ? highlightText(employee.email, searchQuery) : "—"}</td>
                            <td className="p-3">
                              <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">
                                {highlightText(employee.employee_type, searchQuery)}
                              </span>
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-1 text-xs rounded ${
                                  employee.status === "active"
                                    ? "bg-green-100 text-green-800"
                                    : employee.status === "on-leave"
                                    ? "bg-yellow-100 text-yellow-800"
                                    : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {highlightText(employee.status, searchQuery)}
                              </span>
                            </td>
                            <td className="p-3">{employee.role_title ? highlightText(employee.role_title, searchQuery) : "—"}</td>
                            <td className="p-3">
                              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setViewingEmployee(employee.id)}
                                >
                                  View
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingEmployee(employee.id)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDelete(employee.id)}
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
                    {filteredItems.map((employee) => (
                      <Card 
                        key={employee.id}
                        className="cursor-pointer"
                        onClick={() => setViewingEmployee(employee.id)}
                      >
                        <CardContent className="pt-6">
                          <div className="space-y-3">
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                Name
                              </div>
                              <div className="text-sm font-medium">
                                {highlightText(`${employee.first_name} ${employee.last_name}`, searchQuery)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                Email
                              </div>
                              <div className="text-sm">{employee.email ? highlightText(employee.email, searchQuery) : "—"}</div>
                            </div>
                            <div className="flex gap-2">
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Type
                                </div>
                                <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">
                                  {highlightText(employee.employee_type, searchQuery)}
                                </span>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Status
                                </div>
                                <span
                                  className={`px-2 py-1 text-xs rounded ${
                                    employee.status === "active"
                                      ? "bg-green-100 text-green-800"
                                      : employee.status === "on-leave"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : "bg-gray-100 text-gray-800"
                                  }`}
                                >
                                  {highlightText(employee.status, searchQuery)}
                                </span>
                              </div>
                            </div>
                            {employee.role_title && (
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Role
                                </div>
                                <div className="text-sm">{highlightText(employee.role_title, searchQuery)}</div>
                              </div>
                            )}
                            <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setViewingEmployee(employee.id)}
                                className="flex-1"
                              >
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingEmployee(employee.id)}
                                className="flex-1"
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDelete(employee.id)}
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
                    <p>
                      {searchQuery.trim() 
                        ? `No employees found matching "${searchQuery}"` 
                        : "No employees found."}
                    </p>
                    {!searchQuery.trim() && (
                      <Button
                        className="mt-4"
                        onClick={() => setIsCreateOpen(true)}
                      >
                        Create First Employee
                      </Button>
                    )}
                  </div>
                )}
            </CardContent>
          </Card>

          {data && data.total > limit && !searchQuery.trim() && (
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
          <DialogTitle>Create New Employee</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <EmployeeForm
            onSubmit={async (data) => {
              await handleCreate(data);
            }}
            onCancel={() => setIsCreateOpen(false)}
            isLoading={createEmployee.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      {viewingEmployee && viewingEmployeeWithRelationships && (
        <Dialog
          open={!!viewingEmployee}
          onOpenChange={(open) => {
            if (!open) setViewingEmployee(null);
          }}
        >
          <DialogHeader>
            <DialogTitle>View Employee</DialogTitle>
          </DialogHeader>
          <DialogContent>
            <EmployeeForm
              initialData={viewingEmployeeWithRelationships}
              onSubmit={async () => {}}
              onCancel={() => setViewingEmployee(null)}
              isLoading={false}
              showRelationships={true}
              relationshipsComponent={
                <EmployeeRelationships
                  employee={viewingEmployeeWithRelationships}
                  onUpdate={handleRelationshipsUpdate}
                  readOnly={true}
                />
              }
              readOnly={true}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Dialog */}
      {editingEmployee && employeeWithRelationships && (
        <Dialog
          open={!!editingEmployee}
          onOpenChange={(open) => {
            if (!open) {
              setEditingEmployee(null);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
          </DialogHeader>
          <DialogContent>
            <EmployeeForm
              initialData={employeeWithRelationships}
              onSubmit={async (data) => {
                await handleUpdate(data);
                // Explicitly close the dialog after successful update
                setEditingEmployee(null);
              }}
              onCancel={() => setEditingEmployee(null)}
              isLoading={updateEmployee.isPending}
              showRelationships={true}
              relationshipsComponent={
                <EmployeeRelationships
                  employee={employeeWithRelationships}
                  onUpdate={handleRelationshipsUpdate}
                />
              }
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

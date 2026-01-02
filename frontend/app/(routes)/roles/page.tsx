"use client";

import { useState, useMemo } from "react";
import {
  useRoles,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
} from "@/hooks/useRoles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { RoleForm } from "@/components/roles/role-form";
import { Trash2 } from "lucide-react";
import type { RoleCreate, RoleUpdate } from "@/types/role";
import { Input } from "@/components/ui/input";
import { highlightText } from "@/lib/utils/highlight";

export default function RolesPage() {
  const [skip, setSkip] = useState(0);
  const [limit] = useState(10);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [viewingRole, setViewingRole] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error, refetch } = useRoles({ skip, limit });
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  const filteredItems = useMemo(() => {
    if (!data?.items || !searchQuery.trim()) {
      return data?.items || [];
    }
    const query = searchQuery.toLowerCase();
    return data.items.filter((role) => {
      const name = (role.role_name || "").toLowerCase();
      const status = (role.status || "").toLowerCase();
      const rates = role.role_rates?.map(r => 
        `${r.delivery_center_code} ${r.default_currency} ${r.internal_cost_rate} ${r.external_rate}`
      ).join(" ").toLowerCase() || "";
      return (
        name.includes(query) ||
        status.includes(query) ||
        rates.includes(query)
      );
    });
  }, [data, searchQuery]);

  const handleCreate = async (data: RoleCreate | RoleUpdate) => {
    try {
      await createRole.mutateAsync(data as RoleCreate);
      setIsCreateOpen(false);
      refetch();
    } catch (err) {
      console.error("Failed to create role:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUpdate = async (data: RoleCreate | RoleUpdate) => {
    if (!editingRole) return;
    try {
      await updateRole.mutateAsync({ id: editingRole, data: data as RoleUpdate });
      setEditingRole(null);
      refetch();
    } catch (err) {
      console.error("Failed to update role:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this role?")) {
      try {
        await deleteRole.mutateAsync(id);
        refetch();
      } catch (err) {
        console.error("Failed to delete role:", err);
        alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const roleToEdit = editingRole
    ? data?.items.find((r) => r.id === editingRole)
    : null;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Roles</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Manage job roles and their rates
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">+ Add Role</Button>
      </div>

      {isLoading && <div className="text-gray-600">Loading roles...</div>}

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
                <CardTitle>Roles ({data?.total ?? 0})</CardTitle>
                <div className="w-full sm:w-64">
                  <Input
                    type="text"
                    placeholder="Search roles..."
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
                            <th className="text-left p-3 font-semibold">Role Name</th>
                            <th className="text-left p-3 font-semibold">Rates</th>
                            <th className="text-left p-3 font-semibold">Status</th>
                            <th className="text-left p-3 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                        {filteredItems.map((role) => (
                          <tr 
                            key={role.id} 
                            className="border-b hover:bg-gray-50 cursor-pointer"
                            onClick={() => setViewingRole(role.id)}
                          >
                            <td className="p-3 font-medium">{highlightText(role.role_name, searchQuery)}</td>
                            <td className="p-3">
                              <div className="space-y-1">
                                {role.role_rates?.map((r) => (
                                  <div key={`${r.delivery_center_code}-${r.default_currency}`} className="text-sm">
                                    <span className="font-semibold">
                                      {highlightText(`${r.delivery_center_code.replace("-", " ")} (${r.default_currency})`, searchQuery)}
                                    </span>
                                    : ICR ${r.internal_cost_rate.toFixed(2)} / Ext ${r.external_rate.toFixed(2)}
                                  </div>
                                )) || "—"}
                              </div>
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-1 text-xs rounded ${
                                  role.status === "active"
                                    ? "bg-green-100 text-green-800"
                                    : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {highlightText(role.status, searchQuery)}
                              </span>
                            </td>
                            <td className="p-3">
                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setViewingRole(role.id)}
                            >
                              View
                            </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingRole(role.id)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDelete(role.id)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="w-4 h-4" />
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
                      {filteredItems.map((role) => (
                      <Card 
                        key={role.id}
                        className="cursor-pointer"
                        onClick={() => setViewingRole(role.id)}
                      >
                        <CardContent className="pt-6">
                          <div className="space-y-3">
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                Role Name
                              </div>
                              <div className="text-sm font-medium">{role.role_name}</div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Rates
                                </div>
                                <div className="text-sm space-y-1">
                                  {role.role_rates?.map((r) => (
                                    <div key={`${r.delivery_center_code}-${r.default_currency}`}>
                                      <span className="font-semibold">
                                        {r.delivery_center_code.replace("-", " ")} ({r.default_currency})
                                      </span>
                                      : ICR ${r.internal_cost_rate.toFixed(2)} / Ext ${r.external_rate.toFixed(2)}
                                    </div>
                                  )) || "—"}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Status
                                </div>
                                <span
                                  className={`px-2 py-1 text-xs rounded ${
                                    role.status === "active"
                                      ? "bg-green-100 text-green-800"
                                      : "bg-gray-100 text-gray-800"
                                  }`}
                                >
                                  {role.status}
                                </span>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                  Currency
                                </div>
                                <div className="text-sm">{role.default_currency}</div>
                              </div>
                            </div>
                            <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setViewingRole(role.id)}
                                className="flex-1"
                              >
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingRole(role.id)}
                                className="flex-1"
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDelete(role.id)}
                                className="flex-1 text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
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
                        ? `No roles found matching "${searchQuery}"` 
                        : "No roles found."}
                    </p>
                    {!searchQuery.trim() && (
                      <Button
                        className="mt-4"
                        onClick={() => setIsCreateOpen(true)}
                      >
                        Create First Role
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
          <DialogTitle>Create New Role</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <RoleForm
            onSubmit={handleCreate}
            onCancel={() => setIsCreateOpen(false)}
            isLoading={createRole.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      {editingRole && roleToEdit && (
        <Dialog
          open={!!editingRole}
          onOpenChange={(open) => !open && setEditingRole(null)}
        >
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
          </DialogHeader>
          <DialogContent>
            <RoleForm
              initialData={roleToEdit}
              onSubmit={handleUpdate}
              onCancel={() => setEditingRole(null)}
              isLoading={updateRole.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* View Dialog */}
      {viewingRole && (
        <Dialog
          open={!!viewingRole}
          onOpenChange={(open) => !open && setViewingRole(null)}
        >
          <DialogHeader>
            <DialogTitle>Role Details</DialogTitle>
          </DialogHeader>
          <DialogContent className="space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-semibold text-gray-800">Role</p>
                <p className="text-sm text-gray-700">
                  {data?.items.find((r) => r.id === viewingRole)?.role_name || "—"}
                </p>
              </div>
              <div>
                <span
                  className={`px-2 py-1 text-xs rounded ${
                    data?.items.find((r) => r.id === viewingRole)?.status === "active"
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {data?.items.find((r) => r.id === viewingRole)?.status || "—"}
                </span>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Delivery Center Rates</p>
              <div className="space-y-2">
                {data?.items
                  .find((r) => r.id === viewingRole)
                  ?.role_rates?.map((rate) => (
                    <div
                      key={`${rate.delivery_center_code}-${rate.default_currency}`}
                      className="flex justify-between text-sm"
                    >
                      <span className="font-medium">
                        {rate.delivery_center_code.replace("-", " ")} ({rate.default_currency})
                      </span>
                      <span>
                        ICR ${rate.internal_cost_rate.toFixed(2)} / Ext ${rate.external_rate.toFixed(2)}
                      </span>
                    </div>
                  )) || <p className="text-xs text-gray-500">No rates available.</p>}
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setViewingRole(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

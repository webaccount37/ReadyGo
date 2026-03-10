"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  useDeliveryCenters,
  useDeliveryCenter,
  useCreateDeliveryCenter,
  useUpdateDeliveryCenter,
  useDeleteDeliveryCenter,
} from "@/hooks/useDeliveryCenters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/dialog";
import { DeliveryCenterForm } from "@/components/delivery-centers/delivery-center-form";
import { DeliveryCenterApprovers } from "@/components/delivery-centers/delivery-center-approvers";
import { Trash2, Pencil, Eye } from "lucide-react";
import type { DeliveryCenterCreate, DeliveryCenterUpdate, DeliveryCenter } from "@/types/delivery-center";
import { Input } from "@/components/ui/input";
import { highlightText } from "@/lib/utils/highlight";
import Link from "next/link";

function DeliveryCentersPageContent() {
  const searchParams = useSearchParams();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDeliveryCenter, setEditingDeliveryCenter] = useState<string | null>(null);
  const [viewingDeliveryCenter, setViewingDeliveryCenter] = useState<DeliveryCenter | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Initialize search query from URL parameter
  useEffect(() => {
    const searchParam = searchParams.get("search");
    if (searchParam) {
      setSearchQuery(searchParam);
    }
  }, [searchParams]);

  const { data, isLoading, error, refetch } = useDeliveryCenters();
  const createDeliveryCenter = useCreateDeliveryCenter();
  const updateDeliveryCenter = useUpdateDeliveryCenter();
  const deleteDeliveryCenter = useDeleteDeliveryCenter();
  
  // Fetch delivery center with approvers for viewing/editing
  const { data: viewingDeliveryCenterData, refetch: refetchViewing } = useDeliveryCenter(
    viewingDeliveryCenter?.id || "",
    true, // include approvers
    { enabled: !!viewingDeliveryCenter }
  );
  
  const { data: editingDeliveryCenterData, refetch: refetchEditing } = useDeliveryCenter(
    editingDeliveryCenter || "",
    true, // include approvers
    { enabled: !!editingDeliveryCenter }
  );
  
  // Counts are now provided by the backend in the delivery center response
  const opportunityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (data?.items) {
      data.items.forEach((dc) => {
        counts[dc.id] = dc.opportunities_count ?? 0;
      });
    }
    return counts;
  }, [data]);
  
  const employeeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (data?.items) {
      data.items.forEach((dc) => {
        counts[dc.id] = dc.employees_count ?? 0;
      });
    }
    return counts;
  }, [data]);

  const filteredItems = useMemo(() => {
    if (!data?.items || !searchQuery.trim()) {
      return data?.items || [];
    }
    const query = searchQuery.toLowerCase();
    return data.items.filter((dc) => {
      const name = (dc.name || "").toLowerCase();
      const code = (dc.code || "").toLowerCase();
      const currency = (dc.default_currency || "").toLowerCase();
      const country = (dc.country_code || "").toLowerCase();
      return (
        name.includes(query) ||
        code.includes(query) ||
        currency.includes(query) ||
        country.includes(query)
      );
    });
  }, [data, searchQuery]);

  const handleCreate = async (data: DeliveryCenterCreate | DeliveryCenterUpdate) => {
    try {
      await createDeliveryCenter.mutateAsync(data as DeliveryCenterCreate);
      setIsCreateOpen(false);
      refetch();
    } catch (err) {
      console.error("Failed to create delivery center:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUpdate = async (data: DeliveryCenterCreate | DeliveryCenterUpdate) => {
    if (!editingDeliveryCenter) return;
    try {
      await updateDeliveryCenter.mutateAsync({ id: editingDeliveryCenter, data: data as DeliveryCenterUpdate });
      setEditingDeliveryCenter(null);
      refetch();
    } catch (err) {
      console.error("Failed to update delivery center:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this delivery center?")) {
      try {
        await deleteDeliveryCenter.mutateAsync(id);
        refetch();
      } catch (err) {
        console.error("Failed to delete delivery center:", err);
        alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const deliveryCenterToEdit = editingDeliveryCenterData || (editingDeliveryCenter
    ? data?.items.find((dc) => dc.id === editingDeliveryCenter)
    : null);
  
  const deliveryCenterToView = viewingDeliveryCenterData || viewingDeliveryCenter;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Delivery Centers</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Manage delivery centers and their configurations
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">+ Add Delivery Center</Button>
      </div>

      {isLoading && <div className="text-gray-600">Loading delivery centers...</div>}

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
            <CardHeader className="px-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CardTitle>Delivery Centers ({data?.total ?? 0})</CardTitle>
                <div className="w-full sm:w-64">
                  <Input
                    type="text"
                    placeholder="Search delivery centers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-2">
              {filteredItems.length > 0 ? (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block w-full overflow-hidden">
                      <table className="w-full text-xs table-fixed border-collapse">
                        <colgroup>
                          <col style={{ width: "22%" }} />
                          <col style={{ width: "10%" }} />
                          <col style={{ width: "10%" }} />
                          <col style={{ width: "12%" }} />
                          <col style={{ width: "10%" }} />
                          <col style={{ width: "10%" }} />
                          <col style={{ width: "16%" }} />
                        </colgroup>
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Delivery Center Name">Name</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Code">Code</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Country Code">Country</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Default Currency">Currency</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Opportunity Count">Opps</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Employee Count">Employees</th>
                            <th className="text-left p-1.5 font-semibold whitespace-nowrap" title="Actions">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                        {filteredItems.map((dc) => (
                          <tr 
                            key={dc.id} 
                            className="border-b hover:bg-gray-50 cursor-pointer"
                            onClick={() => setViewingDeliveryCenter(dc)}
                          >
                            <td className="p-1.5 font-medium text-xs overflow-hidden" title={dc.name}>
                              <span className="truncate block">{highlightText(dc.name, searchQuery)}</span>
                            </td>
                            <td className="p-1.5 overflow-hidden min-w-0">
                              <span className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-800 font-mono">
                                {highlightText(dc.code, searchQuery)}
                              </span>
                            </td>
                            <td className="p-1.5 overflow-hidden min-w-0">
                              {dc.country_code ? (
                                <span className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-800 font-mono uppercase">
                                  {highlightText(dc.country_code, searchQuery)}
                                </span>
                              ) : (
                                <span className="text-gray-500">—</span>
                              )}
                            </td>
                            <td className="p-1.5 overflow-hidden min-w-0">
                              <span className="px-2 py-0.5 text-xs rounded border border-gray-200 text-gray-700 bg-white">
                                {highlightText(dc.default_currency, searchQuery)}
                              </span>
                            </td>
                            <td className="p-1.5 text-xs overflow-hidden min-w-0" onClick={(e) => e.stopPropagation()}>
                              <Link
                                href={`/opportunities?search=${encodeURIComponent(dc.name)}`}
                                className="text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                {opportunityCounts[dc.id] ?? 0}
                              </Link>
                            </td>
                            <td className="p-1.5 text-xs overflow-hidden min-w-0" onClick={(e) => e.stopPropagation()}>
                              <Link
                                href={`/employees?search=${encodeURIComponent(dc.name)}`}
                                className="text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                {employeeCounts[dc.id] ?? 0}
                              </Link>
                            </td>
                            <td className="p-1 overflow-hidden min-w-0">
                              <div className="flex flex-nowrap gap-0.5 justify-start" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewingDeliveryCenter(dc);
                                  }}
                                  className="h-5 w-5 p-0 shrink-0"
                                  title="View"
                                >
                                  <Eye className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingDeliveryCenter(dc.id);
                                  }}
                                  className="h-5 w-5 p-0 shrink-0"
                                  title="Edit"
                                >
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(dc.id);
                                  }}
                                  className="h-5 w-5 p-0 shrink-0 text-red-600 hover:text-red-700"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3 h-3" />
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
                      {filteredItems.map((dc) => (
                      <Card 
                        key={dc.id}
                        className="cursor-pointer"
                        onClick={() => setViewingDeliveryCenter(dc)}
                      >
                        <CardContent className="pt-6">
                          <div className="space-y-3">
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                Name
                              </div>
                              <div className="text-sm font-medium">{highlightText(dc.name, searchQuery)}</div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                Code
                              </div>
                              <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800 font-mono">
                                {highlightText(dc.code, searchQuery)}
                              </span>
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                Country Code
                              </div>
                              {dc.country_code ? (
                                <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800 font-mono uppercase">
                                  {highlightText(dc.country_code, searchQuery)}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                Default Currency
                              </div>
                              <span className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-700 bg-white">
                                {highlightText(dc.default_currency, searchQuery)}
                              </span>
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                Opportunities
                              </div>
                              <Link
                                href={`/opportunities?search=${encodeURIComponent(dc.name)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-sm"
                              >
                                {opportunityCounts[dc.id] ?? 0}
                              </Link>
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                Employees
                              </div>
                              <Link
                                href={`/employees?search=${encodeURIComponent(dc.name)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-sm"
                              >
                                {employeeCounts[dc.id] ?? 0}
                              </Link>
                            </div>
                            <div className="flex flex-nowrap gap-0.5 justify-start pt-2" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setViewingDeliveryCenter(dc)}
                                className="h-5 w-5 p-0 shrink-0"
                                title="View"
                              >
                                <Eye className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingDeliveryCenter(dc.id)}
                                className="h-5 w-5 p-0 shrink-0"
                                title="Edit"
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDelete(dc.id)}
                                className="h-5 w-5 p-0 shrink-0 text-red-600 hover:text-red-700"
                                title="Delete"
                              >
                                <Trash2 className="w-3 h-3" />
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
                        ? `No delivery centers found matching "${searchQuery}"` 
                        : "No delivery centers found."}
                    </p>
                    {!searchQuery.trim() && (
                      <Button
                        className="mt-4"
                        onClick={() => setIsCreateOpen(true)}
                      >
                        Create First Delivery Center
                      </Button>
                    )}
                  </div>
                )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogHeader>
          <DialogTitle>Create New Delivery Center</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <DeliveryCenterForm
            onSubmit={handleCreate}
            onCancel={() => setIsCreateOpen(false)}
            isLoading={createDeliveryCenter.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      {viewingDeliveryCenter && deliveryCenterToView && (
        <Dialog
          open={!!viewingDeliveryCenter}
          onOpenChange={(open) => !open && setViewingDeliveryCenter(null)}
        >
          <DialogHeader>
            <DialogTitle>Delivery Center Details</DialogTitle>
          </DialogHeader>
          <DialogContent className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">Name</p>
              <p className="text-sm text-gray-700">
                {deliveryCenterToView.name}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Code</p>
              <p className="text-sm text-gray-700 font-mono">
                {deliveryCenterToView.code}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Country Code</p>
              <p className="text-sm text-gray-700 font-mono uppercase">
                {deliveryCenterToView.country_code ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Default Currency</p>
              <p className="text-sm text-gray-700">{deliveryCenterToView.default_currency}</p>
            </div>
            <div>
              <DeliveryCenterApprovers
                deliveryCenterId={deliveryCenterToView.id}
                readOnly={true}
              />
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setViewingDeliveryCenter(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Dialog */}
      {editingDeliveryCenter && deliveryCenterToEdit && (
        <Dialog
          open={!!editingDeliveryCenter}
          onOpenChange={(open) => !open && setEditingDeliveryCenter(null)}
        >
          <DialogHeader>
            <DialogTitle>Edit Delivery Center</DialogTitle>
          </DialogHeader>
          <DialogContent>
            <DeliveryCenterForm
              initialData={deliveryCenterToEdit}
              onSubmit={handleUpdate}
              onCancel={() => setEditingDeliveryCenter(null)}
              isLoading={updateDeliveryCenter.isPending}
            />
            <div className="mt-6 pt-6 border-t">
              <DeliveryCenterApprovers
                deliveryCenterId={deliveryCenterToEdit.id}
                readOnly={false}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default function DeliveryCentersPage() {
  return (
    <Suspense fallback={<div className="text-gray-600">Loading delivery centers...</div>}>
      <DeliveryCentersPageContent />
    </Suspense>
  );
}


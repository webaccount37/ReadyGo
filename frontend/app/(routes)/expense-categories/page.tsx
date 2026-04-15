"use client";

import { useState, useMemo } from "react";
import {
  useExpenseCategories,
  useCreateExpenseCategory,
  useUpdateExpenseCategory,
  useDeleteExpenseCategory,
} from "@/hooks/useExpenseCategories";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Pencil } from "lucide-react";
import type { ExpenseCategory } from "@/types/expense-category";
import { highlightText } from "@/lib/utils/highlight";

export default function ExpenseCategoriesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [createName, setCreateName] = useState("");
  const [editName, setEditName] = useState("");

  const { data, isLoading, error, refetch } = useExpenseCategories({ skip: 0, limit: 500 });
  const createCat = useCreateExpenseCategory();
  const updateCat = useUpdateExpenseCategory();
  const deleteCat = useDeleteExpenseCategory();

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((c) => c.name.toLowerCase().includes(q));
  }, [data?.items, searchQuery]);

  const openEdit = (c: ExpenseCategory) => {
    setEditing(c);
    setEditName(c.name);
  };

  const handleCreate = async () => {
    const name = createName.trim();
    if (!name) return;
    try {
      await createCat.mutateAsync({ name });
      setCreateName("");
      setIsCreateOpen(false);
      refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const handleUpdate = async () => {
    if (!editing) return;
    const name = editName.trim();
    if (!name) return;
    try {
      await updateCat.mutateAsync({ id: editing.id, data: { name } });
      setEditing(null);
      refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (c: ExpenseCategory) => {
    if (!confirm(`Delete category "${c.name}"?`)) return;
    try {
      await deleteCat.mutateAsync(c.id);
      refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Expense Categories</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Manage categories used on expense lines and financial forecasts
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">
          + Add category
        </Button>
      </div>

      <div className="mb-4">
        <Input
          placeholder="Search by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
      </div>

      {isLoading && <p className="text-gray-600">Loading...</p>}
      {error && (
        <Card className="border-red-200 bg-red-50 mb-4">
          <CardContent className="pt-6">
            <p className="text-red-800">{error instanceof Error ? error.message : String(error)}</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && (
        <Card>
          <CardHeader>
            <CardTitle>Categories ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <p className="text-gray-500 py-6 text-center">No categories found.</p>
            ) : (
              <ul className="divide-y">
                {filtered.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <span className="font-medium">{highlightText(c.name, searchQuery)}</span>
                      {c.in_use && (
                        <span className="ml-2 text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                          In use
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600"
                        onClick={() => void handleDelete(c)}
                        disabled={deleteCat.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New expense category</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="create-name">Name</Label>
            <Input
              id="create-name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Travel"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={createCat.isPending || !createName.trim()}>
              {createCat.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit category</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleUpdate()} disabled={updateCat.isPending || !editName.trim()}>
              {updateCat.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

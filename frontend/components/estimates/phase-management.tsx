"use client";

import { useState } from "react";
import { usePhases, useCreatePhase, useUpdatePhase, useDeletePhase } from "@/hooks/useEstimates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface PhaseManagementProps {
  estimateId: string;
}

export function PhaseManagement({ estimateId }: PhaseManagementProps) {
  const { data: phases = [], isLoading } = usePhases(estimateId);
  const createPhase = useCreatePhase();
  const updatePhase = useUpdatePhase();
  const deletePhase = useDeletePhase();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    start_date: "",
    end_date: "",
    color: "#3B82F6",
  });

  const handleAdd = () => {
    setIsAdding(true);
    setFormData({ name: "", start_date: "", end_date: "", color: "#3B82F6" });
  };

  const handleSave = async () => {
    if (!formData.name || !formData.start_date || !formData.end_date) {
      alert("Please fill in all required fields");
      return;
    }

    try {
      if (editingId) {
        await updatePhase.mutateAsync({
          estimateId,
          phaseId: editingId,
          data: formData,
        });
        setEditingId(null);
      } else {
        await createPhase.mutateAsync({
          estimateId,
          data: formData,
        });
        setIsAdding(false);
      }
      setFormData({ name: "", start_date: "", end_date: "", color: "#3B82F6" });
    } catch (error) {
      console.error("Failed to save phase:", error);
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({ name: "", start_date: "", end_date: "", color: "#3B82F6" });
  };

  const handleEdit = (phase: typeof phases[0]) => {
    setEditingId(phase.id);
    setFormData({
      name: phase.name,
      start_date: phase.start_date,
      end_date: phase.end_date,
      color: phase.color,
    });
  };

  const handleDelete = async (phaseId: string) => {
    if (!confirm("Are you sure you want to delete this phase?")) return;
    try {
      await deletePhase.mutateAsync({ estimateId, phaseId });
    } catch (error) {
      console.error("Failed to delete phase:", error);
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Phases</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Loading phases...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6 w-full max-w-full overflow-hidden">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Phases</CardTitle>
          {!isAdding && !editingId && (
            <Button onClick={handleAdd} size="sm">
              + Add Phase
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {phases.map((phase) => (
            <div
              key={phase.id}
              className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 p-3 border border-gray-200 rounded-md"
            >
              {editingId === phase.id ? (
                <>
                  <div className="flex items-center gap-2 flex-1 min-w-0 w-full sm:w-auto">
                    <div
                      className="w-8 h-8 rounded border border-gray-300 flex-shrink-0"
                      style={{ backgroundColor: formData.color }}
                    />
                    <Input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="Phase name"
                      className="flex-1 min-w-0"
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                    <Input
                      type="date"
                      value={formData.start_date}
                      onChange={(e) =>
                        setFormData({ ...formData, start_date: e.target.value })
                      }
                      className="w-full sm:w-40"
                    />
                    <Input
                      type="date"
                      value={formData.end_date}
                      onChange={(e) =>
                        setFormData({ ...formData, end_date: e.target.value })
                      }
                      className="w-full sm:w-40"
                    />
                    <Input
                      type="color"
                      value={formData.color}
                      onChange={(e) =>
                        setFormData({ ...formData, color: e.target.value })
                      }
                      className="w-16 h-10"
                    />
                    <Button onClick={handleSave} size="sm" variant="outline" className="flex-shrink-0">
                      Save
                    </Button>
                    <Button onClick={handleCancel} size="sm" variant="outline" className="flex-shrink-0">
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div
                      className="w-8 h-8 rounded border border-gray-300 flex-shrink-0"
                      style={{ backgroundColor: phase.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{phase.name}</div>
                      <div className="text-sm text-gray-500">
                        {new Date(phase.start_date).toLocaleDateString()} -{" "}
                        {new Date(phase.end_date).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto justify-end sm:justify-start">
                    <Button
                      onClick={() => handleEdit(phase)}
                      size="sm"
                      variant="outline"
                      className="flex-shrink-0"
                    >
                      Edit
                    </Button>
                    <Button
                      onClick={() => handleDelete(phase.id)}
                      size="sm"
                      variant="outline"
                      className="flex-shrink-0"
                    >
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}

          {isAdding && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 p-3 border border-gray-200 rounded-md bg-gray-50">
              <div className="flex items-center gap-2 flex-1 min-w-0 w-full sm:w-auto">
                <div
                  className="w-8 h-8 rounded border border-gray-300 flex-shrink-0"
                  style={{ backgroundColor: formData.color }}
                />
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Phase name"
                  className="flex-1 min-w-0"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) =>
                    setFormData({ ...formData, start_date: e.target.value })
                  }
                  placeholder="Start date"
                  className="w-full sm:w-40"
                />
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) =>
                    setFormData({ ...formData, end_date: e.target.value })
                  }
                  placeholder="End date"
                  className="w-full sm:w-40"
                />
                <Input
                  type="color"
                  value={formData.color}
                  onChange={(e) =>
                    setFormData({ ...formData, color: e.target.value })
                  }
                  className="w-16 h-10"
                />
                <Button onClick={handleSave} size="sm" variant="outline" className="flex-shrink-0">
                  Save
                </Button>
                <Button onClick={handleCancel} size="sm" variant="outline" className="flex-shrink-0">
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {phases.length === 0 && !isAdding && (
            <div className="text-center text-gray-500 py-8">
              No phases defined. Click &quot;Add Phase&quot; to create one.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


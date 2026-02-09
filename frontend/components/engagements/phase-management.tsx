"use client";

import { useState } from "react";
import { usePhases, useCreatePhase, useUpdatePhase, useDeletePhase } from "@/hooks/useEngagements";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface PhaseManagementProps {
  engagementId: string;
  readOnly?: boolean;
}

export function PhaseManagement({ engagementId, readOnly = false }: PhaseManagementProps) {
  const { data: phases = [], isLoading } = usePhases(engagementId);
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
          engagementId,
          phaseId: editingId,
          data: formData,
        });
        setEditingId(null);
      } else {
        await createPhase.mutateAsync({
          engagementId,
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
      await deletePhase.mutateAsync({ engagementId, phaseId });
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
    <Card className="mb-6">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Phases</CardTitle>
          {!readOnly && (
            <Button onClick={handleAdd} variant="outline" size="sm">
              Add Phase
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {phases.map((phase) => (
            <div
              key={phase.id}
              className="flex items-center gap-4 p-3 border rounded-lg"
              style={{ borderLeftColor: phase.color, borderLeftWidth: "4px" }}
            >
              {editingId === phase.id ? (
                <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-2">
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Phase name"
                    className="text-sm"
                  />
                  <Input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="text-sm"
                  />
                  <Input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="text-sm"
                  />
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="w-16 h-10"
                    />
                    <Button onClick={handleSave} size="sm" variant="default">
                      Save
                    </Button>
                    <Button onClick={handleCancel} size="sm" variant="outline">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1">
                    <div className="font-semibold">{phase.name}</div>
                    <div className="text-sm text-gray-600">
                      {new Date(phase.start_date).toLocaleDateString()} - {new Date(phase.end_date).toLocaleDateString()}
                    </div>
                  </div>
                  {!readOnly && (
                    <div className="flex gap-2">
                      <Button onClick={() => handleEdit(phase)} size="sm" variant="outline">
                        Edit
                      </Button>
                      <Button onClick={() => handleDelete(phase.id)} size="sm" variant="destructive">
                        Delete
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          {isAdding && (
            <div className="p-3 border rounded-lg border-dashed">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Phase name"
                  className="text-sm"
                />
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  placeholder="Start date"
                  className="text-sm"
                />
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  placeholder="End date"
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-16 h-10"
                  />
                  <Button onClick={handleSave} size="sm" variant="default">
                    Save
                  </Button>
                  <Button onClick={handleCancel} size="sm" variant="outline">
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

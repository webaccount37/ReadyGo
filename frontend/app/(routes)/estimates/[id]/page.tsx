"use client";

import { useParams } from "next/navigation";
import { useEstimateDetail, useCloneEstimate } from "@/hooks/useEstimates";
import { useRouter } from "next/navigation";
import { EstimateSpreadsheet } from "@/components/estimates/estimate-spreadsheet";
import { PhaseManagement } from "@/components/estimates/phase-management";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { useState } from "react";

export default function EstimateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const estimateId = params.id as string;
  const { data: estimate, isLoading, error } = useEstimateDetail(estimateId);
  const cloneEstimate = useCloneEstimate();
  const [isCloning, setIsCloning] = useState(false);

  const handleClone = async () => {
    const newName = prompt("Enter name for the cloned estimate:");
    if (!newName) return;

    setIsCloning(true);
    try {
      const cloned = await cloneEstimate.mutateAsync({
        estimateId,
        newName,
      });
      // Redirect to the new estimate
      router.push(`/estimates/${cloned.id}`);
    } catch (err) {
      console.error("Failed to clone estimate:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsCloning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p>Loading estimate...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !estimate) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-red-600">
              {error
                ? `Error loading estimate: ${error instanceof Error ? error.message : String(error)}`
                : "Estimate not found"}
            </p>
            <Link href="/estimates">
              <Button className="mt-4">Back to Estimates</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden min-w-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <Link href="/estimates" className="text-blue-600 hover:underline mb-2 inline-block">
            ← Back to Estimates
          </Link>
          <h1 className="text-3xl font-bold">{estimate.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Release: {estimate.release_name || estimate.release_id}
            {estimate.engagement_name && <> • Engagement: {estimate.engagement_name}</>}
          </p>
        </div>
        <div className="flex gap-2">
          <span
            className={`px-3 py-1 rounded text-sm ${
              estimate.status === "approved"
                ? "bg-green-100 text-green-800"
                : estimate.status === "submitted"
                ? "bg-blue-100 text-blue-800"
                : estimate.status === "rejected"
                ? "bg-red-100 text-red-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {estimate.status}
          </span>
          <Button onClick={handleClone} variant="outline" disabled={isCloning}>
            {isCloning ? "Cloning..." : "Clone Estimate"}
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Estimate Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-semibold">Currency:</span> {estimate.currency}
            </div>
            <div>
              <span className="font-semibold">Status:</span> {estimate.status}
            </div>
            {estimate.description && (
              <div className="col-span-2">
                <span className="font-semibold">Description:</span> {estimate.description}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <PhaseManagement estimateId={estimate.id} />

      <EstimateSpreadsheet estimate={estimate} />
    </div>
  );
}


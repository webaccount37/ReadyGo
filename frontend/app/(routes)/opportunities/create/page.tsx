"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { OpportunityForm } from "@/components/opportunities/opportunity-form";
import { useCreateOpportunity } from "@/hooks/useOpportunities";
import type { OpportunityCreate, OpportunityUpdate } from "@/types/opportunity";

export default function CreateOpportunityPage() {
  const router = useRouter();
  const createOpportunity = useCreateOpportunity();

  const handleCreate = async (data: OpportunityCreate | OpportunityUpdate) => {
    try {
      const created = await createOpportunity.mutateAsync(data as OpportunityCreate);
      router.push(`/opportunities/${created.id}`);
    } catch (err) {
      console.error("Failed to create opportunity:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCancel = () => {
    router.push("/opportunities");
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden min-w-0">
      <div className="mb-6">
        <Link href="/opportunities" className="text-blue-600 hover:underline mb-2 inline-block">
          ← Back to Opportunities
        </Link>
        <h1 className="text-3xl font-bold">Create New Opportunity</h1>
        <p className="text-sm text-gray-500 mt-1">
          Add a new opportunity to track deals and engagements
        </p>
      </div>

      <div className="bg-gradient-to-r from-slate-50 to-gray-50 rounded-lg border border-gray-200 p-6">
        <OpportunityForm
          onSubmit={handleCreate}
          onCancel={handleCancel}
          isLoading={createOpportunity.isPending}
        />
      </div>
    </div>
  );
}

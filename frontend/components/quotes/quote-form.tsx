"use client";

import { useState, useEffect } from "react";
import { useCreateQuote } from "@/hooks/useQuotes";
import { useOpportunity, useOpportunities } from "@/hooks/useOpportunities";
import { useEstimates } from "@/hooks/useEstimates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useRouter, useSearchParams } from "next/navigation";
import type { QuoteCreate } from "@/types/quote";

export function QuoteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createQuote = useCreateQuote();
  
  const opportunityIdParam = searchParams.get("opportunity_id");
  const [opportunityId, setOpportunityId] = useState<string>(opportunityIdParam || "");
  const [estimateId, setEstimateId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Fetch all opportunities for the dropdown
  const { data: opportunitiesData } = useOpportunities({ limit: 1000 });
  
  // Fetch selected opportunity to get its active estimate
  const { data: opportunity } = useOpportunity(opportunityId, false, { enabled: !!opportunityId });
  const { data: estimatesData } = useEstimates({
    opportunity_id: opportunityId,
    limit: 100,
  }, { enabled: !!opportunityId });

  // Set default estimate to active estimate when opportunity changes
  useEffect(() => {
    if (opportunityId && estimatesData?.items) {
      const activeEstimate = estimatesData.items.find((e) => e.active_version);
      if (activeEstimate) {
        setEstimateId(activeEstimate.id);
      } else {
        // Reset estimate if no active estimate found
        setEstimateId("");
      }
    } else {
      // Reset estimate if no opportunity selected
      setEstimateId("");
    }
  }, [opportunityId, estimatesData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!opportunityId || !estimateId) {
      alert("Please select an opportunity and estimate");
      return;
    }

    try {
      const quoteData: QuoteCreate = {
        opportunity_id: opportunityId,
        estimate_id: estimateId,
        notes: notes || undefined,
      };
      
      const quote = await createQuote.mutateAsync(quoteData);
      router.push(`/quotes/${quote.id}`);
    } catch (err) {
      console.error("Failed to create quote:", err);
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Quote</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="opportunity_id">Opportunity *</Label>
            <Select
              id="opportunity_id"
              value={opportunityId}
              onChange={(e) => setOpportunityId(e.target.value)}
              required
            >
              <option value="">Select an opportunity</option>
              {opportunitiesData?.items?.map((opp) => (
                <option key={opp.id} value={opp.id}>
                  {opp.name}
                  {opp.account_name && ` - ${opp.account_name}`}
                </option>
              ))}
            </Select>
            {opportunity && (
              <p className="text-sm text-gray-500 mt-1">
                {opportunity.account_name && `Account: ${opportunity.account_name}`}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="estimate_id">Estimate *</Label>
            {(() => {
              const activeEstimate = estimatesData?.items?.find((e) => e.active_version);
              
              if (!opportunityId) {
                return (
                  <select
                    id="estimate_id"
                    disabled
                    className="w-full border rounded px-3 py-2 bg-gray-100"
                  >
                    <option value="">Select an opportunity first</option>
                  </select>
                );
              }
              
              if (!activeEstimate) {
                return (
                  <>
                    <select
                      id="estimate_id"
                      disabled
                      className="w-full border rounded px-3 py-2 bg-gray-100"
                    >
                      <option value="">No active estimate found</option>
                    </select>
                    <p className="text-sm text-red-500 mt-1">
                      This opportunity does not have an active estimate. Please set an active estimate before creating a quote.
                    </p>
                  </>
                );
              }
              
              return (
                <>
                  <select
                    id="estimate_id"
                    value={estimateId}
                    onChange={(e) => setEstimateId(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    required
                  >
                    <option value={activeEstimate.id}>
                      {activeEstimate.name} (Active)
                    </option>
                  </select>
                  <p className="text-sm text-gray-500 mt-1">
                    Only the active estimate can be used to create a quote.
                  </p>
                </>
              );
            })()}
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border rounded px-3 py-2"
              rows={4}
              placeholder="Optional notes about this quote"
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={createQuote.isPending || !opportunityId || !estimateId}
            >
              {createQuote.isPending ? "Creating..." : "Create Quote"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}


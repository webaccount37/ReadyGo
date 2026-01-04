"use client";

import { useState, useEffect } from "react";
import { useCreateQuote } from "@/hooks/useQuotes";
import { useEngagement, useEngagements } from "@/hooks/useEngagements";
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
  
  const engagementIdParam = searchParams.get("engagement_id");
  const [engagementId, setEngagementId] = useState<string>(engagementIdParam || "");
  const [estimateId, setEstimateId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Fetch all engagements for the dropdown
  const { data: engagementsData } = useEngagements({ limit: 1000 });
  
  // Fetch selected engagement to get its active estimate
  const { data: engagement } = useEngagement(engagementId, false, { enabled: !!engagementId });
  const { data: estimatesData } = useEstimates({
    engagement_id: engagementId,
    limit: 100,
  }, { enabled: !!engagementId });

  // Set default estimate to active estimate when engagement changes
  useEffect(() => {
    if (engagementId && estimatesData?.items) {
      const activeEstimate = estimatesData.items.find((e) => e.active_version);
      if (activeEstimate) {
        setEstimateId(activeEstimate.id);
      } else {
        // Reset estimate if no active estimate found
        setEstimateId("");
      }
    } else {
      // Reset estimate if no engagement selected
      setEstimateId("");
    }
  }, [engagementId, estimatesData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!engagementId || !estimateId) {
      alert("Please select an engagement and estimate");
      return;
    }

    try {
      const quoteData: QuoteCreate = {
        engagement_id: engagementId,
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
            <Label htmlFor="engagement_id">Engagement *</Label>
            <Select
              id="engagement_id"
              value={engagementId}
              onChange={(e) => setEngagementId(e.target.value)}
              required
            >
              <option value="">Select an engagement</option>
              {engagementsData?.items?.map((eng) => (
                <option key={eng.id} value={eng.id}>
                  {eng.name}
                  {eng.opportunity_name && ` - ${eng.opportunity_name}`}
                </option>
              ))}
            </Select>
            {engagement && (
              <p className="text-sm text-gray-500 mt-1">
                {engagement.opportunity_name && `Opportunity: ${engagement.opportunity_name}`}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="estimate_id">Estimate *</Label>
            {(() => {
              const activeEstimate = estimatesData?.items?.find((e) => e.active_version);
              
              if (!engagementId) {
                return (
                  <select
                    id="estimate_id"
                    disabled
                    className="w-full border rounded px-3 py-2 bg-gray-100"
                  >
                    <option value="">Select an engagement first</option>
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
                      This engagement does not have an active estimate. Please set an active estimate before creating a quote.
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
              disabled={createQuote.isPending || !engagementId || !estimateId}
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

